// In-browser stand-in for the Migrator API, used by the static (GitHub Pages)
// build. It mirrors server/app.js and server/engine/queue.js: a worker pool
// with a concurrency limit, retries with backoff, cancellation, schedules and
// live events, all running on timers in the page. State persists to
// localStorage so a refresh keeps your pipelines and history.

import meta from 'virtual:migrator-meta';
import type { Connection, LogEntry, Pipeline, Run } from '../lib/types';
import { parseCsv, parseCsvRows, toCsvLine } from './csv';
import { DATASETS, sampleBatches } from './sample';
import { compileTransforms, validateTransforms } from './transforms';

type Row = Record<string, unknown>;
type Event = { type: 'run'; data: Run } | { type: 'log'; data: LogEntry } | { type: 'queue'; data: unknown };

export class DemoError extends Error {
  constructor(public status: number, message: string, public details?: string[]) { super(message); }
}

const STORAGE_KEY = 'migrator-demo-v1';
const RETRY_BASE_MS = 2000;
const MASK = '••••••••';
const BROWSER_TYPES = ['sample', 'filesystem', 'http'];
const UNAVAILABLE = 'Database connectors need the self-hosted server. The browser demo can only use Sample data, File storage and REST APIs.';

interface State {
  connections: Connection[];
  pipelines: (Pipeline & { lastScheduledAt: string | null })[];
  runs: Run[];
  logs: Record<string, LogEntry[]>;
  files: Record<string, Record<string, string>>;
  concurrency: number;
  logSeq: number;
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- State -----------------------------------------------------------------

function seed(): State {
  const ts = now();
  const sample: Connection = { id: id('conn'), name: 'Demo SaaS data', type: 'sample', config: { rowsPerStream: 2500, latencyMs: 150, failAfterRows: 0, failAttempts: 1 }, createdAt: ts, updatedAt: ts };
  const lake: Connection = { id: id('conn'), name: 'Analytics lake', type: 'filesystem', config: { format: 'csv' }, createdAt: ts, updatedAt: ts };
  const base = { upsertKey: null, enabled: true, lastScheduledAt: null, createdAt: ts, updatedAt: ts };
  return {
    connections: [lake, sample],
    pipelines: [
      {
        ...base, id: id('pl'), name: 'Paid orders sync', description: 'Hourly load of paid and shipped orders.',
        sourceConnectionId: sample.id, sourceStream: 'orders', destConnectionId: lake.id, destTarget: 'paid_orders', writeMode: 'overwrite',
        batchSize: 500, maxRetries: 3, scheduleIntervalSec: 3600,
        transforms: [
          { type: 'filter', field: 'status', op: 'in', value: 'paid,shipped' },
          { type: 'cast', field: 'amount', to: 'number' },
          { type: 'rename', mapping: { created_at: 'ordered_at' } },
        ],
      },
      {
        ...base, id: id('pl'), name: 'Active customers to lake', description: 'Clean, mask and deduplicate active customer accounts for analytics.',
        sourceConnectionId: sample.id, sourceStream: 'customers', destConnectionId: lake.id, destTarget: 'active_customers', writeMode: 'overwrite',
        batchSize: 250, maxRetries: 2, scheduleIntervalSec: null,
        transforms: [
          { type: 'filter', field: 'is_active', op: 'eq', value: 'true' },
          { type: 'dedupe', keys: ['email'] },
          { type: 'derive', field: 'full_name', template: '{first_name} {last_name}' },
          { type: 'mask', field: 'email', strategy: 'email' },
          { type: 'cast', field: 'mrr', to: 'number' },
          { type: 'select', fields: ['id', 'full_name', 'email', 'country', 'plan', 'mrr', 'signup_at'] },
        ],
      },
    ],
    runs: [],
    logs: {},
    files: {},
    concurrency: 2,
    logSeq: 0,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      // Runs interrupted by a page reload go back to the queue, like a server restart.
      for (const r of s.runs) {
        if (r.status === 'running') Object.assign(r, { status: 'queued', startedAt: null, rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0, version: r.version + 1 });
      }
      return s;
    }
  } catch { /* storage unavailable or corrupt */ }
  return seed();
}

const state = load();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      state.runs = state.runs.slice(0, 200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota exceeded or storage blocked: keep running in memory */ }
  }, 300);
}

