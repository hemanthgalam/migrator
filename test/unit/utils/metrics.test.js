const { expect, sinon } = require('chai');
const metrics = require('../../../src/utils/metrics');

describe('Metrics', () => {
  beforeEach(() => {
    // Clear metrics before each test
    metrics.clearMetrics();
  });

  afterEach(() => {
    // Clean up after each test
    metrics.clearMetrics();
  });

  describe('initialization', () => {
    it('should initialize with default metrics', async () => {
      const metricsData = await metrics.getMetricsAsJson();
      
      expect(metricsData).to.be.an('array');
      expect(metricsData.length).to.be.greaterThan(0);
      
      // Check for some expected default metrics
      const metricNames = metricsData.map(m => m.name);
      expect(metricNames).to.include('sql_mongo_migrator_http_requests_total');
      expect(metricNames).to.include('sql_mongo_migrator_database_connections');
      expect(metricNames).to.include('sql_mongo_migrator_migrations_total');
    });
  });

  describe('HTTP request metrics', () => {
    it('should record HTTP request metrics', async () => {
      metrics.recordHttpRequest('GET', '/api/users', 200, 150);
      
      const metricsData = await metrics.getMetricsAsJson();
      const httpRequestsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_http_requests_total');
      
      expect(httpRequestsMetric).to.exist;
      expect(httpRequestsMetric.values).to.have.length.greaterThan(0);
      
      const requestValue = httpRequestsMetric.values.find(v => 
        v.labels.method === 'GET' && 
        v.labels.route === '/api/users' && 
        v.labels.status_code === '200'
      );
      
      expect(requestValue).to.exist;
      expect(requestValue.value).to.equal(1);
    });

    it('should record HTTP request duration', async () => {
      metrics.recordHttpRequest('POST', '/api/migration', 201, 2500);
      
      const metricsData = await metrics.getMetricsAsJson();
      const durationMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_http_request_duration_seconds');
      
      expect(durationMetric).to.exist;
      expect(durationMetric.values).to.have.length.greaterThan(0);
    });
  });

  describe('database metrics', () => {
    it('should record database connection metrics', async () => {
      metrics.recordDatabaseConnection('mysql', 'active', 5);
      
      const metricsData = await metrics.getMetricsAsJson();
      const connectionMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_database_connections');
      
      expect(connectionMetric).to.exist;
      
      const connectionValue = connectionMetric.values.find(v => 
        v.labels.database_type === 'mysql' && 
        v.labels.status === 'active'
      );
      
      expect(connectionValue).to.exist;
      expect(connectionValue.value).to.equal(5);
    });

    it('should record database operation metrics', async () => {
      metrics.recordDatabaseOperation('mongodb', 'insert', 'success', 100);
      
      const metricsData = await metrics.getMetricsAsJson();
      const operationMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_database_operations_total');
      
      expect(operationMetric).to.exist;
      
      const operationValue = operationMetric.values.find(v => 
        v.labels.database_type === 'mongodb' && 
        v.labels.operation === 'insert' && 
        v.labels.status === 'success'
      );
      
      expect(operationValue).to.exist;
      expect(operationValue.value).to.equal(1);
    });
  });

  describe('migration metrics', () => {
    it('should record migration metrics', async () => {
      metrics.recordMigration('mysql', 'mongodb', 'success', 1000, 5000, 'users', 'users_sync');
      
      const metricsData = await metrics.getMetricsAsJson();
      
      // Check migration total
      const migrationMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_migrations_total');
      expect(migrationMetric).to.exist;
      
      const migrationValue = migrationMetric.values.find(v => 
        v.labels.source_db === 'mysql' && 
        v.labels.target_db === 'mongodb' && 
        v.labels.status === 'success'
      );
      
      expect(migrationValue).to.exist;
      expect(migrationValue.value).to.equal(1);
      
      // Check records processed
      const recordsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_migration_records_processed_total');
      expect(recordsMetric).to.exist;
      
      const recordsValue = recordsMetric.values.find(v => 
        v.labels.source_table === 'users' && 
        v.labels.target_collection === 'users_sync'
      );
      
      expect(recordsValue).to.exist;
      expect(recordsValue.value).to.equal(1000);
    });
  });

  describe('CDC metrics', () => {
    it('should record CDC job metrics', async () => {
      metrics.recordCdcJob('job-123', 'users', 50, 200);
      
      const metricsData = await metrics.getMetricsAsJson();
      const recordsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_cdc_records_processed_total');
      
      expect(recordsMetric).to.exist;
      
      const recordsValue = recordsMetric.values.find(v => 
        v.labels.job_id === 'job-123' && 
        v.labels.table_name === 'users'
      );
      
      expect(recordsValue).to.exist;
      expect(recordsValue.value).to.equal(50);
    });

    it('should update active CDC jobs count', async () => {
      metrics.updateActiveCdcJobs(3);
      
      const metricsData = await metrics.getMetricsAsJson();
      const activeJobsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_cdc_jobs_active');
      
      expect(activeJobsMetric).to.exist;
      expect(activeJobsMetric.values[0].value).to.equal(3);
    });

    it('should record CDC errors', async () => {
      metrics.recordCdcJob('job-456', 'orders', 0, 100, 'CONNECTION_ERROR');
      
      const metricsData = await metrics.getMetricsAsJson();
      const errorsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_cdc_errors_total');
      
      expect(errorsMetric).to.exist;
      
      const errorValue = errorsMetric.values.find(v => 
        v.labels.job_id === 'job-456' && 
        v.labels.error_type === 'CONNECTION_ERROR'
      );
      
      expect(errorValue).to.exist;
      expect(errorValue.value).to.equal(1);
    });
  });

  describe('error metrics', () => {
    it('should record error metrics', async () => {
      metrics.recordError('VALIDATION_ERROR', 'warning');
      
      const metricsData = await metrics.getMetricsAsJson();
      const errorsMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_errors_total');
      
      expect(errorsMetric).to.exist;
      
      const errorValue = errorsMetric.values.find(v => 
        v.labels.type === 'VALIDATION_ERROR' && 
        v.labels.severity === 'warning'
      );
      
      expect(errorValue).to.exist;
      expect(errorValue.value).to.equal(1);
    });
  });

  describe('business event metrics', () => {
    it('should record business event metrics', async () => {
      metrics.recordBusinessEvent('user_migration_completed');
      
      const metricsData = await metrics.getMetricsAsJson();
      const businessMetric = metricsData.find(m => m.name === 'sql_mongo_migrator_business_events_total');
      
      expect(businessMetric).to.exist;
      
      const eventValue = businessMetric.values.find(v => 
        v.labels.event_type === 'user_migration_completed'
      );
      
      expect(eventValue).to.exist;
      expect(eventValue.value).to.equal(1);
    });
  });

  describe('system metrics', () => {
    it('should record system metrics', () => {
      // System metrics are recorded automatically
      metrics.recordSystemMetrics();
      
      // This test mainly ensures the method doesn't throw
      expect(true).to.be.true;
    });
  });

  describe('timer utilities', () => {
    it('should provide timer utilities', () => {
      const startTime = metrics.startTimer();
      expect(startTime).to.be.a('number');
      
      setTimeout(() => {
        const duration = metrics.endTimer(startTime);
        expect(duration).to.be.a('number');
        expect(duration).to.be.greaterThan(0);
      }, 10);
    });
  });

  describe('metrics summary', () => {
    it('should provide metrics summary', async () => {
      // Add some metrics
      metrics.recordHttpRequest('GET', '/api/test', 200, 100);
      metrics.recordDatabaseOperation('mysql', 'select', 'success', 50);
      metrics.recordMigration('mysql', 'mongodb', 'success', 100, 1000, 'test', 'test');
      metrics.updateActiveCdcJobs(2);
      metrics.recordError('TEST_ERROR', 'error');
      
      const summary = await metrics.getSummary();
      
      expect(summary).to.be.an('object');
      expect(summary).to.have.property('timestamp');
      expect(summary).to.have.property('totalMetrics');
      expect(summary).to.have.property('httpRequests');
      expect(summary).to.have.property('databaseOperations');
      expect(summary).to.have.property('migrations');
      expect(summary).to.have.property('cdcJobs');
      expect(summary).to.have.property('errors');
      
      expect(summary.cdcJobs).to.equal(2);
    });
  });

  describe('Prometheus format', () => {
    it('should return metrics in Prometheus format', async () => {
      metrics.recordHttpRequest('GET', '/api/test', 200, 100);
      
      const prometheusMetrics = await metrics.getMetrics();
      
      expect(prometheusMetrics).to.be.a('string');
      expect(prometheusMetrics).to.include('sql_mongo_migrator_http_requests_total');
      expect(prometheusMetrics).to.include('TYPE counter');
      expect(prometheusMetrics).to.include('HELP');
    });
  });
});