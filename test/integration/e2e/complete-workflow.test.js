const request = require('supertest');
const { expect, sinon } = require('chai');
const express = require('express');
const TestUtils = require('../../helpers/testUtils');

// Import all route modules
const sqlRoutes = require('../../../src/routes/sql');
const mongoRoutes = require('../../../src/routes/mongo');
const migrationRoutes = require('../../../src/routes/migration');
const cdcRoutes = require('../../../src/routes/cdc');

// Import services for stubbing
const sqlConnector = require('../../../src/database/sqlConnector');
const mongoConnector = require('../../../src/database/mongoConnector');
const cdcService = require('../../../src/services/cdcService');

describe('End-to-End Workflow Tests', () => {
  let app, sqlStub, mongoStub, cdcStub;
  let sqlConnectionKey, mongoConnectionKey;

  beforeEach(() => {
    // Create test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    
    // Mount routes
    app.use('/api/sql', sqlRoutes);
    app.use('/api/mongo', mongoRoutes);
    app.use('/api/migration', migrationRoutes);
    app.use('/api/cdc', cdcRoutes);

    // Setup stubs
    sqlStub = sinon.stub(sqlConnector);
    mongoStub = sinon.stub(mongoConnector);
    cdcStub = sinon.stub(cdcService);

    sqlConnectionKey = 'mysql-localhost-testdb';
    mongoConnectionKey = 'mongo-localhost-testdb';
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Complete Migration Workflow', () => {
    it('should complete full migration workflow successfully', async () => {
      // Step 1: Connect to SQL Database
      sqlStub.connect.resolves({
        success: true,
        connectionKey: sqlConnectionKey
      });

      const sqlConnectResponse = await request(app)
        .post('/api/sql/connect')
        .send(TestUtils.createMockSQLConfig());

      expect(sqlConnectResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(sqlConnectResponse, ['connectionKey']);

      // Step 2: Connect to MongoDB
      mongoStub.connect.resolves({
        success: true,
        connectionKey: mongoConnectionKey
      });

      const mongoConnectResponse = await request(app)
        .post('/api/mongo/connect')
        .send(TestUtils.createMockMongoConfig());

      expect(mongoConnectResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(mongoConnectResponse, ['connectionKey']);

      // Step 3: Get SQL Tables
      const mockTables = ['users', 'orders', 'products'];
      sqlStub.getTables.resolves(mockTables);

      const tablesResponse = await request(app)
        .get(`/api/sql/tables/${sqlConnectionKey}`);

      expect(tablesResponse.status).to.equal(200);
      expect(tablesResponse.body.tables).to.deep.equal(mockTables);

      // Step 4: Get Table Columns
      const mockColumns = TestUtils.generateMockColumns(['id', 'name', 'email', 'created_at']);
      sqlStub.getTableColumns.resolves(mockColumns);

      const columnsResponse = await request(app)
        .get(`/api/sql/columns/${sqlConnectionKey}/users`);

      expect(columnsResponse.status).to.equal(200);
      expect(columnsResponse.body.columns).to.deep.equal(mockColumns);

      // Step 5: Preview Data
      const mockPreviewData = TestUtils.generateMockSQLData(5, ['id', 'name', 'email']);
      sqlStub.executeQuery.resolves([mockPreviewData]);

      const previewResponse = await request(app)
        .post(`/api/sql/preview/${sqlConnectionKey}`)
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name', 'email'],
          limit: 5
        });

      expect(previewResponse.status).to.equal(200);
      expect(previewResponse.body.data).to.deep.equal(mockPreviewData);

      // Step 6: Perform Migration
      const mockMigrationData = TestUtils.generateMockSQLData(100, ['id', 'name', 'email']);
      sqlStub.executeQuery.resolves([mockMigrationData]);
      mongoStub.insertDocuments.resolves(TestUtils.createMockInsertResult(100));

      const migrationResponse = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey,
          mongoConnectionKey,
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name', 'email'],
          batchSize: 50
        });

      expect(migrationResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(migrationResponse, ['migratedCount', 'totalBatches']);
      expect(migrationResponse.body.migratedCount).to.equal(100);
      expect(migrationResponse.body.totalBatches).to.equal(2);

      // Step 7: Test CDC Configuration
      sqlStub.getTableColumns.resolves(TestUtils.generateMockColumns(['id', 'name', 'email', 'updated_at']));
      sqlStub.executeQuery.resolves([TestUtils.generateMockSQLData(3, ['id', 'name', 'email', 'updated_at'])]);

      const cdcTestResponse = await request(app)
        .post('/api/cdc/test')
        .send({
          sqlConnectionKey,
          tableName: 'users',
          timestampColumn: 'updated_at',
          primaryKeyColumn: 'id',
          selectedColumns: ['id', 'name', 'email']
        });

      expect(cdcTestResponse.status).to.equal(200);
      expect(cdcTestResponse.body.success).to.be.true;
      expect(cdcTestResponse.body.timestampColumnValid).to.be.true;
      expect(cdcTestResponse.body.primaryKeyColumnValid).to.be.true;

      // Step 8: Start CDC Job
      const jobId = TestUtils.generateTestId('cdc-job');
      cdcStub.startPolling.resolves({
        success: true,
        jobId,
        message: 'Polling job started successfully'
      });

      const cdcStartResponse = await request(app)
        .post('/api/cdc/start')
        .send({
          sqlConnectionKey,
          mongoConnectionKey,
          tableName: 'users',
          collectionName: 'users_sync',
          selectedColumns: ['id', 'name', 'email'],
          timestampColumn: 'updated_at',
          primaryKeyColumn: 'id',
          pollingInterval: 5000,
          batchSize: 100
        });

      expect(cdcStartResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(cdcStartResponse, ['jobId']);
      expect(cdcStartResponse.body.jobId).to.equal(jobId);

      // Step 9: Check CDC Job Status
      const mockJobStatus = TestUtils.createMockJobStatus({ jobId });
      cdcStub.getJobStatus.returns(mockJobStatus);

      const jobStatusResponse = await request(app)
        .get(`/api/cdc/status/${jobId}`);

      expect(jobStatusResponse.status).to.equal(200);
      expect(jobStatusResponse.body.jobId).to.equal(jobId);
      TestUtils.validateJobStats(jobStatusResponse.body.stats);

      // Step 10: Get All CDC Jobs
      cdcStub.getAllJobs.returns([mockJobStatus]);

      const allJobsResponse = await request(app)
        .get('/api/cdc/jobs');

      expect(allJobsResponse.status).to.equal(200);
      expect(allJobsResponse.body.jobs).to.be.an('array').with.length(1);
      expect(allJobsResponse.body.jobs[0].jobId).to.equal(jobId);

      // Step 11: Update CDC Job Configuration
      cdcStub.updateJobConfig.resolves({
        success: true,
        message: `Job ${jobId} updated successfully`
      });

      const updateResponse = await request(app)
        .put(`/api/cdc/update/${jobId}`)
        .send({
          pollingInterval: 10000,
          batchSize: 200
        });

      expect(updateResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(updateResponse);

      // Step 12: Pause CDC Job
      cdcStub.pauseJob.resolves({
        success: true,
        message: `Job ${jobId} paused`
      });

      const pauseResponse = await request(app)
        .post(`/api/cdc/pause/${jobId}`);

      expect(pauseResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(pauseResponse);

      // Step 13: Resume CDC Job
      cdcStub.resumeJob.resolves({
        success: true,
        message: `Job ${jobId} resumed`
      });

      const resumeResponse = await request(app)
        .post(`/api/cdc/resume/${jobId}`);

      expect(resumeResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(resumeResponse);

      // Step 14: Stop CDC Job
      cdcStub.stopPolling.resolves({
        success: true,
        message: `Polling job ${jobId} stopped`
      });

      const stopResponse = await request(app)
        .post(`/api/cdc/stop/${jobId}`);

      expect(stopResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(stopResponse);

      // Step 15: Disconnect from databases
      sqlStub.disconnect.resolves();
      mongoStub.disconnect.resolves();

      const sqlDisconnectResponse = await request(app)
        .delete(`/api/sql/disconnect/${sqlConnectionKey}`);

      expect(sqlDisconnectResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(sqlDisconnectResponse);

      const mongoDisconnectResponse = await request(app)
        .delete(`/api/mongo/disconnect/${mongoConnectionKey}`);

      expect(mongoDisconnectResponse.status).to.equal(200);
      TestUtils.assertSuccessResponse(mongoDisconnectResponse);

      // Verify all expected calls were made
      expect(sqlStub.connect.calledOnce).to.be.true;
      expect(mongoStub.connect.calledOnce).to.be.true;
      expect(sqlStub.getTables.calledOnce).to.be.true;
      expect(sqlStub.getTableColumns.calledTwice).to.be.true; // Once for columns, once for CDC test
      expect(sqlStub.executeQuery.calledThrice).to.be.true; // Preview, migration, CDC test
      expect(mongoStub.insertDocuments.calledTwice).to.be.true; // Migration in 2 batches
      expect(cdcStub.startPolling.calledOnce).to.be.true;
      expect(cdcStub.getJobStatus.calledOnce).to.be.true;
      expect(cdcStub.getAllJobs.calledOnce).to.be.true;
      expect(cdcStub.updateJobConfig.calledOnce).to.be.true;
      expect(cdcStub.pauseJob.calledOnce).to.be.true;
      expect(cdcStub.resumeJob.calledOnce).to.be.true;
      expect(cdcStub.stopPolling.calledOnce).to.be.true;
      expect(sqlStub.disconnect.calledOnce).to.be.true;
      expect(mongoStub.disconnect.calledOnce).to.be.true;
    });
  });

  describe('Error Handling in Workflow', () => {
    it('should handle SQL connection failure gracefully', async () => {
      sqlStub.connect.rejects(new Error('Connection refused'));

      const response = await request(app)
        .post('/api/sql/connect')
        .send(TestUtils.createMockSQLConfig());

      expect(response.status).to.equal(500);
      TestUtils.assertErrorResponse(response, 'Connection refused');
    });

    it('should handle MongoDB connection failure gracefully', async () => {
      mongoStub.connect.rejects(new Error('MongoDB connection failed'));

      const response = await request(app)
        .post('/api/mongo/connect')
        .send(TestUtils.createMockMongoConfig());

      expect(response.status).to.equal(500);
      TestUtils.assertErrorResponse(response, 'MongoDB connection failed');
    });

    it('should handle migration failure gracefully', async () => {
      sqlStub.executeQuery.rejects(new Error('Table not found'));

      const response = await request(app)
        .post('/api/migration/migrate')
        .send(TestUtils.createMockMigrationConfig());

      expect(response.status).to.equal(500);
      TestUtils.assertErrorResponse(response, 'Migration failed');
    });

    it('should handle CDC job creation failure gracefully', async () => {
      cdcStub.startPolling.rejects(new Error('Invalid configuration'));

      const response = await request(app)
        .post('/api/cdc/start')
        .send(TestUtils.createMockCDCConfig());

      expect(response.status).to.equal(500);
      TestUtils.assertErrorResponse(response, 'Invalid configuration');
    });
  });

  describe('Data Validation in Workflow', () => {
    it('should validate migration configuration', async () => {
      const invalidConfig = {
        sqlConnectionKey: sqlConnectionKey,
        mongoConnectionKey: mongoConnectionKey,
        tableName: 'users'
        // missing collectionName
      };

      const response = await request(app)
        .post('/api/migration/migrate')
        .send(invalidConfig);

      expect(response.status).to.equal(400);
      TestUtils.assertErrorResponse(response, 'Missing required parameters');
    });

    it('should validate CDC configuration', async () => {
      const invalidConfig = {
        sqlConnectionKey: sqlConnectionKey,
        mongoConnectionKey: mongoConnectionKey,
        tableName: 'users',
        collectionName: 'users_sync'
        // missing timestampColumn and primaryKeyColumn
      };

      const response = await request(app)
        .post('/api/cdc/start')
        .send(invalidConfig);

      expect(response.status).to.equal(400);
      TestUtils.assertErrorResponse(response, 'Missing required parameters');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle large dataset migration efficiently', async () => {
      // Setup for large dataset
      const largeDataset = TestUtils.generateMockSQLData(10000, ['id', 'name', 'email']);
      sqlStub.connect.resolves(TestUtils.createMockConnectionResponse());
      mongoStub.connect.resolves(TestUtils.createMockConnectionResponse('mongo'));
      sqlStub.executeQuery.resolves([largeDataset]);
      mongoStub.insertDocuments.resolves(TestUtils.createMockInsertResult(1000));

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey,
          mongoConnectionKey,
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name', 'email'],
          batchSize: 1000
        });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.migratedCount).to.equal(10000);
      expect(response.body.totalBatches).to.equal(10);

      // Should complete within reasonable time (adjust as needed)
      expect(duration).to.be.lessThan(5000); // 5 seconds

      // Verify batch processing
      expect(mongoStub.insertDocuments.callCount).to.equal(10);
    });

    it('should handle multiple concurrent CDC jobs', async () => {
      const jobIds = ['job-1', 'job-2', 'job-3'];
      const mockJobs = jobIds.map(id => TestUtils.createMockJobStatus({ jobId: id }));

      cdcStub.startPolling.resolves({ success: true, jobId: 'job-1' });
      cdcStub.getAllJobs.returns(mockJobs);

      // Start multiple jobs (in real scenario, these would be separate requests)
      const startResponse = await request(app)
        .post('/api/cdc/start')
        .send(TestUtils.createMockCDCConfig({ jobId: 'job-1' }));

      expect(startResponse.status).to.equal(200);

      // Get all jobs
      const jobsResponse = await request(app)
        .get('/api/cdc/jobs');

      expect(jobsResponse.status).to.equal(200);
      expect(jobsResponse.body.jobs).to.have.length(3);
    });
  });
});