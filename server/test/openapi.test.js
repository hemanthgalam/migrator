const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { spec } = require('../openapi');
const { tempServer } = require('./helpers');

test('every API route is documented, and nothing else is', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const routes = [...source.matchAll(/api\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map(([, method, route]) => `${method} ${route.replace(/:(\w+)/g, '{$1}')}`).sort();
  const documented = Object.entries(spec.paths)
    .flatMap(([route, ops]) => Object.keys(ops).filter((k) => k !== 'parameters').map((m) => `${m} ${route}`)).sort();
  assert.deepEqual(documented, routes);
});

test('every schema reference resolves', () => {
  const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
  for (const name of new Set(refs)) assert.ok(spec.components.schemas[name], `missing schema ${name}`);
});

test('the server serves its OpenAPI document', async (t) => {
  const { server, cleanup } = tempServer();
  t.after(cleanup);
  const res = await request(server.app).get('/api/openapi.json').expect(200);
  assert.equal(res.body.openapi, '3.1.0');
  assert.ok(res.body.paths['/pipelines/{id}/runs'].post);
});

test('operation ids are set and unique', () => {
  const ids = Object.values(spec.paths).flatMap((ops) => Object.entries(ops).filter(([k]) => k !== 'parameters').map(([, op]) => op.operationId));
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
});
