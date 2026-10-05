const { newId, now } = require('./lib/util');

// Data access for connections, pipelines, runs and logs. API objects are
// camelCase; the SQLite schema is snake_case.

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

const mapConnection = (r) => r && ({
  id: r.id, name: r.name, type: r.type, config: parse(r.config, {}), createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapPipeline = (r) => r && ({
  id: r.id,
  name: r.name,
  description: r.description,
  sourceConnectionId: r.source_connection_id,
  sourceStream: r.source_stream,
  destConnectionId: r.dest_connection_id,
  destTarget: r.dest_target,
  writeMode: r.write_mode,
  upsertKey: r.upsert_key,
  transforms: parse(r.transforms, []),
  batchSize: r.batch_size,
  maxRetries: r.max_retries,
  scheduleIntervalSec: r.schedule_interval_sec,
  enabled: !!r.enabled,
  lastScheduledAt: r.last_scheduled_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapRun = (r) => r && ({
  id: r.id,
  pipelineId: r.pipeline_id,
  pipelineName: r.pipeline_name,
  status: r.status,
  trigger: r.trigger,
  attempt: r.attempt,
  maxAttempts: r.max_attempts,
  rowsRead: r.rows_read,
  rowsWritten: r.rows_written,
  rowsFiltered: r.rows_filtered,
  batches: r.batches,
  rowsTotal: r.rows_total,
  error: r.error,
  queuedAt: r.queued_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  nextAttemptAt: r.next_attempt_at,
  // Bumped on every change so clients can drop updates that arrive out of order.
  version: r.version,
});

const RUN_COLUMNS = {
  status: 'status', attempt: 'attempt', rowsRead: 'rows_read', rowsWritten: 'rows_written', rowsFiltered: 'rows_filtered',
  batches: 'batches', rowsTotal: 'rows_total', error: 'error', startedAt: 'started_at', finishedAt: 'finished_at', nextAttemptAt: 'next_attempt_at',
};

const PIPELINE_COLUMNS = {
  name: 'name', description: 'description', sourceConnectionId: 'source_connection_id', sourceStream: 'source_stream',
  destConnectionId: 'dest_connection_id', destTarget: 'dest_target', writeMode: 'write_mode', upsertKey: 'upsert_key',
  transforms: 'transforms', batchSize: 'batch_size', maxRetries: 'max_retries', scheduleIntervalSec: 'schedule_interval_sec',
  enabled: 'enabled', lastScheduledAt: 'last_scheduled_at',
};

const RUN_SELECT = 'SELECT runs.*, pipelines.name AS pipeline_name FROM runs JOIN pipelines ON pipelines.id = runs.pipeline_id';

function toDb(columns, patch) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(columns)) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (key === 'transforms') v = JSON.stringify(v ?? []);
    if (key === 'enabled') v = v ? 1 : 0;
    if (v === undefined) v = null;
    sets.push(`${col} = ?`);
    values.push(v);
  }
  return { sets, values };
}

function createStore(db) {
  return {
    db,

    // Connections
    listConnections: () => db.prepare('SELECT * FROM connections ORDER BY created_at DESC').all().map(mapConnection),
    getConnection: (id) => mapConnection(db.prepare('SELECT * FROM connections WHERE id = ?').get(id)),
    createConnection({ name, type, config }) {
      const id = newId('conn');
      const ts = now();
      db.prepare('INSERT INTO connections (id, name, type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, type, JSON.stringify(config || {}), ts, ts);
      return this.getConnection(id);
    },
    updateConnection(id, { name, config }) {
      db.prepare('UPDATE connections SET name = ?, config = ?, updated_at = ? WHERE id = ?').run(name, JSON.stringify(config || {}), now(), id);
      return this.getConnection(id);
    },
    deleteConnection: (id) => db.prepare('DELETE FROM connections WHERE id = ?').run(id),
    pipelinesUsingConnection: (id) => db.prepare('SELECT id, name FROM pipelines WHERE source_connection_id = ? OR dest_connection_id = ?').all(id, id),

    // Pipelines
    listPipelines() {
      const rows = db.prepare('SELECT * FROM pipelines ORDER BY created_at DESC').all().map(mapPipeline);
      const last = db.prepare(`${RUN_SELECT} WHERE runs.pipeline_id = ? ORDER BY runs.queued_at DESC LIMIT 1`);
      const counts = db.prepare("SELECT COUNT(*) AS total, SUM(status = 'succeeded') AS ok FROM runs WHERE pipeline_id = ?");
      return rows.map((p) => {
        const c = counts.get(p.id);
        return { ...p, lastRun: mapRun(last.get(p.id)) || null, runCount: c.total, successCount: c.ok || 0 };
      });
    },
    getPipeline: (id) => mapPipeline(db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id)),
    createPipeline(p) {
      const id = newId('pl');
      const ts = now();
      db.prepare(`INSERT INTO pipelines (id, name, description, source_connection_id, source_stream, dest_connection_id, dest_target,
        write_mode, upsert_key, transforms, batch_size, max_retries, schedule_interval_sec, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, p.name, p.description || '', p.sourceConnectionId, p.sourceStream, p.destConnectionId, p.destTarget,
        p.writeMode || 'append', p.upsertKey || null, JSON.stringify(p.transforms || []), p.batchSize || 500,
        p.maxRetries ?? 2, p.scheduleIntervalSec || null, p.enabled === false ? 0 : 1, ts, ts,
      );
      return this.getPipeline(id);
    },
    updatePipeline(id, patch) {
      const { sets, values } = toDb(PIPELINE_COLUMNS, patch);
      if (sets.length) db.prepare(`UPDATE pipelines SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
      return this.getPipeline(id);
    },
    deletePipeline(id) {
      db.prepare('DELETE FROM run_logs WHERE run_id IN (SELECT id FROM runs WHERE pipeline_id = ?)').run(id);
      db.prepare('DELETE FROM runs WHERE pipeline_id = ?').run(id);
      db.prepare('DELETE FROM pipelines WHERE id = ?').run(id);
    },

    // Runs
    createRun({ pipelineId, trigger, maxAttempts }) {
      const id = newId('run');
      db.prepare('INSERT INTO runs (id, pipeline_id, status, trigger, attempt, max_attempts, queued_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .run(id, pipelineId, 'queued', trigger, maxAttempts, now());
      return this.getRun(id);
    },
    getRun: (id) => mapRun(db.prepare(`${RUN_SELECT} WHERE runs.id = ?`).get(id)),
    listRuns({ status, pipelineId, limit = 50 } = {}) {
      const where = [];
      const params = [];
      if (status) { where.push(`runs.status IN (${status.split(',').map(() => '?').join(',')})`); params.push(...status.split(',')); }
      if (pipelineId) { where.push('runs.pipeline_id = ?'); params.push(pipelineId); }
      const sql = `${RUN_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY runs.queued_at DESC, runs.rowid DESC LIMIT ?`;
      return db.prepare(sql).all(...params, Math.min(Number(limit) || 50, 500)).map(mapRun);
    },
    updateRun(id, patch) {
      const { sets, values } = toDb(RUN_COLUMNS, patch);
      if (sets.length) db.prepare(`UPDATE runs SET ${sets.join(', ')}, version = version + 1 WHERE id = ?`).run(...values, id);
      return this.getRun(id);
    },
    // Atomically move the oldest due run to "running". Returns null if none is due.
    claimNextRun(excludePipelineIds = []) {
      const ts = now();
      const exclude = excludePipelineIds.length ? `AND pipeline_id NOT IN (${excludePipelineIds.map(() => '?').join(',')})` : '';
      const row = db.prepare(`SELECT id FROM runs WHERE status IN ('queued', 'retrying') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ${exclude}
        ORDER BY COALESCE(next_attempt_at, queued_at), rowid LIMIT 1`).get(ts, ...excludePipelineIds);
      if (!row) return null;
      const res = db.prepare("UPDATE runs SET status = 'running', version = version + 1, started_at = ?, finished_at = NULL, next_attempt_at = NULL, error = NULL WHERE id = ? AND status IN ('queued', 'retrying')").run(ts, row.id);
      return res.changes ? this.getRun(row.id) : null;
    },
    nextRetryAt() {
      return db.prepare("SELECT MIN(next_attempt_at) AS t FROM runs WHERE status = 'retrying'").get().t;
    },
    activeRunForPipeline: (pipelineId) => db.prepare("SELECT id FROM runs WHERE pipeline_id = ? AND status IN ('queued', 'retrying', 'running') LIMIT 1").get(pipelineId),
    recoverInterruptedRuns() {
      const rows = db.prepare("SELECT id FROM runs WHERE status = 'running'").all();
      db.prepare("UPDATE runs SET status = 'queued', version = version + 1, started_at = NULL, rows_read = 0, rows_written = 0, rows_filtered = 0, batches = 0 WHERE status = 'running'").run();
      return rows.map((r) => r.id);
    },

    // Logs
    appendLog(runId, level, message) {
      const ts = now();
      const res = db.prepare('INSERT INTO run_logs (run_id, ts, level, message) VALUES (?, ?, ?, ?)').run(runId, ts, level, message);
      return { id: Number(res.lastInsertRowid), runId, ts, level, message };
    },
    listLogs: (runId, afterId = 0) => db.prepare('SELECT id, run_id AS runId, ts, level, message FROM run_logs WHERE run_id = ? AND id > ? ORDER BY id LIMIT 2000').all(runId, afterId),

    // Settings
    getSetting(key, fallback) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? parse(row.value, fallback) : fallback;
    },
    setSetting(key, value) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
    },

    // Dashboard
    stats({ days = 14 } = {}) {
      const since = new Date(Date.now() - days * 86400_000);
      since.setUTCHours(0, 0, 0, 0);
      const totals = db.prepare(`SELECT COUNT(*) AS runs, SUM(status = 'succeeded') AS succeeded, SUM(status = 'failed') AS failed,
        SUM(status IN ('running')) AS running, SUM(status IN ('queued', 'retrying')) AS queued, SUM(rows_written) AS rows_written
        FROM runs WHERE queued_at >= ?`).get(since.toISOString());
      const daily = db.prepare(`SELECT substr(queued_at, 1, 10) AS day, SUM(status = 'succeeded') AS succeeded, SUM(status = 'failed') AS failed,
        SUM(status NOT IN ('succeeded', 'failed')) AS other, SUM(rows_written) AS rows_written
        FROM runs WHERE queued_at >= ? GROUP BY day ORDER BY day`).all(since.toISOString());
      const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
      const series = [];
      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
        const d = byDay[day] || {};
        series.push({ day, succeeded: d.succeeded || 0, failed: d.failed || 0, other: d.other || 0, rowsWritten: d.rows_written || 0 });
      }
      const finished = (totals.succeeded || 0) + (totals.failed || 0);
      const durations = db.prepare(`SELECT AVG((julianday(finished_at) - julianday(started_at)) * 86400000) AS ms FROM runs
        WHERE status = 'succeeded' AND queued_at >= ?`).get(since.toISOString());
      return {
        windowDays: days,
        runs: totals.runs || 0,
        succeeded: totals.succeeded || 0,
        failed: totals.failed || 0,
        running: totals.running || 0,
        queued: totals.queued || 0,
        rowsWritten: totals.rows_written || 0,
        successRate: finished ? (totals.succeeded || 0) / finished : null,
        avgDurationMs: durations.ms ? Math.round(durations.ms) : null,
        pipelines: db.prepare('SELECT COUNT(*) AS n FROM pipelines').get().n,
        scheduledPipelines: db.prepare('SELECT COUNT(*) AS n FROM pipelines WHERE enabled = 1 AND schedule_interval_sec IS NOT NULL').get().n,
        connections: db.prepare('SELECT COUNT(*) AS n FROM connections').get().n,
        series,
      };
    },
  };
}

module.exports = { createStore };
