const { now } = require('../lib/util');
const { executeRun } = require('./runner');

/**
 * Persistent async job queue backed by the runs table.
 *
 * - Runs are enqueued as rows and claimed atomically by a worker slot.
 * - Up to `concurrency` runs execute at once; a pipeline never runs twice in parallel.
 * - Failures retry with exponential backoff until max attempts is reached.
 * - Running jobs can be cancelled through an AbortController.
 * - Runs interrupted by a restart are re-queued on boot.
 */
class JobQueue {
  constructor({ store, bus, dataDir, concurrency = 2, retryBaseMs = 2000, execute = executeRun }) {
    this.store = store;
    this.bus = bus;
    this.dataDir = dataDir;
    this.concurrency = store.getSetting('concurrency', concurrency);
    this.retryBaseMs = retryBaseMs;
    this.execute = execute;
    this.active = new Map();
    this.retryTimer = null;
    this.stopped = true;
  }

  start() {
    this.stopped = false;
    for (const id of this.store.recoverInterruptedRuns()) {
      this.log(id, 'warn', 'Worker restarted while this run was in progress; re-queued');
    }
    this.tick();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const pending = [...this.active.values()];
    // Leave interrupted runs as "running" so they are recovered on next boot.
    for (const job of pending) job.shutdown = true;
    for (const job of pending) job.controller.abort();
    await Promise.allSettled(pending.map((j) => j.promise));
  }

  setConcurrency(n) {
    this.concurrency = Math.max(1, Math.min(16, Math.floor(n)));
    this.store.setSetting('concurrency', this.concurrency);
    this.bus.emit('event', { type: 'queue', data: this.status() });
    this.tick();
  }

  status() {
    return { concurrency: this.concurrency, active: this.active.size, activeRunIds: [...this.active.keys()] };
  }

  enqueue(pipeline, trigger = 'manual') {
    const run = this.store.createRun({ pipelineId: pipeline.id, trigger, maxAttempts: 1 + Math.max(0, pipeline.maxRetries ?? 0) });
    this.log(run.id, 'info', `Run queued (${trigger})`);
    this.emitRun(run.id);
    setImmediate(() => this.tick());
    return run;
  }

  cancel(runId) {
    const run = this.store.getRun(runId);
    if (!run) return null;
    if (run.status === 'queued' || run.status === 'retrying') {
      this.store.updateRun(runId, { status: 'cancelled', finishedAt: now(), nextAttemptAt: null });
      this.log(runId, 'warn', 'Run cancelled before it started');
      this.emitRun(runId);
    } else if (run.status === 'running' && this.active.has(runId)) {
      this.log(runId, 'warn', 'Cancellation requested');
      this.active.get(runId).controller.abort();
    }
    return this.store.getRun(runId);
  }

  tick() {
    if (this.stopped) return;
    while (this.active.size < this.concurrency) {
      const busy = [...new Set([...this.active.values()].map((j) => j.pipelineId))];
      const run = this.store.claimNextRun(busy);
      if (!run) break;
      this.launch(run);
    }
    this.scheduleRetryWakeup();
  }

  scheduleRetryWakeup() {
    clearTimeout(this.retryTimer);
    const next = this.store.nextRetryAt();
    if (!next || this.stopped) return;
    const delay = Math.max(50, new Date(next).getTime() - Date.now());
    this.retryTimer = setTimeout(() => this.tick(), delay);
    this.retryTimer.unref?.();
  }

  launch(run) {
    const controller = new AbortController();
    const job = { controller, pipelineId: run.pipelineId, shutdown: false };
    this.active.set(run.id, job);
    this.emitRun(run.id);
    job.promise = this.runJob(run, controller.signal)
      .then((counters) => {
        this.store.updateRun(run.id, { ...counters, status: 'succeeded', finishedAt: now() });
        this.log(run.id, 'success', 'Run succeeded');
      })
      .catch((err) => this.handleFailure(run, err, job))
      .finally(() => {
        this.active.delete(run.id);
        this.emitRun(run.id);
        this.tick();
      });
  }

  async runJob(run, signal) {
    const pipeline = this.store.getPipeline(run.pipelineId);
    if (!pipeline) throw new Error('Pipeline no longer exists');
    const source = this.store.getConnection(pipeline.sourceConnectionId);
    const dest = this.store.getConnection(pipeline.destConnectionId);
    if (!source || !dest) throw new Error('Source or destination connection no longer exists');
    this.log(run.id, 'info', `Worker picked up run for "${pipeline.name}"`);
    let lastEmit = 0;
    return this.execute({
      run, pipeline, source, dest, dataDir: this.dataDir, signal,
      log: (level, message) => this.log(run.id, level, message),
      progress: (counters) => {
        this.store.updateRun(run.id, counters);
        const t = Date.now();
        if (t - lastEmit > 100) { lastEmit = t; this.emitRun(run.id); }
      },
    });
  }

  handleFailure(run, err, job) {
    if (job.shutdown) return;
    const fresh = this.store.getRun(run.id);
    if (err.name === 'AbortError' || job.controller.signal.aborted) {
      this.store.updateRun(run.id, { status: 'cancelled', finishedAt: now() });
      this.log(run.id, 'warn', 'Run cancelled');
      return;
    }
    this.log(run.id, 'error', err.message || String(err));
    if (fresh.attempt < fresh.maxAttempts) {
      const delay = this.retryBaseMs * 2 ** (fresh.attempt - 1);
      const nextAttemptAt = new Date(Date.now() + delay).toISOString();
      this.store.updateRun(run.id, {
        status: 'retrying', attempt: fresh.attempt + 1, error: err.message, nextAttemptAt,
        rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0,
      });
      this.log(run.id, 'warn', `Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${fresh.attempt + 1} of ${fresh.maxAttempts})`);
    } else {
      this.store.updateRun(run.id, { status: 'failed', error: err.message, finishedAt: now() });
      this.log(run.id, 'error', `Run failed after ${fresh.attempt} attempt(s)`);
    }
  }

  log(runId, level, message) {
    const entry = this.store.appendLog(runId, level, message);
    this.bus.emit('event', { type: 'log', data: entry });
  }

  emitRun(runId) {
    const run = this.store.getRun(runId);
    if (run) this.bus.emit('event', { type: 'run', data: run });
  }
}

module.exports = { JobQueue };
