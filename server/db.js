const fs = require('fs');
const path = require('path');

// node:sqlite prints an ExperimentalWarning on first load; it is stable enough for a metadata store.
const originalEmit = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (String(warning).includes('SQLite')) return;
  return originalEmit.call(process, warning, ...args);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = originalEmit;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_connection_id TEXT NOT NULL REFERENCES connections(id),
  source_stream TEXT NOT NULL,
  dest_connection_id TEXT NOT NULL REFERENCES connections(id),
  dest_target TEXT NOT NULL,
  write_mode TEXT NOT NULL DEFAULT 'append',
  upsert_key TEXT,
  transforms TEXT NOT NULL DEFAULT '[]',
  batch_size INTEGER NOT NULL DEFAULT 500,
  max_retries INTEGER NOT NULL DEFAULT 2,
  schedule_interval_sec INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scheduled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  rows_filtered INTEGER NOT NULL DEFAULT 0,
  batches INTEGER NOT NULL DEFAULT 0,
  rows_total INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  next_attempt_at TEXT
);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS runs_pipeline_idx ON runs(pipeline_id, queued_at);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS run_logs_run_idx ON run_logs(run_id, id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Columns added after the first release.
  const runColumns = db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name);
  if (!runColumns.includes('version')) db.exec('ALTER TABLE runs ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
  return db;
}

module.exports = { openDatabase };