export function resetDemo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  location.reload();
}

// ---- Events ----------------------------------------------------------------

const listeners = new Set<(e: Event) => void>();
export function subscribe(fn: (e: Event) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emit = (e: Event) => listeners.forEach((fn) => fn(structuredClone(e)));

// ---- Helpers ---------------------------------------------------------------

const connectorMeta = (type: string) => meta.connectors.find((c) => c.type === type);
const getConnection = (cid: string) => state.connections.find((c) => c.id === cid);
const getPipeline = (pid: string) => state.pipelines.find((p) => p.id === pid);
const getRun = (rid: string) => state.runs.find((r) => r.id === rid);
const must = <T,>(v: T | undefined, what: string): T => { if (!v) throw new DemoError(404, `${what} not found`); return v; };

function redact(c: Connection): Connection {
  const m = connectorMeta(c.type);
  const config = { ...c.config };
  for (const f of m?.fields || []) if (f.secret && config[f.key]) config[f.key] = MASK;
  return { ...c, config };
}

function normalizeConfig(type: string, input: Record<string, unknown> = {}, previous: Record<string, unknown> = {}) {
  const m = connectorMeta(type);
  if (!m) throw new DemoError(400, `Unknown connector type "${type}"`);
  const config: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const f of m.fields) {
    let v = input[f.key];
    if (f.secret && v === MASK) v = previous[f.key];
    if (v === undefined || v === '') v = f.default;
    if (f.type === 'number' && v !== undefined && v !== null && v !== '') v = Number(v);
    if (f.required && (v === undefined || v === null || v === '')) missing.push(f.label);
    if (v !== undefined) config[f.key] = v;
  }
  if (missing.length) throw new DemoError(400, `Missing required fields: ${missing.join(', ')}`);
  return config;
}

const fileName = (conn: Connection, stream: string) => {
  const base = String(stream).split('/').pop()!.replace(/[^\w.-]/g, '_');
  if (!base || base.startsWith('.')) throw new DemoError(400, `Invalid file name "${stream}"`);
  return /\.(csv|jsonl)$/.test(base) ? base : `${base}.${conn.config.format === 'jsonl' ? 'jsonl' : 'csv'}`;
};

const filesOf = (cid: string) => (state.files[cid] ||= {});

function parseFile(name: string, text: string): Row[] {
  if (name.endsWith('.jsonl')) return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return parseCsv(text);
}

