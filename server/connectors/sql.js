// Relational database connectors: PostgreSQL, MySQL and SQL Server.
// Table names are validated against the catalog and identifiers are quoted, so
// pipeline config can never inject SQL.

const DIALECTS = {
  postgres: {
    label: 'PostgreSQL',
    defaultPort: 5432,
    quote: (id) => `"${String(id).replace(/"/g, '""')}"`,
    async connect(c) {
      const { Pool } = require('pg');
      const pool = new Pool({ host: c.host, port: Number(c.port) || 5432, database: c.database, user: c.user, password: c.password, ssl: c.ssl === 'true' ? { rejectUnauthorized: false } : undefined, max: 2 });
      return {
        query: async (sql, params = []) => (await pool.query(sql, params)).rows,
        close: () => pool.end(),
      };
    },
    param: (i) => `$${i}`,
    tablesSql: "SELECT table_schema || '.' || table_name AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1",
    page: (table, limit, offset) => `SELECT * FROM ${table} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`,
    upsert: (sql, cols, key, q) => `${sql} ON CONFLICT (${q(key)}) DO UPDATE SET ${cols.filter((c) => c !== key).map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}`,
  },
  mysql: {
    label: 'MySQL',
    defaultPort: 3306,
    quote: (id) => `\`${String(id).replace(/`/g, '``')}\``,
    async connect(c) {
      const mysql = require('mysql2/promise');
      const pool = mysql.createPool({ host: c.host, port: Number(c.port) || 3306, database: c.database, user: c.user, password: c.password, connectionLimit: 2 });
      return {
        query: async (sql, params = []) => (await pool.query(sql, params))[0],
        close: () => pool.end(),
      };
    },
    param: () => '?',
    tablesSql: "SELECT CONCAT(table_schema, '.', table_name) AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = DATABASE() ORDER BY 1",
    page: (table, limit, offset) => `SELECT * FROM ${table} LIMIT ${limit} OFFSET ${offset}`,
    upsert: (sql, cols, key, q) => `${sql} ON DUPLICATE KEY UPDATE ${cols.filter((c) => c !== key).map((c) => `${q(c)} = VALUES(${q(c)})`).join(', ')}`,
  },
  mssql: {
    label: 'SQL Server',
    defaultPort: 1433,
    quote: (id) => `[${String(id).replace(/]/g, ']]')}]`,
    async connect(c) {
      const mssql = require('mssql');
      const pool = await new mssql.ConnectionPool({ server: c.host, port: Number(c.port) || 1433, database: c.database, user: c.user, password: c.password, options: { encrypt: c.ssl === 'true', trustServerCertificate: true } }).connect();
      return {
        async query(sql, params = []) {
          const req = pool.request();
          params.forEach((p, i) => req.input(`p${i + 1}`, p));
          return (await req.query(sql)).recordset || [];
        },
        close: () => pool.close(),
      };
    },
    param: (i) => `@p${i}`,
    tablesSql: "SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY 1",
    page: (table, limit, offset) => `SELECT * FROM ${table} ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    upsert: null,
  },
};

function makeConnector(kind) {
  const d = DIALECTS[kind];
  const qualified = (name) => String(name).split('.').map(d.quote).join('.');

  async function withConn(config, fn) {
    const conn = await d.connect(config);
    try { return await fn(conn); } finally { await conn.close().catch(() => {}); }
  }

  async function assertTable(conn, stream) {
    const tables = (await conn.query(d.tablesSql)).map((r) => r.name ?? r.NAME);
    const match = tables.find((t) => t === stream || t.split('.').pop() === stream);
    if (!match) throw new Error(`Table "${stream}" was not found`);
    return qualified(match);
  }

  return {
    type: kind,
    label: d.label,
    category: 'Databases',
    description: `Read from or load into ${d.label} tables.`,
    roles: ['source', 'destination'],
    writeModes: d.upsert ? ['append', 'overwrite', 'upsert'] : ['append', 'overwrite'],
    fields: [
      { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', default: d.defaultPort },
      { key: 'database', label: 'Database', type: 'text', required: true },
      { key: 'user', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', secret: true },
      { key: 'ssl', label: 'Use SSL', type: 'select', options: ['false', 'true'], default: 'false' },
    ],

    async test(config) {
      return withConn(config, async (conn) => {
        const tables = await conn.query(d.tablesSql);
        return { ok: true, message: `Connected. ${tables.length} tables visible.` };
      });
    },

    async listStreams(config) {
      return withConn(config, async (conn) => (await conn.query(d.tablesSql)).map((r) => ({ name: r.name ?? r.NAME })));
    },

    async count(config, stream) {
      return withConn(config, async (conn) => {
        const table = await assertTable(conn, stream);
        const [row] = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
        return Number(row.n ?? Object.values(row)[0]);
      });
    },

    async *read(config, stream, { batchSize, signal }) {
      const conn = await d.connect(config);
      try {
        const table = await assertTable(conn, stream);
        for (let offset = 0; ; offset += batchSize) {
          if (signal?.aborted) return;
          const rows = await conn.query(d.page(table, Number(batchSize), Number(offset)));
          if (!rows.length) return;
          yield rows;
          if (rows.length < batchSize) return;
        }
      } finally {
        await conn.close().catch(() => {});
      }
    },

    async openWriter(config, target, { mode, upsertKey }) {
      if (mode === 'upsert' && !d.upsert) throw new Error(`${d.label} destinations do not support upsert`);
      const conn = await d.connect(config);
      let table;
      try {
        table = await assertTable(conn, target);
        if (mode === 'overwrite') await conn.query(`DELETE FROM ${table}`);
      } catch (err) {
        await conn.close().catch(() => {});
        throw err;
      }
      return {
        async write(rows) {
          if (!rows.length) return 0;
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
          const params = [];
          const values = rows.map((r) => `(${cols.map((c) => { params.push(r[c] ?? null); return d.param(params.length); }).join(', ')})`);
          let sql = `INSERT INTO ${table} (${cols.map(d.quote).join(', ')}) VALUES ${values.join(', ')}`;
          if (mode === 'upsert') sql = d.upsert(sql, cols, upsertKey, d.quote);
          await conn.query(sql, params);
          return rows.length;
        },
        commit: () => conn.close(),
        abort: () => conn.close().catch(() => {}),
      };
    },
  };
}

module.exports = { postgres: makeConnector('postgres'), mysql: makeConnector('mysql'), mssql: makeConnector('mssql') };
