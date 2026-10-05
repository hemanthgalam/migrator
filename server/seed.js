// First-boot demo workspace so the console is useful immediately.
function seedDemo(store) {
  if (store.getSetting('seeded', false)) return;
  store.setSetting('seeded', true);
  if (store.listConnections().length) return;

  const sample = store.createConnection({ name: 'Demo SaaS data', type: 'sample', config: { rowsPerStream: 2500, latencyMs: 150, failAfterRows: 0, failAttempts: 1 } });
  const lake = store.createConnection({ name: 'Analytics lake', type: 'filesystem', config: { format: 'csv' } });

  store.createPipeline({
    name: 'Active customers to lake',
    description: 'Clean, mask and deduplicate active customer accounts for analytics.',
    sourceConnectionId: sample.id,
    sourceStream: 'customers',
    destConnectionId: lake.id,
    destTarget: 'active_customers',
    writeMode: 'overwrite',
    batchSize: 250,
    maxRetries: 2,
    transforms: [
      { type: 'filter', field: 'is_active', op: 'eq', value: 'true' },
      { type: 'dedupe', keys: ['email'] },
      { type: 'derive', field: 'full_name', template: '{first_name} {last_name}' },
      { type: 'mask', field: 'email', strategy: 'email' },
      { type: 'cast', field: 'mrr', to: 'number' },
      { type: 'select', fields: ['id', 'full_name', 'email', 'country', 'plan', 'mrr', 'signup_at'] },
    ],
  });

  store.createPipeline({
    name: 'Paid orders sync',
    description: 'Hourly load of paid and shipped orders.',
    sourceConnectionId: sample.id,
    sourceStream: 'orders',
    destConnectionId: lake.id,
    destTarget: 'paid_orders',
    writeMode: 'overwrite',
    batchSize: 500,
    maxRetries: 3,
    scheduleIntervalSec: 3600,
    transforms: [
      { type: 'filter', field: 'status', op: 'in', value: 'paid,shipped' },
      { type: 'cast', field: 'amount', to: 'number' },
      { type: 'rename', mapping: { created_at: 'ordered_at' } },
    ],
  });
}

module.exports = { seedDemo };
