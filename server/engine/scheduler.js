const { now } = require('../lib/util');

// Interval scheduler: enqueues enabled pipelines whose interval has elapsed.
// Skips a tick when the pipeline already has an active run, so slow
// pipelines never pile up.
class Scheduler {
  constructor({ store, queue, intervalMs = 5000 }) {
    this.store = store;
    this.queue = queue;
    this.intervalMs = intervalMs;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  tick(at = Date.now()) {
    const fired = [];
    for (const p of this.store.listPipelines()) {
      if (!p.enabled || !p.scheduleIntervalSec) continue;
      const last = p.lastScheduledAt ? new Date(p.lastScheduledAt).getTime() : new Date(p.createdAt).getTime();
      if (at - last < p.scheduleIntervalSec * 1000) continue;
      this.store.updatePipeline(p.id, { lastScheduledAt: now() });
      if (this.store.activeRunForPipeline(p.id)) continue;
      fired.push(this.queue.enqueue(p, 'schedule'));
    }
    return fired;
  }
}

module.exports = { Scheduler };
