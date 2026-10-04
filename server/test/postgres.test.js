// Runs against a real PostgreSQL when PG_HOST is set (CI provides one).
const test = require('node:test');
const assert = require('node:assert/strict');
const { tempServer, waitFor, terminal } = require('./helpers');

const PG = process.env.PG_HOST && {
  host: process.env.PG_HOST, port: Number(process.env.PG_PORT || 5432), database: process.env.PG_DATABASE || 'postgres',
  user: process.env.PG_USER || 'postgres', password: process.env.PG_PASSWORD || '',
};

test('postgres source and destination: overwrite, upsert, and filtered loads', { skip: !PG && 'PG_HOST not set' }, async (t) => {
  const { Client } = require('pg');
  const client = new Client(PG);
  await client.connect();
  t.after(() => client.end());
  await client.query(`DROP TABLE IF EXISTS etl_people, etl_adults;
    CREATE TABLE etl_people (id int primary key, name text, age int);
    INSERT INTO etl_people SELECT g, 'p' || g, g % 90 FROM generate_series(1, 1234) g;
    CREATE TABLE etl_adults (id int primary key, name text, age int);`);

  const { server, cleanup } = tempServer();
  t.after(cleanup);
  server.queue.start();
  const { store } = server;
  const conn = store.createConnection({ name: 'pg', type: 'postgres', config: PG });
  const pg = require('../connectors').getConnector('postgres');
  assert.equal((await pg.test(PG)).ok, true);
  const streams = (await pg.listStreams(PG)).map((s) => s.name);
  assert.ok(streams.includes('public.etl_people'));
  await assert.rejects(pg.count(PG, 'etl_people; DROP TABLE etl_people'), /was not found/);

  const run = async (writeMode) => {
    const p = store.createPipeline({
      name: `adults-${writeMode}`, sourceConnectionId: conn.id, sourceStream: 'etl_people', destConnectionId: conn.id, destTarget: 'etl_adults',
      writeMode, upsertKey: 'id', batchSize: 100, maxRetries: 0,
      transforms: [{ type: 'filter', field: 'age', op: 'gte', value: 18 }, { type: 'format', field: 'name', fn: 'upper' }],
    });
    const queued = server.queue.enqueue(p);
    return waitFor(() => { const r = store.getRun(queued.id); return terminal(r.status) && r; }, { timeout: 15000 });
  };

  const first = await run('overwrite');
  assert.equal(first.status, 'succeeded', first.error);
  assert.equal(first.rowsRead, 1234);
  const count = async () => Number((await client.query('SELECT COUNT(*) AS n FROM etl_adults')).rows[0].n);
  assert.equal(await count(), first.rowsWritten);

  const second = await run('upsert');
  assert.equal(second.status, 'succeeded', second.error);
  assert.equal(await count(), first.rowsWritten);
  const { rows } = await client.query('SELECT name FROM etl_adults WHERE id = 20');
  assert.equal(rows[0].name, 'P20');
  await client.query('DROP TABLE etl_people, etl_adults');
});
