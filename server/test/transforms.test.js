const test = require('node:test');
const assert = require('node:assert/strict');
const { compileTransforms, validateTransforms } = require('../engine/transforms');

const rows = [
  { id: '1', first: 'ada', last: 'lovelace', email: 'ada@example.com', plan: 'pro', mrr: '10.5', active: 'true' },
  { id: '2', first: 'alan', last: 'turing', email: 'alan@example.com', plan: 'free', mrr: '', active: 'false' },
  { id: '3', first: 'ada', last: 'lovelace', email: 'ada@example.com', plan: 'pro', mrr: '7', active: 'yes' },
];

test('select, drop and rename reshape rows', () => {
  const out = compileTransforms([
    { type: 'select', fields: ['id', 'first', 'email'] },
    { type: 'drop', fields: 'email' },
    { type: 'rename', mapping: { first: 'first_name' } },
  ])(rows).rows;
  assert.deepEqual(out[0], { id: '1', first_name: 'ada' });
});

test('filter supports comparison, list and existence operators', () => {
  const run = (step) => compileTransforms([step])(rows);
  assert.equal(run({ type: 'filter', field: 'mrr', op: 'gt', value: '8' }).rows.length, 1);
  assert.equal(run({ type: 'filter', field: 'plan', op: 'in', value: 'pro, enterprise' }).rows.length, 2);
  assert.equal(run({ type: 'filter', field: 'mrr', op: 'notExists' }).rows.length, 1);
  assert.equal(run({ type: 'filter', field: 'email', op: 'contains', value: 'ALAN' }).rows.length, 1);
  assert.equal(run({ type: 'filter', field: 'plan', op: 'neq', value: 'pro' }).filtered, 2);
});

test('cast, format, derive, default and mask', () => {
  const [r] = compileTransforms([
    { type: 'cast', field: 'mrr', to: 'number' },
    { type: 'cast', field: 'active', to: 'boolean' },
    { type: 'format', field: 'first', fn: 'title' },
    { type: 'derive', field: 'name', template: '{first} {last}' },
    { type: 'mask', field: 'email', strategy: 'email' },
    { type: 'default', field: 'region', value: 'unknown' },
  ])(rows.slice(0, 1)).rows;
  assert.equal(r.mrr, 10.5);
  assert.equal(r.active, true);
  assert.equal(r.name, 'Ada lovelace');
  assert.equal(r.email, 'a***@example.com');
  assert.equal(r.region, 'unknown');
});

test('hash masking is deterministic and cast handles bad values', () => {
  const apply = compileTransforms([{ type: 'mask', field: 'email', strategy: 'hash' }, { type: 'cast', field: 'mrr', to: 'integer' }]);
  const out = apply(rows).rows;
  assert.equal(out[0].email, out[2].email);
  assert.notEqual(out[0].email, out[1].email);
  assert.equal(out[1].mrr, null);
});

test('dedupe keeps state across batches within a run', () => {
  const apply = compileTransforms([{ type: 'dedupe', keys: ['email'] }]);
  assert.equal(apply(rows.slice(0, 2)).rows.length, 2);
  const second = apply(rows.slice(2));
  assert.equal(second.rows.length, 0);
  assert.equal(second.filtered, 1);
});

test('validateTransforms reports unknown types and missing fields', () => {
  assert.deepEqual(validateTransforms([]), []);
  const errors = validateTransforms([{ type: 'nope' }, { type: 'filter', field: 'x' }, { type: 'cast', field: 'x', to: 'blob' }]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /unknown transform type/);
  assert.match(errors[1], /"op" is required/);
  assert.match(errors[2], /unknown type "blob"/);
});
