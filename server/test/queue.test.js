const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tempServer, waitFor, terminal, makePipeline } = require('./helpers');

const readOutput = (dataDir, dest, name) =>
  fs.readFileSync(path.join(dataDir, 'files', dest.id, `${name}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a queued run executes asynchronously and writes transformed output', async (t) => {
  const { server, dataDir, cleanup } = tempServer();
  t.after(cleanup);
  server.queue.start();
  const { pipeline, dest } = makePipeline(server.store, {
    transforms: [{ type: 'filter', field: 'is_active', op: 'eq', value: 'true' }, { type: 'select', fields: ['id', 'email'] }],
  });
  const queued = server.queue.enqueue(pipeline);
  assert.equal(queued.status, 'queued');
  const run = await waitFor(() => { const r = server.store.getRun(queued.id); return terminal(r.status) && r; });
  assert.equal(run.status, 'succeeded');
  assert.equal(run.rowsRead, 100);
  assert.equal(run.rowsTotal, 100);
  assert.equal(run.batches, 4);
  assert.equal(run.rowsWritten + run.rowsFiltered, 100);
  const out = readOutput(dataDir, dest, 'out');
  assert.equal(out.length, run.rowsWritten);
  assert.deepEqual(Object.keys(out[0]), ['id', 'email']);
  const logs = server.store.listLogs(run.id).map((l) => l.message).join('\n');
  assert.match(logs, /Run succeeded/);
});

test('respects the concurrency limit and never runs one pipeline twice at once', async (t) => {
  const { server, cleanup } = tempServer({ concurrency: 2 });
  t.after(cleanup);
  server.queue.start();
  const slow = { sourceConfig: { latencyMs: 30 } };
  const a = makePipeline(server.store, slow).pipeline;
  const b = makePipeline(server.store, slow).pipeline;
  const c = makePipeline(server.store, slow).pipeline;
  const runs = [server.queue.enqueue(a), server.queue.enqueue(a), server.queue.enqueue(b), server.queue.enqueue(c)];
  let maxActive = 0;
  let sawSamePipelineTwice = false;
  await waitFor(() => {
    const running = server.store.listRuns({ status: 'running' });
    maxActive = Math.max(maxActive, running.length);
    if (running.filter((r) => r.pipelineId === a.id).length > 1) sawSamePipelineTwice = true;
    return runs.every((r) => server.store.getRun(r.id).status === 'succeeded');
  }, { interval: 5, timeout: 10000 });
  assert.equal(maxActive, 2);
  assert.equal(sawSamePipelineTwice, false);
});

test('transient failures retry with backoff and then succeed', async (t) => {
  const { server, cleanup } = tempServer();
  t.after(cleanup);
  server.queue.start();
  const { pipeline } = makePipeline(server.store, { sourceConfig: { failAfterRows: 50, failAttempts: 1 }, maxRetries: 2 });
  const queued = server.queue.enqueue(pipeline);
  const statuses = new Set();
  const run = await waitFor(() => { const r = server.store.getRun(queued.id); statuses.add(r.status); return terminal(r.status) && r; });
  assert.ok(statuses.has('retrying') || run.attempt === 2);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.attempt, 2);
  assert.equal(run.rowsRead, 100);
  const logs = server.store.listLogs(run.id).map((l) => l.message).join('\n');
  assert.match(logs, /Simulated source failure/);
  assert.match(logs, /Retrying in/);
});

test('fails permanently once retries are exhausted and leaves no partial overwrite', async (t) => {
  const { server, dataDir, cleanup } = tempServer();
  t.after(cleanup);
  server.queue.start();
  const { pipeline, dest } = makePipeline(server.store, { sourceConfig: { failAfterRows: 50, failAttempts: 99 }, maxRetries: 1 });
  const run = server.queue.enqueue(pipeline);
  const done = await waitFor(() => { const r = server.store.getRun(run.id); return terminal(r.status) && r; });
  assert.equal(done.status, 'failed');
  assert.equal(done.attempt, 2);
  assert.match(done.error, /Simulated source failure/);
  const dir = path.join(dataDir, 'files', dest.id);
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], []);
});

test('cancels running and queued runs', async (t) => {
  const { server, cleanup } = tempServer({ concurrency: 1 });
  t.after(cleanup);
  server.queue.start();
  const { pipeline } = makePipeline(server.store, { sourceConfig: { latencyMs: 50, rowsPerStream: 5000 } });
  const first = server.queue.enqueue(pipeline);
  const second = server.queue.enqueue(pipeline);
  await waitFor(() => server.store.getRun(first.id).rowsRead > 0);
  assert.equal(server.queue.cancel(second.id).status, 'cancelled');
  server.queue.cancel(first.id);
  const done = await waitFor(() => { const r = server.store.getRun(first.id); return terminal(r.status) && r; });
  assert.equal(done.status, 'cancelled');
  assert.ok(done.rowsRead < 5000);
});

test('runs interrupted by a restart are re-queued and completed', async (t) => {
  const { server, cleanup } = tempServer();
  t.after(cleanup);
  const { pipeline } = makePipeline(server.store);
  const run = server.store.createRun({ pipelineId: pipeline.id, trigger: 'manual', maxAttempts: 1 });
  server.store.updateRun(run.id, { status: 'running', startedAt: new Date().toISOString(), rowsRead: 40 });
  server.queue.start();
  const done = await waitFor(() => { const r = server.store.getRun(run.id); return terminal(r.status) && r; });
  assert.equal(done.status, 'succeeded');
  assert.equal(done.rowsRead, 100);
  assert.match(server.store.listLogs(run.id)[0].message, /re-queued/);
});

test('scheduler enqueues due pipelines and skips ones already running', async (t) => {
  const { server, cleanup } = tempServer();
  t.after(cleanup);
  const { pipeline } = makePipeline(server.store, { scheduleIntervalSec: 60 });
  makePipeline(server.store); // unscheduled
  assert.equal(server.scheduler.tick(Date.now()).length, 0);
  const fired = server.scheduler.tick(Date.now() + 61_000);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].trigger, 'schedule');
  assert.equal(fired[0].pipelineId, pipeline.id);
  // Still queued (queue not started), so the next due tick is skipped.
  assert.equal(server.scheduler.tick(Date.now() + 200_000).length, 0);
});