async function fetchHttp(config: Record<string, any>): Promise<Row[]> {
  let headers = {};
  if (config.headers) { try { headers = JSON.parse(config.headers); } catch { throw new Error('Headers must be valid JSON'); } }
  const res = await fetch(config.url, { headers: { accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${config.url}`);
  const body = await res.json();
  const records = config.recordsPath ? String(config.recordsPath).split('.').reduce((a: any, k: string) => (a == null ? a : a[k]), body) : body;
  if (!Array.isArray(records)) throw new Error(`Expected an array at "${config.recordsPath || '(root)'}"`);
  return records.map((r) => (r && typeof r === 'object' ? r : { value: r }));
}

// Source reader shared by previews and runs: yields batches, honouring abort.
async function* read(conn: Connection, stream: string, batchSize: number, opts: { attempt?: number; signal?: { aborted: boolean } } = {}) {
  const cfg = conn.config as Record<string, any>;
  if (conn.type === 'sample') {
    if (!DATASETS[stream]) throw new Error(`Unknown sample dataset "${stream}"`);
    const total = Number(cfg.rowsPerStream ?? 1000);
    for (const { offset, rows } of sampleBatches(stream, total, batchSize)) {
      if (cfg.latencyMs && opts.attempt !== Infinity) await sleep(Number(cfg.latencyMs));
      if (opts.signal?.aborted) return;
      if (Number(cfg.failAfterRows) && offset >= Number(cfg.failAfterRows) && (opts.attempt ?? 1) <= Number(cfg.failAttempts ?? 1)) {
        throw new Error(`Simulated source failure after ${offset} rows (attempt ${opts.attempt})`);
      }
      yield rows;
    }
  } else if (conn.type === 'filesystem') {
    const name = fileName(conn, stream);
    const text = filesOf(conn.id)[name];
    if (text === undefined) throw new Error(`File "${stream}" not found`);
    const rows = parseFile(name, text);
    for (let i = 0; i < rows.length; i += batchSize) { await sleep(0); if (opts.signal?.aborted) return; yield rows.slice(i, i + batchSize); }
  } else if (conn.type === 'http') {
    const rows = await fetchHttp(cfg);
    for (let i = 0; i < rows.length; i += batchSize) yield rows.slice(i, i + batchSize);
  } else {
    throw new Error(UNAVAILABLE);
  }
}

async function count(conn: Connection, stream: string): Promise<number | null> {
  if (conn.type === 'sample') return Number(conn.config.rowsPerStream ?? 1000);
  if (conn.type === 'filesystem') {
    const text = filesOf(conn.id)[fileName(conn, stream)];
    return text === undefined ? null : parseFile(fileName(conn, stream), text).length;
  }
  return null;
}

async function preview(conn: Connection, stream: string, limit: number) {
  const rows: Row[] = [];
  try {
    for await (const batch of read(conn, stream, limit, { attempt: Infinity })) { rows.push(...batch); if (rows.length >= limit) break; }
  } catch (err) {
    throw new DemoError(502, `Preview failed: ${(err as Error).message}`);
  }
  const sliced = rows.slice(0, limit);
  return { columns: [...new Set(sliced.flatMap((r) => Object.keys(r)))], rows: sliced };
}

// ---- Queue -----------------------------------------------------------------

const active = new Map<string, { aborted: boolean; pipelineId: string }>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function updateRun(run: Run, patch: Partial<Run>) {
  Object.assign(run, patch, { version: run.version + 1 });
  save();
  emit({ type: 'run', data: run });
}

function log(runId: string, level: LogEntry['level'], message: string) {
  const entry: LogEntry = { id: ++state.logSeq, runId, ts: now(), level, message };
  (state.logs[runId] ||= []).push(entry);
  save();
  emit({ type: 'log', data: entry });
}

function enqueue(p: Pipeline, trigger: Run['trigger']) {
  const run: Run = {
    id: id('run'), pipelineId: p.id, pipelineName: p.name, status: 'queued', trigger, attempt: 1, maxAttempts: 1 + Math.max(0, p.maxRetries ?? 0),
    rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0, rowsTotal: null, error: null, queuedAt: now(), startedAt: null, finishedAt: null,
    nextAttemptAt: null, version: 0,
  };
  state.runs.unshift(run);
  log(run.id, 'info', `Run queued (${trigger})`);
  emit({ type: 'run', data: run });
  save();
  setTimeout(tick, 0);
  return run;
}

function tick() {
  while (active.size < state.concurrency) {
    const busy = new Set([...active.values()].map((j) => j.pipelineId));
    const due = state.runs
      .filter((r) => (r.status === 'queued' || r.status === 'retrying') && (!r.nextAttemptAt || r.nextAttemptAt <= now()) && !busy.has(r.pipelineId))
      .sort((a, b) => (a.nextAttemptAt || a.queuedAt).localeCompare(b.nextAttemptAt || b.queuedAt));
    const run = due[0];
    if (!run) break;
    launch(run);
  }
  if (retryTimer) clearTimeout(retryTimer);
  const next = state.runs.filter((r) => r.status === 'retrying').map((r) => r.nextAttemptAt!).sort()[0];
  if (next) retryTimer = setTimeout(tick, Math.max(50, new Date(next).getTime() - Date.now()));
  emit({ type: 'queue', data: queueStatus() });
}

const queueStatus = () => ({ concurrency: state.concurrency, active: active.size, activeRunIds: [...active.keys()] });

function launch(run: Run) {
  const job = { aborted: false, pipelineId: run.pipelineId };
  active.set(run.id, job);
  updateRun(run, { status: 'running', startedAt: now(), finishedAt: null, nextAttemptAt: null, error: null });
  execute(run, job)
    .then((counters) => {
      updateRun(run, { ...counters, status: 'succeeded', finishedAt: now() });
      log(run.id, 'success', 'Run succeeded');
    })
    .catch((err: Error) => {
      if (job.aborted) {
        updateRun(run, { status: 'cancelled', finishedAt: now() });
        log(run.id, 'warn', 'Run cancelled');
        return;
      }
      log(run.id, 'error', err.message);
      if (run.attempt < run.maxAttempts) {
        const delay = RETRY_BASE_MS * 2 ** (run.attempt - 1);
        updateRun(run, { status: 'retrying', attempt: run.attempt + 1, error: err.message, nextAttemptAt: new Date(Date.now() + delay).toISOString(), rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0 });
        log(run.id, 'warn', `Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${run.attempt} of ${run.maxAttempts})`);
      } else {
        updateRun(run, { status: 'failed', error: err.message, finishedAt: now() });
        log(run.id, 'error', `Run failed after ${run.attempt} attempt(s)`);
      }
    })
    .finally(() => {
      active.delete(run.id);
      tick();
    });
}

async function execute(run: Run, job: { aborted: boolean }) {
  const p = must(getPipeline(run.pipelineId), 'Pipeline');
  const source = must(getConnection(p.sourceConnectionId), 'Source connection');
  const dest = must(getConnection(p.destConnectionId), 'Destination connection');
  log(run.id, 'info', `Worker picked up run for "${p.name}"`);
  const counters = { rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0, rowsTotal: null as number | null };
  log(run.id, 'info', `Attempt ${run.attempt} of ${run.maxAttempts}: extracting "${p.sourceStream}" from ${source.name} (${connectorMeta(source.type)?.label})`);
  counters.rowsTotal = await count(source, p.sourceStream).catch(() => null);
  if (counters.rowsTotal != null) {
    log(run.id, 'info', `Source reports ${counters.rowsTotal.toLocaleString('en-US')} rows`);
    updateRun(run, { rowsTotal: counters.rowsTotal });
  }
  const apply = compileTransforms(p.transforms);
  if (p.transforms.length) log(run.id, 'info', `Applying ${p.transforms.length} transform step(s): ${p.transforms.map((t) => t.type).join(' → ')}`);
  if (dest.type !== 'filesystem') throw new Error(UNAVAILABLE);
  const name = fileName(dest, p.destTarget);
  const isCsv = name.endsWith('.csv');
  const existing = p.writeMode === 'append' ? filesOf(dest.id)[name] ?? '' : '';
  let header: string[] | null = isCsv && existing ? parseCsvRows(existing.split(/\r?\n/)[0])[0] : null;
  let out = existing;
  log(run.id, 'info', `Loading into "${p.destTarget}" on ${dest.name} (File storage, ${p.writeMode})`);

  for await (const batch of read(source, p.sourceStream, Math.max(1, p.batchSize), { attempt: run.attempt, signal: job })) {
    if (job.aborted) break;
    const { rows, filtered } = apply(batch);
    if (rows.length) {
      if (isCsv) {
        if (!header) { header = [...new Set(rows.flatMap((r) => Object.keys(r)))]; out += toCsvLine(header); }
        for (const r of rows) out += toCsvLine(header.map((h) => r[h]));
      } else {
        for (const r of rows) out += `${JSON.stringify(r)}\n`;
      }
    }
    counters.rowsRead += batch.length;
    counters.rowsFiltered += filtered;
    counters.rowsWritten += rows.length;
    counters.batches += 1;
    updateRun(run, { ...counters });
  }
  if (job.aborted) throw new Error('Run was cancelled');
  // Staged output is only swapped in once every batch has loaded.
  filesOf(dest.id)[name] = out;
  log(run.id, 'info', `Loaded ${counters.rowsWritten.toLocaleString('en-US')} rows in ${counters.batches} batch(es); ${counters.rowsFiltered.toLocaleString('en-US')} filtered out`);
  return counters;
}

function cancel(run: Run) {
  if (run.status === 'queued' || run.status === 'retrying') {
    updateRun(run, { status: 'cancelled', finishedAt: now(), nextAttemptAt: null });
    log(run.id, 'warn', 'Run cancelled before it started');
  } else if (run.status === 'running' && active.has(run.id)) {
    log(run.id, 'warn', 'Cancellation requested');
    active.get(run.id)!.aborted = true;
  }
  return run;
}

// Interval scheduler, as in server/engine/scheduler.js.
setInterval(() => {
  const at = Date.now();
  for (const p of state.pipelines) {
    if (!p.enabled || !p.scheduleIntervalSec) continue;
    const last = new Date(p.lastScheduledAt || p.createdAt).getTime();
    if (at - last < p.scheduleIntervalSec * 1000) continue;
    p.lastScheduledAt = now();
    save();
    if (state.runs.some((r) => r.pipelineId === p.id && ['queued', 'retrying', 'running'].includes(r.status))) continue;
    enqueue(p, 'schedule');
  }
}, 5000);
setTimeout(tick, 0);

// ---- Request handling ------------------------------------------------------

function validatePipeline(body: any, existing: Partial<Pipeline> = {}) {
  const p = { ...existing, ...body };
  const errors: string[] = [];
  if (!p.name || !String(p.name).trim()) errors.push('Name is required');
  const source = p.sourceConnectionId && getConnection(p.sourceConnectionId);
  const dest = p.destConnectionId && getConnection(p.destConnectionId);
  if (!source) errors.push('Source connection is required');
  else if (!connectorMeta(source.type)?.roles.includes('source')) errors.push(`${connectorMeta(source.type)?.label} cannot be used as a source`);
  if (!dest) errors.push('Destination connection is required');
  else if (!connectorMeta(dest.type)?.roles.includes('destination')) errors.push(`${connectorMeta(dest.type)?.label} cannot be used as a destination`);
  if (!p.sourceStream) errors.push('Source stream is required');
  if (!p.destTarget) errors.push('Destination target is required');
  p.writeMode = p.writeMode || 'append';
  if (dest && !connectorMeta(dest.type)?.writeModes.includes(p.writeMode)) errors.push(`${connectorMeta(dest.type)?.label} does not support "${p.writeMode}" writes`);
  if (p.writeMode === 'upsert' && !p.upsertKey) errors.push('Upsert key is required for upsert writes');
  p.transforms = p.transforms || [];
  errors.push(...validateTransforms(p.transforms));
  p.batchSize = Number(p.batchSize) || 500;
  if (p.batchSize < 1 || p.batchSize > 50000) errors.push('Batch size must be between 1 and 50,000');
  p.maxRetries = Number(p.maxRetries ?? 2);
  p.scheduleIntervalSec = p.scheduleIntervalSec ? Number(p.scheduleIntervalSec) : null;
  if (p.scheduleIntervalSec !== null && !(p.scheduleIntervalSec >= 10)) errors.push('Schedule interval must be at least 10 seconds');
  if (errors.length) throw new DemoError(400, errors[0], errors);
  return {
    name: String(p.name).trim(), description: p.description || '', sourceConnectionId: p.sourceConnectionId, sourceStream: p.sourceStream,
    destConnectionId: p.destConnectionId, destTarget: p.destTarget, writeMode: p.writeMode, upsertKey: p.upsertKey || null,
    transforms: p.transforms, batchSize: p.batchSize, maxRetries: p.maxRetries, scheduleIntervalSec: p.scheduleIntervalSec, enabled: p.enabled !== false,
  };
}

function pipelineSummary(p: Pipeline) {
  const runs = state.runs.filter((r) => r.pipelineId === p.id);
  return { ...p, lastRun: runs[0] ?? null, runCount: runs.length, successCount: runs.filter((r) => r.status === 'succeeded').length };
}

function stats(days = 14) {
  const since = new Date(Date.now() - days * 86400_000);
  since.setUTCHours(0, 0, 0, 0);
  const runs = state.runs.filter((r) => r.queuedAt >= since.toISOString());
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const d = runs.filter((r) => r.queuedAt.slice(0, 10) === day);
    series.push({
      day, succeeded: d.filter((r) => r.status === 'succeeded').length, failed: d.filter((r) => r.status === 'failed').length,
      other: d.filter((r) => !['succeeded', 'failed'].includes(r.status)).length, rowsWritten: d.reduce((a, r) => a + r.rowsWritten, 0),
    });
  }
  const succeeded = runs.filter((r) => r.status === 'succeeded');
  const failed = runs.filter((r) => r.status === 'failed').length;
  const durations = succeeded.filter((r) => r.startedAt && r.finishedAt).map((r) => new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime());
  return {
    windowDays: days, runs: runs.length, succeeded: succeeded.length, failed,
    running: runs.filter((r) => r.status === 'running').length, queued: runs.filter((r) => ['queued', 'retrying'].includes(r.status)).length,
    rowsWritten: runs.reduce((a, r) => a + r.rowsWritten, 0),
    successRate: succeeded.length + failed ? succeeded.length / (succeeded.length + failed) : null,
    avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    pipelines: state.pipelines.length, scheduledPipelines: state.pipelines.filter((p) => p.enabled && p.scheduleIntervalSec).length,
    connections: state.connections.length, series, queue: queueStatus(),
  };
}

async function testConnection(type: string, config: Record<string, any>, cid?: string) {
  if (!BROWSER_TYPES.includes(type)) return { ok: false, message: UNAVAILABLE };
  if (type === 'http') {
    try { return { ok: true, message: `Fetched ${(await fetchHttp(config)).length} records` }; } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
  if (type === 'filesystem') { if (cid) filesOf(cid); return { ok: true, message: 'Storage is writable' }; }
  return { ok: true, message: 'Sample data is always available' };
}

export function fileText(cid: string, name: string) {
  return filesOf(cid)[name];
}

/** Route a request to the in-browser API. Returns the JSON body, or throws DemoError. */
export async function handle(method: string, url: string, body: any): Promise<unknown> {
  await sleep(40); // a little latency so loading states behave like the real thing
  const u = new URL(url, 'http://demo');
  const q = u.searchParams;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [res, rid, sub] = parts;
  const special = (res === 'connections' && rid === 'test') || (res === 'pipelines' && rid === 'preview');
  const route = special ? `${method} /${res}/${rid}` : `${method} /${res}${rid ? '/:id' : ''}${sub ? `/${sub}` : ''}`;

  switch (route) {
    case 'GET /meta':
      return {
        ...meta,
        connectors: meta.connectors.map((c) => (BROWSER_TYPES.includes(c.type) ? c : { ...c, description: `${c.description} Self-hosted only; not available in the browser demo.` })),
      };
    case 'GET /health': return { status: 'ok', queue: queueStatus() };
    case 'GET /stats': return stats(Math.min(Number(q.get('days')) || 14, 90));
    case 'GET /settings': return { concurrency: state.concurrency };
    case 'PUT /settings': {
      const n = Number(body?.concurrency);
      if (!(n >= 1 && n <= 16)) throw new DemoError(400, 'Concurrency must be between 1 and 16');
      state.concurrency = Math.floor(n);
      save();
      tick();
      return { concurrency: state.concurrency };
    }

    case 'GET /connections': return [...state.connections].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(redact);
    case 'POST /connections/test': return testConnection(body.type, normalizeConfig(body.type, body.config));
    case 'POST /connections': {
      if (!body?.name || !String(body.name).trim()) throw new DemoError(400, 'Name is required');
      const ts = now();
      const c: Connection = { id: id('conn'), name: String(body.name).trim(), type: body.type, config: normalizeConfig(body.type, body.config), createdAt: ts, updatedAt: ts };
      state.connections.push(c);
      save();
      return redact(c);
    }
    case 'GET /connections/:id': return redact(must(getConnection(rid), 'Connection'));
    case 'PUT /connections/:id': {
      const c = must(getConnection(rid), 'Connection');
      if (!body?.name || !String(body.name).trim()) throw new DemoError(400, 'Name is required');
      Object.assign(c, { name: String(body.name).trim(), config: normalizeConfig(c.type, body.config, c.config), updatedAt: now() });
      save();
      return redact(c);
    }
    case 'DELETE /connections/:id': {
      must(getConnection(rid), 'Connection');
      const used = state.pipelines.filter((p) => p.sourceConnectionId === rid || p.destConnectionId === rid);
      if (used.length) throw new DemoError(409, `Connection is used by ${used.map((p) => `"${p.name}"`).join(', ')}`);
      state.connections = state.connections.filter((c) => c.id !== rid);
      delete state.files[rid];
      save();
      return undefined;
    }
    case 'POST /connections/:id/test': {
      const c = must(getConnection(rid), 'Connection');
      return testConnection(c.type, c.config, c.id);
    }
    case 'GET /connections/:id/streams': {
      const c = must(getConnection(rid), 'Connection');
      if (c.type === 'sample') return Object.entries(DATASETS).map(([name, d]) => ({ name, description: d.description }));
      if (c.type === 'filesystem') return Object.entries(filesOf(c.id)).sort().map(([name, text]) => ({ name, description: `${(text.length / 1024).toFixed(1)} KB` }));
      if (c.type === 'http') return [{ name: 'records', description: 'Records returned by the endpoint' }];
      throw new DemoError(502, `Could not list streams: ${UNAVAILABLE}`);
    }
    case 'GET /connections/:id/preview': {
      const c = must(getConnection(rid), 'Connection');
      if (!q.get('stream')) throw new DemoError(400, 'stream is required');
      return preview(c, q.get('stream')!, Math.min(Number(q.get('limit')) || 20, 200));
    }
    case 'POST /connections/:id/files': {
      const c = must(getConnection(rid), 'Connection');
      if (c.type !== 'filesystem') throw new DemoError(400, 'Files can only be uploaded to file storage connections');
      const name = fileName(c, q.get('name') || '');
      if (!/\.(csv|jsonl)$/.test(q.get('name') || '')) throw new DemoError(400, 'Only .csv and .jsonl files are supported');
      filesOf(c.id)[name] = typeof body === 'string' ? body : '';
      save();
      return { name };
    }

    case 'GET /pipelines': return [...state.pipelines].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(pipelineSummary);
    case 'POST /pipelines/preview': {
      const c = must(getConnection(body.sourceConnectionId), 'Source connection');
      const errors = validateTransforms(body.transforms || []);
      if (errors.length) throw new DemoError(400, errors[0], errors);
      const input = await preview(c, body.sourceStream, Math.min(Number(body.limit) || 25, 200));
      const { rows, filtered } = compileTransforms(body.transforms || [])(input.rows);
      return { input, output: { columns: [...new Set(rows.flatMap((r) => Object.keys(r)))], rows }, filtered };
    }
    case 'POST /pipelines': {
      const ts = now();
      const p = { ...validatePipeline(body), id: id('pl'), lastScheduledAt: null, createdAt: ts, updatedAt: ts } as State['pipelines'][number];
      state.pipelines.push(p);
      save();
      return p;
    }
    case 'GET /pipelines/:id': return must(getPipeline(rid), 'Pipeline');
    case 'PUT /pipelines/:id': {
      const p = must(getPipeline(rid), 'Pipeline');
      Object.assign(p, validatePipeline(body, p), { updatedAt: now() });
      save();
      return p;
    }
    case 'PATCH /pipelines/:id': {
      const p = must(getPipeline(rid), 'Pipeline');
      if ('enabled' in body) p.enabled = !!body.enabled;
      save();
      return p;
    }
    case 'DELETE /pipelines/:id': {
      must(getPipeline(rid), 'Pipeline');
      for (const r of state.runs.filter((x) => x.pipelineId === rid)) { cancel(r); delete state.logs[r.id]; }
      state.runs = state.runs.filter((r) => r.pipelineId !== rid || active.has(r.id));
      state.pipelines = state.pipelines.filter((p) => p.id !== rid);
      save();
      return undefined;
    }
    case 'POST /pipelines/:id/runs': return enqueue(must(getPipeline(rid), 'Pipeline'), 'manual');

    case 'GET /runs': {
      const status = q.get('status')?.split(',');
      const pid = q.get('pipelineId');
      return state.runs.filter((r) => (!status || status.includes(r.status)) && (!pid || r.pipelineId === pid)).slice(0, Math.min(Number(q.get('limit')) || 50, 500));
    }
    case 'GET /runs/:id': return must(getRun(rid), 'Run');
    case 'GET /runs/:id/logs': must(getRun(rid), 'Run'); return (state.logs[rid] || []).filter((l) => l.id > (Number(q.get('after')) || 0));
    case 'POST /runs/:id/cancel': {
      const r = must(getRun(rid), 'Run');
      if (!['queued', 'retrying', 'running'].includes(r.status)) throw new DemoError(409, `Run is already ${r.status}`);
      return { ...cancel(r) };
    }
    case 'POST /runs/:id/retry': {
      const r = must(getRun(rid), 'Run');
      if (!['failed', 'cancelled'].includes(r.status)) throw new DemoError(409, 'Only failed or cancelled runs can be retried');
      return enqueue(must(getPipeline(r.pipelineId), 'Pipeline'), 'retry');
    }
    default:
      throw new DemoError(404, 'Not found');
  }
}
