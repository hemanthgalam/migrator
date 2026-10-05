#!/usr/bin/env node
// Load test: boots the real API server in a child process for each worker
// concurrency level, creates M pipelines through the HTTP API, enqueues one
// run per pipeline at the same moment, and waits for the queue to drain.
// Throughput, queue latency and peak concurrency come from the run records the
// server itself writes, so the numbers match what the console shows.
//
//   node scripts/loadtest.js --scenario csv --pipelines 32 --rows 100000 --concurrency 1,2,4,8,16
//   PG_URL=postgres://postgres@localhost:5433/postgres node scripts/loadtest.js --scenario postgres
//
// Scenarios:
//   csv       sample dataset -> 5 transforms -> CSV file (per pipeline)
//   postgres  Postgres table -> 3 transforms -> Postgres table (per pipeline)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));

const scenario = args.scenario || 'csv';
const pipelines = Number(args.pipelines || 32);
const rows = Number(args.rows || 100000);
const batchSize = Number(args.batch || 1000);
const levels = String(args.concurrency || '1,2,4,8,16').split(',').map(Number);
const basePort = Number(args.port || 3900);
const outFile = args.out;
const ROOT = path.join(__dirname, '..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const fmt = (n) => Math.round(n).toLocaleString('en-US');

async function api(port, method, url, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api${url}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function pgConfig() {
  const u = new URL(process.env.PG_URL || 'postgres://postgres@localhost:5432/postgres');
  return { host: u.hostname, port: u.port || '5432', database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), ssl: 'false' };
}

async function withPg(fn) {
  const { Client } = require('pg');
  const c = pgConfig();
  const client = new Client({ ...c, port: Number(c.port), ssl: undefined });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

// One shared source table, one destination table per pipeline (a pipeline
// never runs twice at once, so separate targets keep runs independent).
async function preparePostgres() {
  await withPg(async (db) => {
    await db.query('DROP TABLE IF EXISTS lt_source');
    await db.query(`CREATE TABLE lt_source (id int PRIMARY KEY, email text, country text, plan text, mrr numeric(10,2), is_active boolean, signup_at timestamptz)`);
    await db.query(`INSERT INTO lt_source SELECT g, 'user' || g || '@example.com', (ARRAY['US','GB','DE','IN','BR','JP'])[1 + g % 6],
      (ARRAY['free','starter','growth','enterprise'])[1 + g % 4], (g % 50000) / 100.0, g % 7 <> 0, timestamptz '2026-01-01' + g * interval '1 minute'
      FROM generate_series(1, $1) g`, [rows]);
    for (let i = 0; i < pipelines; i++) {
      await db.query(`DROP TABLE IF EXISTS lt_dest_${i}`);
      await db.query(`CREATE TABLE lt_dest_${i} (id int PRIMARY KEY, email text, country text, plan text, mrr numeric(10,2), signup_at timestamptz)`);
    }
  });
}

async function setup(port) {
  if (scenario === 'csv') {
    const src = await api(port, 'POST', '/connections', { name: 'Load source', type: 'sample', config: { rowsPerStream: rows, latencyMs: 0, failAfterRows: 0 } });
    const dst = await api(port, 'POST', '/connections', { name: 'Load sink', type: 'filesystem', config: { format: 'csv' } });
    const transforms = [
      { type: 'filter', field: 'is_active', op: 'eq', value: 'true' },
      { type: 'derive', field: 'full_name', template: '{first_name} {last_name}' },
      { type: 'mask', field: 'email', strategy: 'email' },
      { type: 'cast', field: 'mrr', to: 'number' },
      { type: 'select', fields: ['id', 'full_name', 'email', 'country', 'plan', 'mrr', 'signup_at'] },
    ];
    return Promise.all(Array.from({ length: pipelines }, (_, i) => api(port, 'POST', '/pipelines', {
      name: `Load ${i}`, sourceConnectionId: src.id, sourceStream: 'customers', destConnectionId: dst.id,
      destTarget: `out_${i}`, writeMode: 'overwrite', batchSize, maxRetries: 0, transforms,
    })));
  }
  if (scenario === 'postgres') {
    const conn = await api(port, 'POST', '/connections', { name: 'Postgres', type: 'postgres', config: pgConfig() });
    const transforms = [
      { type: 'filter', field: 'is_active', op: 'eq', value: 'true' },
      { type: 'mask', field: 'email', strategy: 'email' },
      { type: 'select', fields: ['id', 'email', 'country', 'plan', 'mrr', 'signup_at'] },
    ];
    return Promise.all(Array.from({ length: pipelines }, (_, i) => api(port, 'POST', '/pipelines', {
      name: `Load ${i}`, sourceConnectionId: conn.id, sourceStream: 'lt_source', destConnectionId: conn.id,
      destTarget: `lt_dest_${i}`, writeMode: 'overwrite', batchSize, maxRetries: 0, transforms,
    })));
  }
  throw new Error(`Unknown scenario "${scenario}"`);
}

function peakRssMb(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmHWM:\s+(\d+)/);
    return m ? Number(m[1]) / 1024 : null;
  } catch { return null; }
}

