const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { tempServer, waitFor } = require('./helpers');

function setup(t) {
  const { server, cleanup } = tempServer();
  t.after(cleanup);
  server.queue.start();
  return { server, api: request(server.app) };
}

test('meta describes connectors and transforms', async (t) => {
  const { api } = setup(t);
  const res = await api.get('/api/meta').expect(200);
  const types = res.body.connectors.map((c) => c.type);
  for (const t2 of ['sample', 'filesystem', 'http', 'postgres', 'mysql', 'mssql', 'mongodb']) assert.ok(types.includes(t2));
  assert.ok(res.body.transforms.types.filter);
});

test('connections are validated and secrets are never returned', async (t) => {
  const { api, server } = setup(t);
  await api.post('/api/connections').send({ name: 'pg', type: 'postgres', config: { host: 'h' } }).expect(400);
  await api.post('/api/connections').send({ name: 'x', type: 'oracle' }).expect(400);
  const created = await api.post('/api/connections')
    .send({ name: 'Warehouse', type: 'postgres', config: { host: 'db', database: 'dw', user: 'etl', password: 's3cret' } }).expect(201);
  assert.equal(created.body.config.password, '••••••••');
  assert.equal(created.body.config.port, 5432);
  // Saving the masked value back keeps the stored secret.
  await api.put(`/api/connections/${created.body.id}`).send({ name: 'Warehouse 2', config: created.body.config }).expect(200);
  assert.equal(server.store.getConnection(created.body.id).config.password, 's3cret');
  const list = await api.get('/api/connections').expect(200);
  assert.equal(list.body[0].name, 'Warehouse 2');
  assert.ok(!JSON.stringify(list.body).includes('s3cret'));
});

test('connection test reports failures instead of throwing', async (t) => {
  const { api } = setup(t);
  const ok = await api.post('/api/connections/test').send({ type: 'sample', config: {} }).expect(200);
  assert.equal(ok.body.ok, true);
  const bad = await api.post('/api/connections/test').send({ type: 'postgres', config: { host: '127.0.0.1', port: 1, database: 'x', user: 'x' } }).expect(200);
  assert.equal(bad.body.ok, false);
});

test('upload a CSV, preview it, and run a pipeline from it', async (t) => {
  const { api } = setup(t);
  const files = (await api.post('/api/connections').send({ name: 'Files', type: 'filesystem', config: { format: 'csv' } }).expect(201)).body;
  await api.post(`/api/connections/${files.id}/files?name=../../evil.sh`).set('content-type', 'text/csv').send('a').expect(400);
  await api.post(`/api/connections/${files.id}/files?name=people.csv`).set('content-type', 'text/csv')
    .send('id,name,age\n1,ada,36\n2,alan,41\n3,grace,85\n').expect(201);
  const streams = (await api.get(`/api/connections/${files.id}/streams`).expect(200)).body;
  assert.deepEqual(streams.map((s) => s.name), ['people.csv']);
  const preview = (await api.get(`/api/connections/${files.id}/preview?stream=people.csv`).expect(200)).body;
  assert.deepEqual(preview.columns, ['id', 'name', 'age']);

  const transforms = [{ type: 'cast', field: 'age', to: 'integer' }, { type: 'filter', field: 'age', op: 'gte', value: 40 }, { type: 'format', field: 'name', fn: 'upper' }];
  const dry = (await api.post('/api/pipelines/preview').send({ sourceConnectionId: files.id, sourceStream: 'people.csv', transforms }).expect(200)).body;
  assert.deepEqual(dry.output.rows.map((r) => r.name), ['ALAN', 'GRACE']);
  assert.equal(dry.filtered, 1);

  const pipeline = (await api.post('/api/pipelines').send({
    name: 'People', sourceConnectionId: files.id, sourceStream: 'people.csv', destConnectionId: files.id, destTarget: 'seniors', writeMode: 'overwrite', transforms,
  }).expect(201)).body;
  const run = (await api.post(`/api/pipelines/${pipeline.id}/runs`).expect(202)).body;
  const done = await waitFor(async () => { const r = (await api.get(`/api/runs/${run.id}`)).body; return r.status === 'succeeded' && r; });
  assert.equal(done.rowsWritten, 2);
  const out = await api.get(`/api/connections/${files.id}/files/seniors.csv`).expect(200);
  assert.equal(out.text, 'id,name,age\n2,ALAN,41\n3,GRACE,85\n');
  const logs = (await api.get(`/api/runs/${run.id}/logs`).expect(200)).body;
  assert.ok(logs.length >= 4);
});

test('pipeline validation explains what is wrong', async (t) => {
  const { api } = setup(t);
  const sample = (await api.post('/api/connections').send({ name: 'S', type: 'sample' }).expect(201)).body;
  const res = await api.post('/api/pipelines').send({ name: 'Bad', sourceConnectionId: sample.id, sourceStream: 'orders', destConnectionId: sample.id, destTarget: 'x' }).expect(400);
  assert.match(res.body.error, /cannot be used as a destination/);
  const files = (await api.post('/api/connections').send({ name: 'F', type: 'filesystem' }).expect(201)).body;
  const upsert = await api.post('/api/pipelines').send({ name: 'Bad', sourceConnectionId: sample.id, sourceStream: 'orders', destConnectionId: files.id, destTarget: 'x', writeMode: 'upsert' }).expect(400);
  assert.match(upsert.body.error, /does not support "upsert"/);
  await api.delete(`/api/connections/${sample.id}`).expect(204);
});

test('cancel, retry, stats and settings endpoints', async (t) => {
  const { api } = setup(t);
  const sample = (await api.post('/api/connections').send({ name: 'Slow', type: 'sample', config: { latencyMs: 50, rowsPerStream: 5000 } }).expect(201)).body;
  const files = (await api.post('/api/connections').send({ name: 'F', type: 'filesystem' }).expect(201)).body;
  const p = (await api.post('/api/pipelines').send({ name: 'Slow', sourceConnectionId: sample.id, sourceStream: 'events', destConnectionId: files.id, destTarget: 'ev', batchSize: 50 }).expect(201)).body;
  await api.delete(`/api/connections/${sample.id}`).expect(409);
  const run = (await api.post(`/api/pipelines/${p.id}/runs`).expect(202)).body;
  await waitFor(async () => (await api.get(`/api/runs/${run.id}`)).body.status === 'running');
  await api.post(`/api/runs/${run.id}/cancel`).expect(200);
  await waitFor(async () => (await api.get(`/api/runs/${run.id}`)).body.status === 'cancelled');
  await api.post(`/api/runs/${run.id}/cancel`).expect(409);
  const retry = (await api.post(`/api/runs/${run.id}/retry`).expect(202)).body;
  assert.equal(retry.trigger, 'retry');
  await api.post(`/api/runs/${retry.id}/cancel`).expect(200);

  const stats = (await api.get('/api/stats').expect(200)).body;
  assert.equal(stats.pipelines, 1);
  assert.equal(stats.series.length, 14);
  await api.put('/api/settings').send({ concurrency: 0 }).expect(400);
  assert.equal((await api.put('/api/settings').send({ concurrency: 4 }).expect(200)).body.concurrency, 4);
  await api.get('/api/nope').expect(404);
  await waitFor(async () => (await api.get(`/api/runs/${retry.id}`)).body.status === 'cancelled');
  await api.delete(`/api/pipelines/${p.id}`).expect(204);
});
