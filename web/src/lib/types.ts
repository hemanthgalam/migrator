export type RunStatus = 'queued' | 'retrying' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select' | 'textarea';
  required?: boolean;
  default?: string | number;
  options?: string[];
  placeholder?: string;
  help?: string;
  secret?: boolean;
}

export interface ConnectorMeta {
  type: string;
  label: string;
  category: string;
  description: string;
  roles: ('source' | 'destination')[];
  fields: Field[];
  writeModes: string[];
}

export interface Meta {
  connectors: ConnectorMeta[];
  transforms: {
    types: Record<string, { label: string; required: string[] }>;
    filterOps: string[];
    castTypes: string[];
    formatFns: string[];
    maskStrategies: string[];
  };
}

export interface Connection {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Stream {
  name: string;
  description?: string;
}

export type TransformStep = { type: string } & Record<string, unknown>;

export interface Run {
  id: string;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  trigger: 'manual' | 'schedule' | 'retry';
  attempt: number;
  maxAttempts: number;
  rowsRead: number;
  rowsWritten: number;
  rowsFiltered: number;
  batches: number;
  rowsTotal: number | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string | null;
  version: number;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  sourceConnectionId: string;
  sourceStream: string;
  destConnectionId: string;
  destTarget: string;
  writeMode: 'append' | 'overwrite' | 'upsert';
  upsertKey: string | null;
  transforms: TransformStep[];
  batchSize: number;
  maxRetries: number;
  scheduleIntervalSec: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun?: Run | null;
  runCount?: number;
  successCount?: number;
}

export interface LogEntry {
  id: number;
  runId: string;
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface Stats {
  windowDays: number;
  runs: number;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
  rowsWritten: number;
  successRate: number | null;
  avgDurationMs: number | null;
  pipelines: number;
  scheduledPipelines: number;
  connections: number;
  series: { day: string; succeeded: number; failed: number; other: number; rowsWritten: number }[];
  queue: { concurrency: number; active: number };
}

export interface Preview {
  columns: string[];
  rows: Record<string, unknown>[];
}
