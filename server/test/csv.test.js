const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, toCsvLine } = require('../lib/csv');

test('parses quoted fields, escaped quotes and CRLF', () => {
  const rows = parseCsv('id,name,note\r\n1,"Smith, Jane","said ""hi"""\r\n2,Bob,\r\n');
  assert.deepEqual(rows, [{ id: '1', name: 'Smith, Jane', note: 'said "hi"' }, { id: '2', name: 'Bob', note: '' }]);
});

test('round-trips values that need quoting', () => {
  const line = toCsvLine(['a,b', 'x"y', null, 3, { k: 1 }]);
  assert.equal(line, '"a,b","x""y",,3,"{""k"":1}"\n');
  assert.deepEqual(parseCsv(`c1,c2,c3,c4,c5\n${line}`)[0], { c1: 'a,b', c2: 'x"y', c3: '', c4: '3', c5: '{"k":1}' });
});