function cpuSeconds(pid) {
  try {
    const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return (Number(f[11]) + Number(f[12])) / 100; // utime + stime in USER_HZ ticks
  } catch { return null; }
}

async function runLevel(concurrency, port) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-lt-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, WORKER_CONCURRENCY: String(concurrency), SEED_DEMO: 'false', SCHEDULER_INTERVAL_MS: '600000' },
  });
  try {
    for (let i = 0; ; i++) {
      try { await api(port, 'GET', '/health'); break; } catch { if (i > 100) throw new Error('Server did not start'); await sleep(100); }
    }
    // The setting persists in the DB, so set it explicitly as well.
    await api(port, 'PUT', '/settings', { concurrency });
    const list = await setup(port);
    const cpuBefore = cpuSeconds(child.pid);

    const t0 = Date.now();
    await Promise.all(list.map((p) => api(port, 'POST', `/pipelines/${p.id}/runs`)));
    let runs;
    for (;;) {
      await sleep(100);
      runs = await api(port, 'GET', `/runs?limit=500`);
      if (runs.length >= pipelines && runs.every((r) => ['succeeded', 'failed', 'cancelled'].includes(r.status))) break;
    }
    const wallMs = Date.now() - t0;
    const cpu = cpuSeconds(child.pid) - cpuBefore;

    const failed = runs.filter((r) => r.status !== 'succeeded');
    if (failed.length) console.error(`  ${failed.length} run(s) did not succeed: ${failed[0].error}`);
    const ts = (s) => new Date(s).getTime();
    const firstQueued = Math.min(...runs.map((r) => ts(r.queuedAt)));
    const lastFinished = Math.max(...runs.map((r) => ts(r.finishedAt)));
    const engineMs = lastFinished - firstQueued;
    const rowsRead = runs.reduce((s, r) => s + r.rowsRead, 0);
    const rowsWritten = runs.reduce((s, r) => s + r.rowsWritten, 0);
    const waits = runs.map((r) => ts(r.startedAt) - ts(r.queuedAt)).sort((a, b) => a - b);
    const durations = runs.map((r) => ts(r.finishedAt) - ts(r.startedAt)).sort((a, b) => a - b);
    // Sweep start/finish events to find how many runs were executing at once.
    const events = runs.flatMap((r) => [[ts(r.startedAt), 1], [ts(r.finishedAt), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let live = 0; let peak = 0;
    for (const [, d] of events) { live += d; peak = Math.max(peak, live); }

    return {
      scenario, concurrency, pipelines, rowsPerPipeline: rows, batchSize,
      succeeded: runs.length - failed.length, rowsRead, rowsWritten,
      wallSec: engineMs / 1000, pollWallSec: wallMs / 1000,
      rowsPerSec: rowsRead / (engineMs / 1000), writtenPerSec: rowsWritten / (engineMs / 1000),
      peakConcurrentRuns: peak,
      queueWaitMs: { p50: pct(waits, 50), p95: pct(waits, 95), max: waits[waits.length - 1] },
      runDurationMs: { p50: pct(durations, 50), p95: pct(durations, 95) },
      serverCpuSec: cpu, peakRssMb: peakRssMb(child.pid),
    };
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log(`Machine: ${os.cpus()[0].model}, ${os.cpus().length} vCPU, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM, Node ${process.version}`);
  console.log(`Scenario ${scenario}: ${pipelines} pipelines x ${fmt(rows)} rows, batch ${batchSize}\n`);
  if (scenario === 'postgres') await preparePostgres();
  const results = [];
  for (const [i, c] of levels.entries()) {
    const r = await runLevel(c, basePort + i);
    results.push(r);
    console.log(`workers=${String(c).padStart(2)}  peak=${String(r.peakConcurrentRuns).padStart(2)}  rows=${fmt(r.rowsRead)}  ${r.wallSec.toFixed(2)}s  ` +
      `${fmt(r.rowsPerSec)} rows/s  queue wait p50=${fmt(r.queueWaitMs.p50)}ms p95=${fmt(r.queueWaitMs.p95)}ms  ` +
      `run p50=${fmt(r.runDurationMs.p50)}ms  cpu=${r.serverCpuSec?.toFixed(1)}s  rss=${r.peakRssMb?.toFixed(0)}MB  ok=${r.succeeded}/${pipelines}`);
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ machine: { cpu: os.cpus()[0].model, vcpus: os.cpus().length, memGiB: os.totalmem() / 2 ** 30, node: process.version }, results }, null, 2));
})().catch((err) => { console.error(err); process.exit(1); });
