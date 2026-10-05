const path = require('path');
require('dotenv').config();

function loadConfig(overrides = {}) {
  const dataDir = path.resolve(overrides.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', '.data'));
  return {
    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    dataDir,
    dbFile: overrides.dbFile || path.join(dataDir, 'migrator.sqlite'),
    concurrency: Number(overrides.concurrency ?? process.env.WORKER_CONCURRENCY ?? 2),
    retryBaseMs: Number(overrides.retryBaseMs ?? process.env.RETRY_BASE_MS ?? 2000),
    schedulerIntervalMs: Number(overrides.schedulerIntervalMs ?? process.env.SCHEDULER_INTERVAL_MS ?? 5000),
    seed: overrides.seed ?? process.env.SEED_DEMO !== 'false',
    serveWeb: overrides.serveWeb ?? true,
  };
}

module.exports = { loadConfig };
