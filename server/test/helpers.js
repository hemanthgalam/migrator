const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../index');

function tempServer(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-test-'));
  const server = createServer({ dataDir, port: 0, seed: false, retryBaseMs: 20, schedulerIntervalMs: 60_000, serveWeb: false, ...overrides });
  const cleanup = async () => {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { server, dataDir, cleanup };
}

async function waitFor(fn, { timeout = 5000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, interval));
  }
}

const terminal = (s) => ['succeeded', 'failed', 'cancelled'].includes(s);

function makePipeline(store, { sourceConfig = {}, stream = 'customers', transforms = [], target = 'out', ...rest } = {}) {
  const source = store.createConnection({ name: 'src', type: 'sample', config: { rowsPerStream: 100, latencyMs: 0, failAfterRows: 0, failAttempts: 1, ...sourceConfig } });
  const dest = store.createConnection({ name: 'dst', type: 'filesystem', config: { format: 'jsonl' } });
  const pipeline = store.createPipeline({
    name: `p-${Math.random().toString(36).slice(2, 7)}`, sourceConnectionId: source.id, sourceStream: stream,
    destConnectionId: dest.id, destTarget: target, writeMode: 'overwrite', batchSize: 25, maxRetries: 0, transforms, ...rest,
  });
  return { source, dest, pipeline };
}

module.exports = { tempServer, waitFor, terminal, makePipeline };
