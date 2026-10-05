// OpenAPI 3.1 description of the REST API. Served at /api/openapi.json and
// rendered as the API reference at /api-docs/ (also on the static Pages demo).
// Enums come from the connector and transform catalogs so they cannot drift.
const { CONNECTORS } = require('./connectors');
const { STEP_TYPES, FILTER_OPS, CAST_TYPES, FORMAT_FNS, MASK_STRATEGIES } = require('./engine/transforms');
const { version } = require('../package.json');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const ok = (description, schema) => ({ description, content: json(schema) });
const err = (description) => ({ description, content: json(ref('Error')) });
const idParam = (what) => ({ name: 'id', in: 'path', required: true, description: `${what} id`, schema: { type: 'string' } });
const body = (schema, required = true) => ({ required, content: json(schema) });
const iso = { type: 'string', format: 'date-time' };
const nullable = (schema) => ({ ...schema, type: [schema.type, 'null'] });

const RUN_STATUSES = ['queued', 'retrying', 'running', 'succeeded', 'failed', 'cancelled'];

const schemas = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', example: 'Pipeline not found' },
      details: { type: 'array', items: { type: 'string' }, description: 'Every validation error, when there is more than one' },
    },
  },
  Field: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      label: { type: 'string' },
      type: { type: 'string', enum: ['text', 'number', 'password', 'select', 'textarea'] },
      required: { type: 'boolean' },
      default: { type: ['string', 'number'] },
      options: { type: 'array', items: { type: 'string' } },
      placeholder: { type: 'string' },
      help: { type: 'string' },
      secret: { type: 'boolean', description: 'Masked as •••••••• in every response' },
    },
  },
  ConnectorMeta: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: Object.keys(CONNECTORS) },
      label: { type: 'string' },
      category: { type: 'string' },
      description: { type: 'string' },
      roles: { type: 'array', items: { type: 'string', enum: ['source', 'destination'] } },
      fields: { type: 'array', items: ref('Field') },
      writeModes: { type: 'array', items: { type: 'string', enum: ['append', 'overwrite', 'upsert'] } },
    },
  },
  Meta: {
    type: 'object',
    properties: {
      connectors: { type: 'array', items: ref('ConnectorMeta') },
      transforms: {
        type: 'object',
        properties: {
          types: {
            type: 'object',
            description: 'Step type → label and required keys',
            additionalProperties: { type: 'object', properties: { label: { type: 'string' }, required: { type: 'array', items: { type: 'string' } } } },
          },
          filterOps: { type: 'array', items: { type: 'string' } },
          castTypes: { type: 'array', items: { type: 'string' } },
          formatFns: { type: 'array', items: { type: 'string' } },
          maskStrategies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  Connection: {
    type: 'object',
    properties: {
      id: { type: 'string', readOnly: true },
      name: { type: 'string' },
      type: { type: 'string', enum: Object.keys(CONNECTORS) },
      config: { type: 'object', additionalProperties: true, description: 'Connector settings; the fields come from `GET /meta`. Secrets are returned masked.' },
      createdAt: { ...iso, readOnly: true },
      updatedAt: { ...iso, readOnly: true },
    },
  },
  ConnectionInput: {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: { type: 'string', example: 'Warehouse' },
      type: { type: 'string', enum: Object.keys(CONNECTORS), description: 'Ignored on update; a connection keeps its type' },
      config: { type: 'object', additionalProperties: true, example: { host: 'db', database: 'dw', user: 'etl', password: 's3cret' }, description: 'Sending the masked value for a secret keeps the stored one' },
    },
  },
  TestResult: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
  },
  Stream: {
    type: 'object',
    properties: { name: { type: 'string', example: 'customers' }, description: { type: 'string' } },
  },
  Preview: {
    type: 'object',
    properties: {
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
  TransformStep: {
    type: 'object',
    required: ['type'],
    additionalProperties: true,
    description: [
      'One declarative step; steps run in order. Keys per type:',
      ...Object.entries(STEP_TYPES).map(([k, v]) => `- \`${k}\` (${v.label}): ${v.required.map((r) => `\`${r}\``).join(', ')}`),
      '',
      `Filter ops: ${FILTER_OPS.join(', ')}. Cast types: ${CAST_TYPES.join(', ')}. Format functions: ${FORMAT_FNS.join(', ')}. Mask strategies: ${MASK_STRATEGIES.join(', ')}.`,
    ].join('\n'),
    properties: {
      type: { type: 'string', enum: Object.keys(STEP_TYPES) },
    },
    example: { type: 'filter', field: 'country', op: 'eq', value: 'US' },
  },
  PipelineInput: {
    type: 'object',
    required: ['name', 'sourceConnectionId', 'sourceStream', 'destConnectionId', 'destTarget'],
    properties: {
      name: { type: 'string', example: 'Customers to warehouse' },
      description: { type: 'string' },
      sourceConnectionId: { type: 'string' },
      sourceStream: { type: 'string', description: 'Table, collection, file or dataset to read', example: 'customers' },
      destConnectionId: { type: 'string' },
      destTarget: { type: 'string', description: 'Table, collection or file to write', example: 'customers' },
      writeMode: { type: 'string', enum: ['append', 'overwrite', 'upsert'], default: 'append', description: 'Overwrite writes are staged and swapped in on success' },
      upsertKey: { type: ['string', 'null'], description: 'Required for upsert writes' },
      transforms: { type: 'array', items: ref('TransformStep'), default: [] },
      batchSize: { type: 'integer', minimum: 1, maximum: 50000, default: 500 },
      maxRetries: { type: 'integer', minimum: 0, maximum: 10, default: 2, description: 'Retries with exponential backoff after a failed attempt' },
      scheduleIntervalSec: { type: ['integer', 'null'], minimum: 10, description: 'Run every N seconds; null for manual only' },
      enabled: { type: 'boolean', default: true, description: 'Disabled pipelines are skipped by the scheduler' },
    },
  },
  Pipeline: {
    allOf: [
      ref('PipelineInput'),
      {
        type: 'object',
        properties: {
          id: { type: 'string', readOnly: true },
          createdAt: { ...iso, readOnly: true },
          updatedAt: { ...iso, readOnly: true },
          lastRun: { anyOf: [ref('Run'), { type: 'null' }], readOnly: true },
          runCount: { type: 'integer', readOnly: true },
          successCount: { type: 'integer', readOnly: true },
        },
      },
    ],
  },
  Run: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      pipelineId: { type: 'string' },
      pipelineName: { type: 'string' },
      status: { type: 'string', enum: RUN_STATUSES },
      trigger: { type: 'string', enum: ['manual', 'schedule', 'retry'] },
      attempt: { type: 'integer' },
      maxAttempts: { type: 'integer' },
      rowsRead: { type: 'integer' },
      rowsWritten: { type: 'integer' },
      rowsFiltered: { type: 'integer' },
      batches: { type: 'integer' },
      rowsTotal: { type: ['integer', 'null'], description: 'Source row count when the connector can count' },
      error: { type: ['string', 'null'] },
      queuedAt: iso,
      startedAt: nullable(iso),
      finishedAt: nullable(iso),
      nextAttemptAt: { ...nullable(iso), description: 'When a retrying run is next picked up' },
      version: { type: 'integer', description: 'Bumps on every change; keep the highest when merging API and event updates' },
    },
  },
  LogEntry: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      runId: { type: 'string' },
      ts: iso,
      level: { type: 'string', enum: ['info', 'warn', 'error', 'success'] },
      message: { type: 'string' },
    },
  },
  QueueStatus: {
    type: 'object',
    properties: {
      concurrency: { type: 'integer' },
      active: { type: 'integer' },
      activeRunIds: { type: 'array', items: { type: 'string' } },
    },
  },
  Stats: {
    type: 'object',
    properties: {
      windowDays: { type: 'integer' },
      runs: { type: 'integer' },
      succeeded: { type: 'integer' },
      failed: { type: 'integer' },
      running: { type: 'integer' },
      queued: { type: 'integer' },
      rowsWritten: { type: 'integer' },
      successRate: { type: ['number', 'null'] },
      avgDurationMs: { type: ['number', 'null'] },
      pipelines: { type: 'integer' },
      scheduledPipelines: { type: 'integer' },
      connections: { type: 'integer' },
      series: {
        type: 'array',
        items: {
          type: 'object',
          properties: { day: { type: 'string', format: 'date' }, succeeded: { type: 'integer' }, failed: { type: 'integer' }, other: { type: 'integer' }, rowsWritten: { type: 'integer' } },
        },
      },
      queue: ref('QueueStatus'),
    },
  },
  Settings: {
    type: 'object',
    properties: { concurrency: { type: 'integer', minimum: 1, maximum: 16, description: 'Runs processed at the same time' } },
  },
};

const notFound = err('Not found');
const badRequest = err('Validation failed');

const paths = {
  '/health': {
    get: { tags: ['System'], summary: 'Health check', responses: { 200: ok('Server is up', { type: 'object', properties: { status: { const: 'ok' }, queue: ref('QueueStatus'), uptime: { type: 'number' } } }) } },
  },
  '/meta': {
    get: { tags: ['System'], summary: 'Connector and transform catalog', responses: { 200: ok('Catalog', ref('Meta')) } },
  },
  '/connections': {
    get: { tags: ['Connections'], summary: 'List connections', responses: { 200: ok('Connections', { type: 'array', items: ref('Connection') }) } },
    post: { tags: ['Connections'], summary: 'Create a connection', requestBody: body(ref('ConnectionInput')), responses: { 201: ok('Created', ref('Connection')), 400: badRequest } },
  },
  '/connections/test': {
    post: {
      tags: ['Connections'], summary: 'Test unsaved settings',
      description: 'Connector errors are reported in the result, not as an HTTP error.',
      requestBody: body({ type: 'object', required: ['type'], properties: { type: { type: 'string', enum: Object.keys(CONNECTORS) }, config: { type: 'object', additionalProperties: true } } }),
      responses: { 200: ok('Test result', ref('TestResult')), 400: badRequest },
    },
  },
  '/connections/{id}': {
    parameters: [idParam('Connection')],
    get: { tags: ['Connections'], summary: 'Get a connection', responses: { 200: ok('Connection', ref('Connection')), 404: notFound } },
    put: { tags: ['Connections'], summary: 'Update a connection', requestBody: body(ref('ConnectionInput')), responses: { 200: ok('Updated', ref('Connection')), 400: badRequest, 404: notFound } },
    delete: { tags: ['Connections'], summary: 'Delete a connection', responses: { 204: { description: 'Deleted' }, 404: notFound, 409: err('Used by a pipeline') } },
  },
  '/connections/{id}/test': {
    parameters: [idParam('Connection')],
    post: { tags: ['Connections'], summary: 'Test a saved connection', responses: { 200: ok('Test result', ref('TestResult')), 404: notFound } },
  },
  '/connections/{id}/streams': {
    parameters: [idParam('Connection')],
    get: { tags: ['Connections'], summary: 'List tables, collections or files', responses: { 200: ok('Streams', { type: 'array', items: ref('Stream') }), 404: notFound, 502: err('The source could not be reached') } },
  },
  '/connections/{id}/preview': {
    parameters: [
      idParam('Connection'),
      { name: 'stream', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 200 } },
    ],
    get: { tags: ['Connections'], summary: 'Preview rows from a stream', responses: { 200: ok('Rows', ref('Preview')), 400: badRequest, 404: notFound, 502: err('The source could not be read') } },
  },
  '/connections/{id}/files': {
    parameters: [idParam('Connection'), { name: 'name', in: 'query', required: true, description: 'File name ending in .csv or .jsonl', schema: { type: 'string', example: 'leads.csv' } }],
    post: {
      tags: ['Connections'], summary: 'Upload a file to file storage',
      description: 'The request body is the raw file content.',
      requestBody: { required: true, content: { 'text/csv': { schema: { type: 'string' } }, 'application/x-ndjson': { schema: { type: 'string' } } } },
      responses: { 201: ok('Stored', { type: 'object', properties: { name: { type: 'string' } } }), 400: badRequest, 404: notFound },
    },
  },
  '/connections/{id}/files/{name}': {
    parameters: [idParam('Connection'), { name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
    get: { tags: ['Connections'], summary: 'Download a stored file', responses: { 200: { description: 'File content', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 400: badRequest, 404: notFound } },
  },
  '/pipelines': {
    get: { tags: ['Pipelines'], summary: 'List pipelines', responses: { 200: ok('Pipelines with their latest run', { type: 'array', items: ref('Pipeline') }) } },
    post: { tags: ['Pipelines'], summary: 'Create a pipeline', requestBody: body(ref('PipelineInput')), responses: { 201: ok('Created', ref('Pipeline')), 400: badRequest } },
  },
  '/pipelines/preview': {
    post: {
      tags: ['Pipelines'], summary: 'Dry-run transforms on sample rows',
      description: 'Reads a sample from the source and applies the transforms without saving or writing anything.',
      requestBody: body({
        type: 'object',
        required: ['sourceConnectionId', 'sourceStream'],
        properties: {
          sourceConnectionId: { type: 'string' },
          sourceStream: { type: 'string' },
          transforms: { type: 'array', items: ref('TransformStep') },
          limit: { type: 'integer', default: 25, maximum: 200 },
        },
      }),
      responses: {
        200: ok('Rows before and after the transforms', { type: 'object', properties: { input: ref('Preview'), output: ref('Preview'), filtered: { type: 'integer', description: 'Rows removed by filters and dedupe' } } }),
        400: badRequest, 404: notFound, 502: err('The source could not be read'),
      },
    },
  },
  '/pipelines/{id}': {
    parameters: [idParam('Pipeline')],
    get: { tags: ['Pipelines'], summary: 'Get a pipeline', responses: { 200: ok('Pipeline', ref('Pipeline')), 404: notFound } },
    put: { tags: ['Pipelines'], summary: 'Update a pipeline', description: 'Fields left out keep their current value.', requestBody: body(ref('PipelineInput')), responses: { 200: ok('Updated', ref('Pipeline')), 400: badRequest, 404: notFound } },
    patch: { tags: ['Pipelines'], summary: 'Pause or resume a pipeline', requestBody: body({ type: 'object', properties: { enabled: { type: 'boolean' } } }), responses: { 200: ok('Updated', ref('Pipeline')), 404: notFound } },
    delete: { tags: ['Pipelines'], summary: 'Delete a pipeline', description: 'Queued and running runs are cancelled first.', responses: { 204: { description: 'Deleted' }, 404: notFound, 409: err('A run is still stopping') } },
  },
  '/pipelines/{id}/runs': {
    parameters: [idParam('Pipeline')],
    post: {
      tags: ['Runs'], summary: 'Queue a run',
      description: 'Returns immediately with the queued run. A worker picks it up when one is free; follow progress with `GET /runs/{id}` or `GET /events`.',
      responses: { 202: ok('Queued', ref('Run')), 404: notFound },
    },
  },
  '/runs': {
    get: {
      tags: ['Runs'], summary: 'List runs', description: 'Newest first.',
      parameters: [
        { name: 'status', in: 'query', description: `Comma-separated statuses (${RUN_STATUSES.join(', ')})`, schema: { type: 'string', example: 'failed,cancelled' } },
        { name: 'pipelineId', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { 200: ok('Runs', { type: 'array', items: ref('Run') }) },
    },
  },
  '/runs/{id}': {
    parameters: [idParam('Run')],
    get: { tags: ['Runs'], summary: 'Get a run', responses: { 200: ok('Run', ref('Run')), 404: notFound } },
  },
  '/runs/{id}/logs': {
    parameters: [idParam('Run'), { name: 'after', in: 'query', description: 'Only entries with a larger id', schema: { type: 'integer', default: 0 } }],
    get: { tags: ['Runs'], summary: 'Get run logs', responses: { 200: ok('Log entries, oldest first', { type: 'array', items: ref('LogEntry') }), 404: notFound } },
  },
  '/runs/{id}/cancel': {
    parameters: [idParam('Run')],
    post: { tags: ['Runs'], summary: 'Cancel a run', description: 'Stops a running run between batches; nothing is committed for overwrite writes.', responses: { 200: ok('Cancelled', ref('Run')), 404: notFound, 409: err('The run already finished') } },
  },
  '/runs/{id}/retry': {
    parameters: [idParam('Run')],
    post: { tags: ['Runs'], summary: 'Retry a failed or cancelled run', responses: { 202: ok('A new queued run', ref('Run')), 404: notFound, 409: err('The run did not fail and was not cancelled') } },
  },
  '/stats': {
    get: {
      tags: ['System'], summary: 'Dashboard metrics',
      parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 14, maximum: 90 } }],
      responses: { 200: ok('Metrics', ref('Stats')) },
    },
  },
  '/settings': {
    get: { tags: ['System'], summary: 'Get worker settings', responses: { 200: ok('Settings', ref('Settings')) } },
    put: { tags: ['System'], summary: 'Change worker concurrency', description: 'Takes effect immediately and is saved across restarts.', requestBody: body(ref('Settings')), responses: { 200: ok('Settings', ref('Settings')), 400: badRequest } },
  },
  '/events': {
    get: {
      tags: ['System'], summary: 'Live updates (Server-Sent Events)',
      description: [
        'A `text/event-stream` with three event types, each carrying JSON in `data`:',
        '- `run`: a `Run` whenever its status or progress changes',
        '- `log`: a `LogEntry` as it is written',
        '- `queue`: a `QueueStatus` when concurrency changes',
        '',
        'Use `EventSource("/api/events")` in a browser. A comment ping is sent every 15 seconds.',
      ].join('\n'),
      responses: { 200: { description: 'Event stream', content: { 'text/event-stream': { schema: { type: 'string' }, example: 'event: run\ndata: {"id":"…","status":"running","rowsWritten":500,…}\n\n' } } } },
    },
  },
  '/openapi.json': {
    get: { tags: ['System'], summary: 'This document', responses: { 200: { description: 'OpenAPI 3.1 document', content: json({ type: 'object' }) } } },
  },
};

const OPERATION_IDS = {
  'get /health': 'getHealth', 'get /meta': 'getMeta',
  'get /connections': 'listConnections', 'post /connections': 'createConnection', 'post /connections/test': 'testConnectionSettings',
  'get /connections/{id}': 'getConnection', 'put /connections/{id}': 'updateConnection', 'delete /connections/{id}': 'deleteConnection',
  'post /connections/{id}/test': 'testConnection', 'get /connections/{id}/streams': 'listStreams', 'get /connections/{id}/preview': 'previewStream',
  'post /connections/{id}/files': 'uploadFile', 'get /connections/{id}/files/{name}': 'downloadFile',
  'get /pipelines': 'listPipelines', 'post /pipelines': 'createPipeline', 'post /pipelines/preview': 'previewTransforms',
  'get /pipelines/{id}': 'getPipeline', 'put /pipelines/{id}': 'updatePipeline', 'patch /pipelines/{id}': 'setPipelineEnabled', 'delete /pipelines/{id}': 'deletePipeline',
  'post /pipelines/{id}/runs': 'queueRun', 'get /runs': 'listRuns', 'get /runs/{id}': 'getRun', 'get /runs/{id}/logs': 'getRunLogs',
  'post /runs/{id}/cancel': 'cancelRun', 'post /runs/{id}/retry': 'retryRun',
  'get /stats': 'getStats', 'get /settings': 'getSettings', 'put /settings': 'updateSettings', 'get /events': 'streamEvents', 'get /openapi.json': 'getOpenApi',
};
for (const [route, ops] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(ops)) if (method !== 'parameters') op.operationId = OPERATION_IDS[`${method} ${route}`];
}

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Migrator API',
    version,
    description: [
      'REST API for Migrator, an ETL tool with async processing. Connections describe where data lives, pipelines describe how it moves and is transformed, and runs are queued and processed by a pool of background workers with retries, cancellation and schedules.',
      '',
      'All bodies are JSON. Errors return `{ "error": "…" }` with a 4xx or 5xx status. Secrets in connection settings are never returned; they come back as `••••••••`.',
      '',
      'The API has no authentication of its own; run it on a private network or behind a reverse proxy that adds it.',
    ].join('\n'),
    license: { name: 'MIT', identifier: 'MIT' },
  },
  servers: [{ url: '/api' }],
  security: [],
  tags: [
    { name: 'Connections', description: 'Sources and destinations: sample data, file storage, HTTP, PostgreSQL, MySQL, SQL Server, MongoDB' },
    { name: 'Pipelines', description: 'Extract, transform and load definitions' },
    { name: 'Runs', description: 'Asynchronous executions of a pipeline' },
    { name: 'System', description: 'Catalog, metrics, settings and live events' },
  ],
  paths,
  components: { schemas },
};

module.exports = { spec };
