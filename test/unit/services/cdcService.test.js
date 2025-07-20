const { expect, sinon } = require('chai');
const cdcService = require('../../../src/services/cdcService');
const sqlConnector = require('../../../src/database/sqlConnector');
const mongoConnector = require('../../../src/database/mongoConnector');

describe('CDCService', () => {
  let sqlStub, mongoStub;

  beforeEach(() => {
    sqlStub = sinon.stub(sqlConnector);
    mongoStub = sinon.stub(mongoConnector);
  });

  afterEach(() => {
    sinon.restore();
    // Stop all polling jobs
    const jobs = cdcService.getAllJobs();
    jobs.forEach(job => {
      cdcService.stopPolling(job.jobId).catch(() => {});
    });
  });

  describe('startPolling', () => {
    it('should start a new CDC polling job successfully', async () => {
      const config = {
        jobId: 'test-job-1',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        selectedColumns: ['id', 'name', 'email'],
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id',
        pollingInterval: 1000,
        batchSize: 100
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date('2023-01-01') }]
      ]);

      const result = await cdcService.startPolling(config);

      expect(result.success).to.be.true;
      expect(result.jobId).to.equal('test-job-1');
      expect(result.message).to.include('started successfully');
    });

    it('should throw error if job already exists', async () => {
      const config = {
        jobId: 'duplicate-job',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id'
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date('2023-01-01') }]
      ]);

      await cdcService.startPolling(config);

      try {
        await cdcService.startPolling(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('already exists');
      }
    });

    it('should initialize last timestamp correctly', async () => {
      const config = {
        jobId: 'timestamp-test',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id'
      };

      const testDate = new Date('2023-06-15T10:30:00Z');
      sqlStub.executeQuery.resolves([
        [{ max_timestamp: testDate }]
      ]);

      await cdcService.startPolling(config);
      const job = cdcService.getJobStatus('timestamp-test');

      expect(job.lastTimestamp).to.deep.equal(testDate);
    });
  });

  describe('stopPolling', () => {
    it('should stop an existing polling job', async () => {
      const config = {
        jobId: 'stop-test',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id'
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date() }]
      ]);

      await cdcService.startPolling(config);
      const result = await cdcService.stopPolling('stop-test');

      expect(result.success).to.be.true;
      expect(result.message).to.include('stopped');
      expect(cdcService.getJobStatus('stop-test')).to.be.null;
    });

    it('should throw error for non-existent job', async () => {
      try {
        await cdcService.stopPolling('non-existent-job');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('not found');
      }
    });
  });

  describe('pauseJob and resumeJob', () => {
    beforeEach(async () => {
      const config = {
        jobId: 'pause-resume-test',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id'
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date() }]
      ]);

      await cdcService.startPolling(config);
    });

    it('should pause an active job', async () => {
      const result = await cdcService.pauseJob('pause-resume-test');
      const job = cdcService.getJobStatus('pause-resume-test');

      expect(result.success).to.be.true;
      expect(job.isActive).to.be.false;
    });

    it('should resume a paused job', async () => {
      await cdcService.pauseJob('pause-resume-test');
      const result = await cdcService.resumeJob('pause-resume-test');
      const job = cdcService.getJobStatus('pause-resume-test');

      expect(result.success).to.be.true;
      expect(job.isActive).to.be.true;
    });
  });

  describe('updateJobConfig', () => {
    beforeEach(async () => {
      const config = {
        jobId: 'update-test',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id',
        pollingInterval: 5000,
        batchSize: 1000
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date() }]
      ]);

      await cdcService.startPolling(config);
    });

    it('should update job configuration', async () => {
      const updates = {
        pollingInterval: 10000,
        batchSize: 500,
        whereClause: 'status = "active"'
      };

      const result = await cdcService.updateJobConfig('update-test', updates);
      const job = cdcService.getJobStatus('update-test');

      expect(result.success).to.be.true;
      expect(job.pollingInterval).to.equal(10000);
      expect(job.batchSize).to.equal(500);
    });

    it('should not update restricted properties', async () => {
      const updates = {
        jobId: 'new-id',
        sqlConnectionKey: 'new-conn',
        pollingInterval: 2000
      };

      await cdcService.updateJobConfig('update-test', updates);
      const job = cdcService.getJobStatus('update-test');

      expect(job.jobId).to.equal('update-test');
      expect(job.sqlConnectionKey).to.equal('sql-conn-1');
      expect(job.pollingInterval).to.equal(2000);
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs exist', () => {
      const jobs = cdcService.getAllJobs();
      expect(jobs).to.be.an('array').that.is.empty;
    });

    it('should return all active jobs', async () => {
      const configs = [
        {
          jobId: 'job-1',
          sqlConnectionKey: 'sql-conn-1',
          mongoConnectionKey: 'mongo-conn-1',
          tableName: 'users',
          collectionName: 'users_sync',
          timestampColumn: 'updated_at',
          primaryKeyColumn: 'id'
        },
        {
          jobId: 'job-2',
          sqlConnectionKey: 'sql-conn-2',
          mongoConnectionKey: 'mongo-conn-2',
          tableName: 'orders',
          collectionName: 'orders_sync',
          timestampColumn: 'modified_at',
          primaryKeyColumn: 'order_id'
        }
      ];

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date() }]
      ]);

      await Promise.all(configs.map(config => cdcService.startPolling(config)));
      const jobs = cdcService.getAllJobs();

      expect(jobs).to.have.length(2);
      expect(jobs.map(job => job.jobId)).to.include.members(['job-1', 'job-2']);
    });
  });

  describe('getJobStatus', () => {
    it('should return null for non-existent job', () => {
      const status = cdcService.getJobStatus('non-existent');
      expect(status).to.be.null;
    });

    it('should return job status for existing job', async () => {
      const config = {
        jobId: 'status-test',
        sqlConnectionKey: 'sql-conn-1',
        mongoConnectionKey: 'mongo-conn-1',
        tableName: 'users',
        collectionName: 'users_sync',
        timestampColumn: 'updated_at',
        primaryKeyColumn: 'id',
        pollingInterval: 3000
      };

      sqlStub.executeQuery.resolves([
        [{ max_timestamp: new Date() }]
      ]);

      await cdcService.startPolling(config);
      const status = cdcService.getJobStatus('status-test');

      expect(status).to.be.an('object');
      expect(status.jobId).to.equal('status-test');
      expect(status.tableName).to.equal('users');
      expect(status.collectionName).to.equal('users_sync');
      expect(status.isActive).to.be.true;
      expect(status.pollingInterval).to.equal(3000);
      expect(status.stats).to.be.an('object');
    });
  });

  describe('createBatches', () => {
    it('should create correct batches from data array', () => {
      const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      const batches = cdcService.createBatches(data, 10);

      expect(batches).to.have.length(3);
      expect(batches[0]).to.have.length(10);
      expect(batches[1]).to.have.length(10);
      expect(batches[2]).to.have.length(5);
    });

    it('should handle empty data array', () => {
      const batches = cdcService.createBatches([], 10);
      expect(batches).to.be.an('array').that.is.empty;
    });

    it('should handle data smaller than batch size', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const batches = cdcService.createBatches(data, 10);

      expect(batches).to.have.length(1);
      expect(batches[0]).to.have.length(3);
    });
  });
});