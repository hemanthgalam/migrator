const { sleep } = require('../lib/util');

// Built-in demo source: deterministic synthetic datasets, with knobs to
// simulate slow sources and transient failures so async behaviour is visible.

const FIRST = ['Ada', 'Grace', 'Alan', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim', 'Frances', 'Edsger'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Berners-Lee', 'Allen', 'Dijkstra'];
const COUNTRIES = ['US', 'GB', 'DE', 'IN', 'BR', 'JP', 'FR', 'CA'];
const PLANS = ['free', 'starter', 'growth', 'enterprise'];
const ORDER_STATUS = ['pending', 'paid', 'shipped', 'refunded'];
const EVENTS = ['page_view', 'signup', 'login', 'add_to_cart', 'checkout', 'logout'];

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const BASE = Date.UTC(2026, 0, 1);

const DATASETS = {
  customers: {
    description: 'SaaS customer accounts with contact details and plan',
    row(i, rand) {
      const first = pick(rand, FIRST);
      const last = pick(rand, LAST);
      return {
        id: i + 1,
        first_name: first,
        last_name: last,
        email: `${first}.${last}${i}@example.com`.toLowerCase(),
        country: pick(rand, COUNTRIES),
        plan: pick(rand, PLANS),
        mrr: Math.round(rand() * 50000) / 100,
        // Every 10th customer is a duplicate signup of the previous one.
        signup_at: new Date(BASE + i * 3600_000).toISOString(),
        is_active: rand() > 0.15 ? 'true' : 'false',
      };
    },
  },
  orders: {
    description: 'E-commerce orders with amounts and fulfilment status',
    row(i, rand) {
      return {
        order_id: `ORD-${String(i + 1).padStart(6, '0')}`,
        customer_id: 1 + Math.floor(rand() * 500),
        amount: (Math.round(rand() * 100000) / 100).toFixed(2),
        currency: 'USD',
        status: pick(rand, ORDER_STATUS),
        created_at: new Date(BASE + i * 600_000).toISOString(),
      };
    },
  },
  events: {
    description: 'Product analytics clickstream events',
    row(i, rand) {
      return {
        event_id: i + 1,
        user_id: 1 + Math.floor(rand() * 2000),
        event: pick(rand, EVENTS),
        path: pick(rand, ['/', '/pricing', '/docs', '/app', '/settings']),
        duration_ms: Math.floor(rand() * 5000),
        ts: new Date(BASE + i * 1000).toISOString(),
      };
    },
  },
};

const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));

module.exports = {
  type: 'sample',
  label: 'Sample data',
  category: 'Demo',
  description: 'Generated demo datasets. Tune latency and failures to see async processing in action.',
  roles: ['source'],
  fields: [
    { key: 'rowsPerStream', label: 'Rows per dataset', type: 'number', default: 1000 },
    { key: 'latencyMs', label: 'Latency per batch (ms)', type: 'number', default: 0, help: 'Simulate a slow source.' },
    { key: 'failAfterRows', label: 'Fail after N rows', type: 'number', default: 0, help: '0 disables simulated failures.' },
    { key: 'failAttempts', label: 'Fail on first N attempts', type: 'number', default: 1, help: 'Lets retries recover.' },
  ],

  async test() {
    return { ok: true, message: 'Sample data is always available' };
  },

  async listStreams() {
    return Object.entries(DATASETS).map(([name, d]) => ({ name, description: d.description }));
  },

  async count(config, stream) {
    if (!DATASETS[stream]) throw new Error(`Unknown sample dataset "${stream}"`);
    return num(config.rowsPerStream, 1000);
  },

  async *read(config, stream, { batchSize, signal, attempt = 1 }) {
    const dataset = DATASETS[stream];
    if (!dataset) throw new Error(`Unknown sample dataset "${stream}"`);
    const total = num(config.rowsPerStream, 1000);
    const latency = num(config.latencyMs, 0);
    const failAfter = num(config.failAfterRows, 0);
    const failAttempts = num(config.failAttempts, 1);
    const rand = prng(stream.length * 7919);
    for (let offset = 0; offset < total; offset += batchSize) {
      if (latency) await sleep(latency, signal);
      if (failAfter && offset >= failAfter && attempt <= failAttempts) {
        throw new Error(`Simulated source failure after ${offset} rows (attempt ${attempt})`);
      }
      const rows = [];
      for (let i = offset; i < Math.min(total, offset + batchSize); i++) rows.push(dataset.row(i, rand));
      yield rows;
    }
  },
};
