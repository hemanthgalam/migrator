const { EventEmitter } = require('events');
const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { JobQueue } = require('./engine/queue');
const { Scheduler } = require('./engine/scheduler');
const { createApp } = require('./app');
const { seedDemo } = require('./seed');

function createServer(overrides = {}) {
  const config = loadConfig(overrides);
  const db = openDatabase(config.dbFile);
  const store = createStore(db);
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const queue = new JobQueue({ store, bus, dataDir: config.dataDir, concurrency: config.concurrency, retryBaseMs: config.retryBaseMs });
  const scheduler = new Scheduler({ store, queue, intervalMs: config.schedulerIntervalMs });
  if (config.seed) seedDemo(store);
  const app = createApp({ store, queue, bus, config });

  let httpServer;
  return {
    app, store, queue, scheduler, bus, config,
    start() {
      queue.start();
      scheduler.start();
      return new Promise((resolve) => {
        httpServer = app.listen(config.port, () => resolve(httpServer));
      });
    },
    async stop() {
      scheduler.stop();
      await queue.stop();
      if (httpServer) {
        httpServer.closeAllConnections?.();
        await new Promise((r) => httpServer.close(r));
      }
      db.close();
    },
  };
}

function main() {
  const server = createServer();
  server.start().then((http) => {
    console.log(`Migrator listening on http://localhost:${http.address().port} (data: ${server.config.dataDir})`);
  });
  const shutdown = async (signal) => {
    console.log(`${signal} received, draining workers…`);
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { createServer, main };
