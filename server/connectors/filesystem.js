const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { parseCsv, parseCsvRows, toCsvLine } = require('../lib/csv');

// Files stored under DATA_DIR/files/<connectionId>. Works as a source (uploaded
// CSV / JSONL files) and as a destination (pipeline outputs).

const dirFor = (ctx) => path.join(ctx.dataDir, 'files', ctx.connectionId);

function safeName(name) {
  const base = path.basename(String(name || '')).replace(/[^\w.\-]/g, '_');
  if (!base || base.startsWith('.')) throw new Error(`Invalid file name "${name}"`);
  return base;
}

function fileFor(config, ctx, stream) {
  const ext = config.format === 'jsonl' ? '.jsonl' : '.csv';
  let name = safeName(stream);
  if (!name.endsWith('.csv') && !name.endsWith('.jsonl')) name += ext;
  return path.join(dirFor(ctx), name);
}

async function readAll(file) {
  const text = await fsp.readFile(file, 'utf8');
  if (file.endsWith('.jsonl')) {
    return text.split('\n').filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`Invalid JSON on line ${i + 1} of ${path.basename(file)}`); }
    });
  }
  return parseCsv(text);
}

module.exports = {
  type: 'filesystem',
  label: 'File storage',
  category: 'Files',
  description: 'CSV or JSON Lines files. Upload files to use as a source, or write pipeline output.',
  roles: ['source', 'destination'],
  writeModes: ['append', 'overwrite'],
  fields: [
    { key: 'format', label: 'Output format', type: 'select', options: ['csv', 'jsonl'], default: 'csv' },
  ],
  safeName,

  async test(config, ctx) {
    await fsp.mkdir(dirFor(ctx), { recursive: true });
    return { ok: true, message: 'Storage is writable' };
  },

  async listStreams(config, ctx) {
    const dir = dirFor(ctx);
    if (!fs.existsSync(dir)) return [];
    const files = (await fsp.readdir(dir)).filter((f) => /\.(csv|jsonl)$/.test(f));
    return Promise.all(files.sort().map(async (name) => {
      const stat = await fsp.stat(path.join(dir, name));
      return { name, description: `${(stat.size / 1024).toFixed(1)} KB`, size: stat.size, updatedAt: stat.mtime.toISOString() };
    }));
  },

  async count(config, stream, ctx) {
    return (await readAll(fileFor(config, ctx, stream))).length;
  },

  async *read(config, stream, { batchSize, signal, ctx }) {
    const file = fileFor(config, ctx, stream);
    if (!fs.existsSync(file)) throw new Error(`File "${stream}" not found`);
    const rows = await readAll(file);
    for (let i = 0; i < rows.length; i += batchSize) {
      if (signal?.aborted) return;
      yield rows.slice(i, i + batchSize);
    }
  },

  async openWriter(config, target, { mode, ctx }) {
    if (mode === 'upsert') throw new Error('File storage supports append or overwrite, not upsert');
    const file = fileFor(config, ctx, target);
    const isCsv = file.endsWith('.csv');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    // Overwrite writes to a temp file and swaps it in on commit, so a failed
    // run never leaves a half-written output behind.
    const out = mode === 'overwrite' ? `${file}.tmp-${process.pid}-${Date.now()}` : file;
    let header = null;
    if (isCsv && mode !== 'overwrite' && fs.existsSync(file)) {
      const first = (await fsp.readFile(file, 'utf8')).split(/\r?\n/)[0];
      header = first ? parseCsvRows(first)[0] : null;
    }
    const handle = await fsp.open(out, mode === 'overwrite' ? 'w' : 'a');
    return {
      async write(rows) {
        if (!rows.length) return 0;
        let chunk = '';
        if (isCsv) {
          if (!header) {
            header = [...new Set(rows.flatMap((r) => Object.keys(r)))];
            chunk += toCsvLine(header);
          }
          for (const r of rows) chunk += toCsvLine(header.map((h) => r[h]));
        } else {
          for (const r of rows) chunk += `${JSON.stringify(r)}\n`;
        }
        await handle.write(chunk);
        return rows.length;
      },
      async commit() {
        await handle.close();
        if (out !== file) await fsp.rename(out, file);
      },
      async abort() {
        await handle.close().catch(() => {});
        if (out !== file) await fsp.rm(out, { force: true });
      },
    };
  },
};
