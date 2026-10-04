# Migrator

Migrator is a self-hosted ETL platform. You connect sources and destinations, build pipelines that **extract → transform → load** data in batches, and run them asynchronously on a worker pool with live progress, retries, cancellation and schedules, all from a SaaS-style web console.

![stack](https://img.shields.io/badge/stack-Node%2022%20·%20Express%20·%20SQLite%20·%20React%20·%20Tailwind-4f46e5)

## Features

- **Async execution engine**: every run is a job in a persistent queue (SQLite). A configurable worker pool executes runs concurrently, never runs the same pipeline twice at once, and re-queues runs that were interrupted by a restart.
- **Retries with exponential backoff** per pipeline, plus manual retry of failed or cancelled runs.
- **Cancellation** of queued or running jobs; overwrite loads are staged and swapped in only on success, so a failed or cancelled run never leaves half-written output.
- **Scheduler** for interval-based pipelines (every minute up to daily), skipping a tick while a run is still in flight.
- **Streaming batches**: sources are read as async iterators, transformed and loaded batch by batch with progress reported after every batch.
- **Transforms**: select, drop, rename, filter (=, ≠, <, >, contains, in, present/empty), cast, format text, derive from template, fill nulls, mask PII (redact, hash, email) and deduplicate. Preview them against live sample rows before saving.
- **Connectors**

  | Connector | Source | Destination | Write modes |
  |---|---|---|---|
  | PostgreSQL | ✓ | ✓ | append, overwrite, upsert |
  | MySQL | ✓ | ✓ | append, overwrite, upsert |
  | SQL Server | ✓ | ✓ | append, overwrite |
  | MongoDB | ✓ | ✓ | append, overwrite, upsert |
  | File storage (CSV / JSONL, with uploads) | ✓ | ✓ | append, overwrite |
  | REST API (JSON) | ✓ | | |
  | Sample data (demo, with simulated latency and failures) | ✓ | | |

- **Live console**: dashboard with KPIs and run outcomes, pipeline builder wizard, run pages with streaming logs (Server-Sent Events), connection browser with data previews, dark mode, responsive layout.
- **Safe by default**: secrets are never returned to the browser, SQL identifiers are validated against the catalog and quoted, uploads are confined to the connection's folder.

## Quick start

```bash
npm install
npm run build      # build the web console
npm start          # http://localhost:3000
```

A demo workspace (sample source, file storage destination and two pipelines) is created on first boot. Set `SEED_DEMO=false` to start empty.

For development with hot reload (API on :3000, Vite on :5173):

```bash
npm run dev
```

With Docker, including Postgres, MySQL and MongoDB to try the database connectors:

```bash
docker compose up --build
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./.data` | SQLite metadata store and file storage |
| `WORKER_CONCURRENCY` | `2` | Concurrent runs (also editable in Settings) |
| `RETRY_BASE_MS` | `2000` | First retry delay; doubles each attempt |
| `SCHEDULER_INTERVAL_MS` | `5000` | How often schedules are checked |
| `SEED_DEMO` | `true` | Create the demo workspace on first boot |

## Architecture

```
web/ (React + Vite + Tailwind)  ──REST + SSE──▶  server/app.js (Express)
                                                    │
                       ┌────────────────────────────┼───────────────────────────┐
                       ▼                            ▼                           ▼
              engine/queue.js              engine/scheduler.js          connectors/*
       persistent job queue, worker     enqueues due pipelines       read() async batches,
       pool, retries, cancellation                                    openWriter() staged loads
                       │
                       ▼
              engine/runner.js ──▶ engine/transforms.js
       extract → transform → load, per-batch progress
                       │
                       ▼
              store.js / db.js (node:sqlite): connections, pipelines, runs, logs
```

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/meta` | Connector and transform catalog |
| `GET/POST/PUT/DELETE` | `/api/connections[/:id]` | Manage connections |
| `POST` | `/api/connections/test`, `/api/connections/:id/test` | Test settings |
| `GET` | `/api/connections/:id/streams`, `/preview?stream=` | Browse and preview data |
| `POST` | `/api/connections/:id/files?name=` | Upload a CSV/JSONL file |
| `GET/POST/PUT/PATCH/DELETE` | `/api/pipelines[/:id]` | Manage pipelines |
| `POST` | `/api/pipelines/preview` | Dry-run transforms on sample rows |
| `POST` | `/api/pipelines/:id/runs` | Queue a run (returns 202) |
| `GET` | `/api/runs`, `/api/runs/:id`, `/api/runs/:id/logs` | Inspect runs |
| `POST` | `/api/runs/:id/cancel`, `/api/runs/:id/retry` | Control runs |
| `GET` | `/api/stats`, `/api/settings`, `/api/health` | Dashboard, settings, health |
| `GET` | `/api/events` | Server-Sent Events stream of run, log and queue updates |

## Testing

```bash
npm run typecheck   # web app types
npm test            # engine, queue, API (and Postgres when PG_HOST is set)
npm run test:e2e    # builds the console, then runs Playwright end-to-end tests
```

The Playwright suite drives the real app in Chromium: building a pipeline in the wizard and running it, live progress and cancellation, concurrency limits and queueing, retries with backoff, permanent failures and manual retry, schedules, CSV uploads and previews, connection testing and secret masking, dark mode, and mobile navigation. CI runs everything on each pull request, with a Postgres service for the connector test.
