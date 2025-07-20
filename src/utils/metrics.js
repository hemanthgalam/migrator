const promClient = require('prom-client');
const logger = require('./logger');

/**
 * Metrics Collection System for Observability
 * Provides Prometheus-compatible metrics for monitoring
 */
class MetricsCollector {
  constructor() {
    // Create a Registry to register the metrics
    this.register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'sql_mongo_migrator_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
    });

    // Initialize custom metrics
    this.initializeMetrics();
    
    logger.info('Metrics collector initialized');
  }

  /**
   * Initialize custom application metrics
   */
  initializeMetrics() {
    // HTTP Request metrics
    this.httpRequestsTotal = new promClient.Counter({
      name: 'sql_mongo_migrator_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'sql_mongo_migrator_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.register]
    });

    // Database Connection metrics
    this.databaseConnections = new promClient.Gauge({
      name: 'sql_mongo_migrator_database_connections',
      help: 'Number of active database connections',
      labelNames: ['database_type', 'status'],
      registers: [this.register]
    });

    this.databaseOperationsTotal = new promClient.Counter({
      name: 'sql_mongo_migrator_database_operations_total',
      help: 'Total number of database operations',
      labelNames: ['database_type', 'operation', 'status'],
      registers: [this.register]
    });

    this.databaseOperationDuration = new promClient.Histogram({
      name: 'sql_mongo_migrator_database_operation_duration_seconds',
      help: 'Duration of database operations in seconds',
      labelNames: ['database_type', 'operation'],
      buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    // Migration metrics
    this.migrationsTotal = new promClient.Counter({
      name: 'sql_mongo_migrator_migrations_total',
      help: 'Total number of migrations performed',
      labelNames: ['source_db', 'target_db', 'status'],
      registers: [this.register]
    });

    this.migrationRecordsProcessed = new promClient.Counter({
      name: 'sql_mongo_migrator_migration_records_processed_total',
      help: 'Total number of records processed during migrations',
      labelNames: ['source_table', 'target_collection'],
      registers: [this.register]
    });

    this.migrationDuration = new promClient.Histogram({
      name: 'sql_mongo_migrator_migration_duration_seconds',
      help: 'Duration of migration operations in seconds',
      labelNames: ['source_table', 'target_collection'],
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
      registers: [this.register]
    });

    // CDC metrics
    this.cdcJobsActive = new promClient.Gauge({
      name: 'sql_mongo_migrator_cdc_jobs_active',
      help: 'Number of active CDC jobs',
      registers: [this.register]
    });

    this.cdcRecordsProcessed = new promClient.Counter({
      name: 'sql_mongo_migrator_cdc_records_processed_total',
      help: 'Total number of records processed by CDC',
      labelNames: ['job_id', 'table_name'],
      registers: [this.register]
    });

    this.cdcPollingDuration = new promClient.Histogram({
      name: 'sql_mongo_migrator_cdc_polling_duration_seconds',
      help: 'Duration of CDC polling operations in seconds',
      labelNames: ['job_id'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    this.cdcErrors = new promClient.Counter({
      name: 'sql_mongo_migrator_cdc_errors_total',
      help: 'Total number of CDC errors',
      labelNames: ['job_id', 'error_type'],
      registers: [this.register]
    });

    // System metrics
    this.memoryUsage = new promClient.Gauge({
      name: 'sql_mongo_migrator_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.register]
    });

    this.activeConnections = new promClient.Gauge({
      name: 'sql_mongo_migrator_active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.register]
    });

    // Error metrics
    this.errorsTotal = new promClient.Counter({
      name: 'sql_mongo_migrator_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'severity'],
      registers: [this.register]
    });

    // Business metrics
    this.businessEvents = new promClient.Counter({
      name: 'sql_mongo_migrator_business_events_total',
      help: 'Total number of business events',
      labelNames: ['event_type'],
      registers: [this.register]
    });
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method, route, statusCode, duration) {
    const labels = { method, route, status_code: statusCode };
    
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration / 1000); // Convert to seconds
    
    logger.debug('HTTP request metrics recorded', { method, route, statusCode, duration });
  }

  /**
   * Record database connection metrics
   */
  recordDatabaseConnection(databaseType, status, count = 1) {
    this.databaseConnections.set({ database_type: databaseType, status }, count);
    
    logger.debug('Database connection metrics recorded', { databaseType, status, count });
  }

  /**
   * Record database operation metrics
   */
  recordDatabaseOperation(databaseType, operation, status, duration) {
    const labels = { database_type: databaseType, operation, status };
    
    this.databaseOperationsTotal.inc(labels);
    this.databaseOperationDuration.observe(
      { database_type: databaseType, operation }, 
      duration / 1000
    );
    
    logger.debug('Database operation metrics recorded', { databaseType, operation, status, duration });
  }

  /**
   * Record migration metrics
   */
  recordMigration(sourceDb, targetDb, status, recordsProcessed, duration, sourceTable, targetCollection) {
    this.migrationsTotal.inc({ source_db: sourceDb, target_db: targetDb, status });
    
    if (recordsProcessed) {
      this.migrationRecordsProcessed.inc(
        { source_table: sourceTable, target_collection: targetCollection }, 
        recordsProcessed
      );
    }
    
    if (duration) {
      this.migrationDuration.observe(
        { source_table: sourceTable, target_collection: targetCollection }, 
        duration / 1000
      );
    }
    
    logger.debug('Migration metrics recorded', { 
      sourceDb, targetDb, status, recordsProcessed, duration, sourceTable, targetCollection 
    });
  }

  /**
   * Record CDC job metrics
   */
  recordCdcJob(jobId, tableName, recordsProcessed, duration, errorType = null) {
    if (recordsProcessed) {
      this.cdcRecordsProcessed.inc({ job_id: jobId, table_name: tableName }, recordsProcessed);
    }
    
    if (duration) {
      this.cdcPollingDuration.observe({ job_id: jobId }, duration / 1000);
    }
    
    if (errorType) {
      this.cdcErrors.inc({ job_id: jobId, error_type: errorType });
    }
    
    logger.debug('CDC metrics recorded', { jobId, tableName, recordsProcessed, duration, errorType });
  }

  /**
   * Update active CDC jobs count
   */
  updateActiveCdcJobs(count) {
    this.cdcJobsActive.set(count);
    logger.debug('Active CDC jobs updated', { count });
  }

  /**
   * Record system metrics
   */
  recordSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
    this.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
    this.memoryUsage.set({ type: 'external' }, memUsage.external);
    
    logger.debug('System metrics recorded', memUsage);
  }

  /**
   * Record error metrics
   */
  recordError(type, severity = 'error') {
    this.errorsTotal.inc({ type, severity });
    logger.debug('Error metrics recorded', { type, severity });
  }

  /**
   * Record business event metrics
   */
  recordBusinessEvent(eventType) {
    this.businessEvents.inc({ event_type: eventType });
    logger.debug('Business event metrics recorded', { eventType });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics() {
    // Update system metrics before returning
    this.recordSystemMetrics();
    
    return await this.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsAsJson() {
    const metrics = await this.register.getMetricsAsJSON();
    return metrics;
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics() {
    this.register.clear();
    this.initializeMetrics();
    logger.debug('Metrics cleared and reinitialized');
  }

  /**
   * Create a timer for measuring operation duration
   */
  startTimer() {
    return Date.now();
  }

  /**
   * Calculate duration from timer
   */
  endTimer(startTime) {
    return Date.now() - startTime;
  }

  /**
   * Get current metrics summary
   */
  async getSummary() {
    const metrics = await this.getMetricsAsJson();
    
    return {
      timestamp: new Date().toISOString(),
      totalMetrics: metrics.length,
      httpRequests: this.httpRequestsTotal._hashMap.size,
      databaseOperations: this.databaseOperationsTotal._hashMap.size,
      migrations: this.migrationsTotal._hashMap.size,
      cdcJobs: this.cdcJobsActive.get(),
      errors: this.errorsTotal._hashMap.size
    };
  }
}

// Create singleton instance
const metrics = new MetricsCollector();

// Start periodic system metrics collection
setInterval(() => {
  metrics.recordSystemMetrics();
}, 30000); // Every 30 seconds

module.exports = metrics;
module.exports.MetricsCollector = MetricsCollector;