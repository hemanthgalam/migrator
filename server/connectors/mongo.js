// MongoDB connector, usable as a source (collections) or destination.

async function withClient(config, fn) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try { return await fn(client.db(config.database)); } finally { await client.close().catch(() => {}); }
}

const plain = (doc) => {
  const { _id, ...rest } = doc;
  return { _id: _id?.toString?.() ?? _id, ...rest };
};

module.exports = {
  type: 'mongodb',
  label: 'MongoDB',
  category: 'Databases',
  description: 'Read collections or load documents into MongoDB.',
  roles: ['source', 'destination'],
  writeModes: ['append', 'overwrite', 'upsert'],
  fields: [
    { key: 'uri', label: 'Connection URI', type: 'password', required: true, secret: true, placeholder: 'mongodb://user:pass@localhost:27017' },
    { key: 'database', label: 'Database', type: 'text', required: true },
  ],

  async test(config) {
    return withClient(config, async (db) => {
      await db.command({ ping: 1 });
      const cols = await db.listCollections().toArray();
      return { ok: true, message: `Connected. ${cols.length} collections.` };
    });
  },

  async listStreams(config) {
    return withClient(config, async (db) => (await db.listCollections().toArray()).map((c) => ({ name: c.name })).sort((a, b) => a.name.localeCompare(b.name)));
  },

  async count(config, stream) {
    return withClient(config, (db) => db.collection(stream).estimatedDocumentCount());
  },

  async *read(config, stream, { batchSize, signal }) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    try {
      const cursor = client.db(config.database).collection(stream).find({}, { batchSize });
      let batch = [];
      for await (const doc of cursor) {
        if (signal?.aborted) return;
        batch.push(plain(doc));
        if (batch.length >= batchSize) { yield batch; batch = []; }
      }
      if (batch.length) yield batch;
    } finally {
      await client.close().catch(() => {});
    }
  },

  async openWriter(config, target, { mode, upsertKey, runId }) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(config.database);
    // Overwrite loads a staging collection and renames it over the target on commit.
    const staging = mode === 'overwrite' ? `${target}__staging_${runId || Date.now()}` : target;
    const col = db.collection(staging);
    return {
      async write(rows) {
        if (!rows.length) return 0;
        if (mode === 'upsert') {
          await col.bulkWrite(rows.map((r) => ({ updateOne: { filter: { [upsertKey]: r[upsertKey] }, update: { $set: r }, upsert: true } })), { ordered: false });
        } else {
          await col.insertMany(rows.map((r) => ({ ...r })), { ordered: false });
        }
        return rows.length;
      },
      async commit() {
        try {
          if (staging !== target) {
            const exists = await db.listCollections({ name: staging }).hasNext();
            if (exists) await db.collection(staging).rename(target, { dropTarget: true });
            else await db.collection(target).deleteMany({});
          }
        } finally {
          await client.close();
        }
      },
      async abort() {
        if (staging !== target) await db.collection(staging).drop().catch(() => {});
        await client.close().catch(() => {});
      },
    };
  },
};
