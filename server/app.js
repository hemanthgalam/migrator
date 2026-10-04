const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { HttpError, route } = require('./lib/util');
const { getConnector, describeConnectors, normalizeConfig, redactConfig, CONNECTORS } = require('./connectors');
const { validateTransforms, compileTransforms, STEP_TYPES, FILTER_OPS, CAST_TYPES, FORMAT_FNS, MASK_STRATEGIES } = require('./engine/transforms');

const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

function createApp({ store, queue, bus, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  const api = express.Router();
  const ctxFor = (conn) => ({ dataDir: config.dataDir, connectionId: conn.id });
  const publicConnection = (c) => c && { ...c, config: redactConfig(c.type, c.config) };

  const mustGet = (getter, id, what) => {
    const v = getter(id);
    if (!v) throw new HttpError(404, `${what} not found`);
    return v;
  };

  api.get('/health', (req, res) => res.json({ status: 'ok', queue: queue.status(), uptime: process.uptime() }));

  api.get('/meta', (req, res) => res.json({
    connectors: describeConnectors(),
    transforms: { types: STEP_TYPES, filterOps: FILTER_OPS, castTypes: CAST_TYPES, formatFns: FORMAT_FNS, maskStrategies: MASK_STRATEGIES },
  }));

  // ---- Connections -------------------------------------------------------

  function validateConnectionBody(body, previous) {
    const { name, type } = body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Name is required');
    if (!CONNECTORS[type]) throw new HttpError(400, `Unknown connector type "${type}"`);
    const { config: cfg, missing } = normalizeConfig(type, body.config, previous?.config);
    if (missing.length) throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`);
    return { name: String(name).trim(), type, config: cfg };
  }

  api.get('/connections', (req, res) => res.json(store.listConnections().map(publicConnection)));

  api.post('/connections', (req, res) => {
    const conn = store.createConnection(validateConnectionBody(req.body));
    res.status(201).json(publicConnection(conn));
  });

  api.get('/connections/:id', (req, res) => res.json(publicConnection(mustGet(store.getConnection, req.params.id, 'Connection'))));

  api.put('/connections/:id', (req, res) => {
    const existing = mustGet(store.getConnection, req.params.id, 'Connection');
    const body = validateConnectionBody({ ...req.body, type: existing.type }, existing);
    res.json(publicConnection(store.updateConnection(existing.id, body)));
  });

  api.delete('/connections/:id', (req, res) => {
    mustGet(store.getConnection, req.params.id, 'Connection');
    const used = store.pipelinesUsingConnection(req.params.id);
    if (used.length) throw new HttpError(409, `Connection is used by ${used.map((p) => `"${p.name}"`).join(', ')}`);
    store.deleteConnection(req.params.id);
    res.status(204).end();
  });

  // Test a saved connection, or an unsaved config from the create form.
  api.post('/connections/test', route(async (req, res) => {
    const body = validateConnectionBody({ name: 'test', ...req.body });
    res.json(await safeTest(getConnector(body.type), body.config, { dataDir: config.dataDir, connectionId: '_test' }));
  }));

  api.post('/connections/:id/test', route(async (req, res) => {
    const conn = mustGet(store.getConnection, req.params.id, 'Connection');
    res.json(await safeTest(getConnector(conn.type), conn.config, ctxFor(conn)));
  }));

  api.get('/connections/:id/streams', route(async (req, res) => {
    const conn = mustGet(store.getConnection, req.params.id, 'Connection');
    try {
      res.json(await getConnector(conn.type).listStreams(conn.config, ctxFor(conn)));
    } catch (err) {
      throw new HttpError(502, `Could not list streams: ${err.message}`);
    }
  }));

  api.get('/connections/:id/preview', route(async (req, res) => {
    const conn = mustGet(store.getConnection, req.params.id, 'Connection');
    const connector = getConnector(conn.type);
    if (!connector.read) throw new HttpError(400, `${connector.label} cannot be read`);
    const stream = String(req.query.stream || '');
    if (!stream) throw new HttpError(400, 'stream is required');
    const limit = Math.min(Number(req.query.limit) || 20, 200);
    res.json(await previewRows(connector, conn, stream, limit, config.dataDir));
  }));

  // Upload a CSV / JSONL file into a file storage connection (raw text body).
  api.post('/connections/:id/files', express.text({ type: '*/*', limit: '50mb' }), route(async (req, res) => {
    const conn = mustGet(store.getConnection, req.params.id, 'Connection');
    if (conn.type !== 'filesystem') throw new HttpError(400, 'Files can only be uploaded to file storage connections');
    const fsConnector = getConnector('filesystem');
    let name;
    try { name = fsConnector.safeName(req.query.name); } catch (err) { throw new HttpError(400, err.message); }
    if (!/\.(csv|jsonl)$/.test(name)) throw new HttpError(400, 'Only .csv and .jsonl files are supported');
    const dir = path.join(config.dataDir, 'files', conn.id);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, name), typeof req.body === 'string' ? req.body : '');
    res.status(201).json({ name });
  }));

  api.get('/connections/:id/files/:name', (req, res) => {
    const conn = mustGet(store.getConnection, req.params.id, 'Connection');
    if (conn.type !== 'filesystem') throw new HttpError(400, 'Not a file storage connection');
    const file = path.join(config.dataDir, 'files', conn.id, getConnector('filesystem').safeName(req.params.name));
    if (!fs.existsSync(file)) throw new HttpError(404, 'File not found');
    res.download(file);
  });

  // ---- Pipelines ---------------------------------------------------------

  function validatePipelineBody(body, existing = {}) {
    const p = { ...existing, ...body };
    const errors = [];
    if (!p.name || !String(p.name).trim()) errors.push('Name is required');
    const source = p.sourceConnectionId && store.getConnection(p.sourceConnectionId);
    const dest = p.destConnectionId && store.getConnection(p.destConnectionId);
    if (!source) errors.push('Source connection is required');
    else if (!getConnector(source.type).roles.includes('source')) errors.push(`${getConnector(source.type).label} cannot be used as a source`);
    if (!dest) errors.push('Destination connection is required');
    else if (!getConnector(dest.type).roles.includes('destination')) errors.push(`${getConnector(dest.type).label} cannot be used as a destination`);
    if (!p.sourceStream) errors.push('Source stream is required');
    if (!p.destTarget) errors.push('Destination target is required');
    p.writeMode = p.writeMode || 'append';
    if (dest && getConnector(dest.type).writeModes && !getConnector(dest.type).writeModes.includes(p.writeMode)) {
      errors.push(`${getConnector(dest.type).label} does not support "${p.writeMode}" writes`);
    }
    if (p.writeMode === 'upsert' && !p.upsertKey) errors.push('Upsert key is required for upsert writes');
    p.transforms = p.transforms || [];
    errors.push(...validateTransforms(p.transforms));
    p.batchSize = Number(p.batchSize) || 500;
    if (p.batchSize < 1 || p.batchSize > 50000) errors.push('Batch size must be between 1 and 50,000');
    p.maxRetries = Number(p.maxRetries ?? 2);
    if (!(p.maxRetries >= 0 && p.maxRetries <= 10)) errors.push('Retries must be between 0 and 10');
    p.scheduleIntervalSec = p.scheduleIntervalSec ? Number(p.scheduleIntervalSec) : null;
    if (p.scheduleIntervalSec !== null && !(p.scheduleIntervalSec >= 10)) errors.push('Schedule interval must be at least 10 seconds');
    if (errors.length) throw new HttpError(400, errors[0], errors);
    p.name = String(p.name).trim();
    return p;
  }

  const pipelineFields = (p) => ({
    name: p.name, description: p.description || '', sourceConnectionId: p.sourceConnectionId, sourceStream: p.sourceStream,
    destConnectionId: p.destConnectionId, destTarget: p.destTarget, writeMode: p.writeMode, upsertKey: p.upsertKey || null,
    transforms: p.transforms, batchSize: p.batchSize, maxRetries: p.maxRetries, scheduleIntervalSec: p.scheduleIntervalSec,
    enabled: p.enabled !== false,
  });

  api.get('/pipelines', (req, res) => res.json(store.listPipelines()));

  api.post('/pipelines', (req, res) => {
    const p = store.createPipeline(pipelineFields(validatePipelineBody(req.body)));
    res.status(201).json(p);
  });

  api.get('/pipelines/:id', (req, res) => res.json(mustGet(store.getPipeline, req.params.id, 'Pipeline')));

  api.put('/pipelines/:id', (req, res) => {
    const existing = mustGet(store.getPipeline, req.params.id, 'Pipeline');
    const p = validatePipelineBody(req.body, existing);
    res.json(store.updatePipeline(existing.id, pipelineFields(p)));
  });

  api.patch('/pipelines/:id', (req, res) => {
    const existing = mustGet(store.getPipeline, req.params.id, 'Pipeline');
    const patch = {};
    if ('enabled' in req.body) patch.enabled = !!req.body.enabled;
    res.json(store.updatePipeline(existing.id, patch));
  });

  api.delete('/pipelines/:id', (req, res) => {
    const p = mustGet(store.getPipeline, req.params.id, 'Pipeline');
    for (const r of store.listRuns({ pipelineId: p.id, status: 'queued,retrying,running', limit: 500 })) queue.cancel(r.id);
    if (store.activeRunForPipeline(p.id)) throw new HttpError(409, 'Pipeline has a run in progress; try again once it stops');
    store.deletePipeline(p.id);
    res.status(204).end();
  });

  api.post('/pipelines/:id/runs', (req, res) => {
    const p = mustGet(store.getPipeline, req.params.id, 'Pipeline');
    res.status(202).json(queue.enqueue(p, 'manual'));
  });

  // Dry-run transforms against a sample of source rows, without saving.
  api.post('/pipelines/preview', route(async (req, res) => {
    const { sourceConnectionId, sourceStream, transforms = [] } = req.body || {};
    const conn = mustGet(store.getConnection, sourceConnectionId, 'Source connection');
    const errors = validateTransforms(transforms);
    if (errors.length) throw new HttpError(400, errors[0], errors);
    const before = await previewRows(getConnector(conn.type), conn, sourceStream, Math.min(Number(req.body.limit) || 25, 200), config.dataDir);
    const { rows, filtered } = compileTransforms(transforms)(before.rows);
    res.json({ input: before, output: { columns: columnsOf(rows), rows }, filtered });
  }));

  // ---- Runs --------------------------------------------------------------

  api.get('/runs', (req, res) => res.json(store.listRuns({ status: req.query.status, pipelineId: req.query.pipelineId, limit: req.query.limit })));
  api.get('/runs/:id', (req, res) => res.json(mustGet(store.getRun, req.params.id, 'Run')));
  api.get('/runs/:id/logs', (req, res) => {
    mustGet(store.getRun, req.params.id, 'Run');
    res.json(store.listLogs(req.params.id, Number(req.query.after) || 0));
  });
  api.post('/runs/:id/cancel', (req, res) => {
    const run = mustGet(store.getRun, req.params.id, 'Run');
    if (!['queued', 'retrying', 'running'].includes(run.status)) throw new HttpError(409, `Run is already ${run.status}`);
    res.json(queue.cancel(run.id));
  });
  api.post('/runs/:id/retry', (req, res) => {
    const run = mustGet(store.getRun, req.params.id, 'Run');
    if (!['failed', 'cancelled'].includes(run.status)) throw new HttpError(409, 'Only failed or cancelled runs can be retried');
    const p = mustGet(store.getPipeline, run.pipelineId, 'Pipeline');
    res.status(202).json(queue.enqueue(p, 'retry'));
  });

  // ---- Dashboard, settings, live events ----------------------------------

  api.get('/stats', (req, res) => res.json({ ...store.stats({ days: Math.min(Number(req.query.days) || 14, 90) }), queue: queue.status() }));

  api.get('/settings', (req, res) => res.json({ concurrency: queue.concurrency }));
  api.put('/settings', (req, res) => {
    const n = Number(req.body?.concurrency);
    if (!(n >= 1 && n <= 16)) throw new HttpError(400, 'Concurrency must be between 1 and 16');
    queue.setConcurrency(n);
    res.json({ concurrency: queue.concurrency });
  });

  // Server-Sent Events: run status, progress and log lines as they happen.
  api.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    const send = ({ type, data }) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    bus.on('event', send);
    req.on('close', () => { clearInterval(ping); bus.off('event', send); });
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  if (config.serveWeb && fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Internal error', details: err.details });
  });

  return app;
}

async function safeTest(connector, cfg, ctx) {
  try {
    return await connector.test(cfg, ctx);
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

function columnsOf(rows) {
  return [...new Set(rows.flatMap((r) => Object.keys(r)))];
}

async function previewRows(connector, conn, stream, limit, dataDir) {
  const ctx = { dataDir, connectionId: conn.id };
  const rows = [];
  try {
    // attempt: Infinity keeps simulated sample failures out of previews.
    for await (const batch of connector.read(conn.config, stream, { batchSize: limit, ctx, attempt: Infinity })) {
      rows.push(...batch);
      if (rows.length >= limit) break;
    }
  } catch (err) {
    throw new HttpError(502, `Preview failed: ${err.message}`);
  }
  const sliced = rows.slice(0, limit);
  return { columns: columnsOf(sliced), rows: sliced };
}

module.exports = { createApp };
