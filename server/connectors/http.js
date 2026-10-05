// REST/JSON API source. Fetches a URL and extracts an array of records.

function getPath(obj, dotted) {
  if (!dotted) return obj;
  return String(dotted).split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function parseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { throw new Error('Headers must be valid JSON'); }
}

async function fetchRecords(config, signal) {
  const res = await fetch(config.url, { headers: { accept: 'application/json', ...parseHeaders(config.headers) }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${config.url}`);
  const body = await res.json();
  const records = getPath(body, config.recordsPath);
  if (!Array.isArray(records)) throw new Error(`Expected an array at "${config.recordsPath || '(root)'}"`);
  return records.map((r) => (r && typeof r === 'object' ? r : { value: r }));
}

module.exports = {
  type: 'http',
  label: 'REST API',
  category: 'APIs',
  description: 'Pull JSON records from any HTTP endpoint.',
  roles: ['source'],
  fields: [
    { key: 'url', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://api.example.com/v1/items' },
    { key: 'recordsPath', label: 'Records path', type: 'text', placeholder: 'data.items', help: 'Dot path to the array in the response. Blank means the root.' },
    { key: 'headers', label: 'Headers (JSON)', type: 'textarea', secret: true, placeholder: '{"Authorization": "Bearer …"}' },
  ],

  async test(config) {
    const records = await fetchRecords(config);
    return { ok: true, message: `Fetched ${records.length} records` };
  },

  async listStreams() {
    return [{ name: 'records', description: 'Records returned by the endpoint' }];
  },

  async count(config, stream, { signal } = {}) {
    return (await fetchRecords(config, signal)).length;
  },

  async *read(config, stream, { batchSize, signal }) {
    const records = await fetchRecords(config, signal);
    for (let i = 0; i < records.length; i += batchSize) yield records.slice(i, i + batchSize);
  },
};
