const request = require('supertest');
const { expect, sinon } = require('chai');
const express = require('express');
const migrationRoutes = require('../../../src/routes/migration');
const sqlConnector = require('../../../src/database/sqlConnector');
const mongoConnector = require('../../../src/database/mongoConnector');

describe('Migration API Routes', () => {
  let app, sqlStub, mongoStub;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/migration', migrationRoutes);
    
    sqlStub = sinon.stub(sqlConnector);
    mongoStub = sinon.stub(mongoConnector);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /api/migration/migrate', () => {
    it('should perform migration successfully', async () => {
      const mockSqlData = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
      ];

      const mockInsertResult = {
        insertedCount: 2
      };

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.resolves(mockInsertResult);

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name', 'email'],
          whereClause: 'status = "active"',
          batchSize: 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.migratedCount).to.equal(2);
      expect(response.body.totalBatches).to.equal(1);
      expect(response.body.message).to.include('Successfully migrated 2 records');

      expect(sqlStub.executeQuery.calledOnce).to.be.true;
      expect(mongoStub.insertDocuments.calledOnce).to.be.true;
    });

    it('should handle migration with all columns', async () => {
      const mockSqlData = [
        { id: 1, name: 'John', email: 'john@example.com', status: 'active' }
      ];

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.resolves({ insertedCount: 1 });

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: [],
          batchSize: 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      const expectedQuery = 'SELECT * FROM users';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle migration with WHERE clause', async () => {
      const mockSqlData = [
        { id: 1, name: 'John', status: 'active' }
      ];

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.resolves({ insertedCount: 1 });

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name', 'status'],
          whereClause: 'status = "active"',
          batchSize: 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      const expectedQuery = 'SELECT id, name, status FROM users WHERE status = "active"';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle large dataset with multiple batches', async () => {
      // Create mock data larger than batch size
      const mockSqlData = Array.from({ length: 2500 }, (_, i) => ({
        id: i + 1,
        name: `User${i + 1}`,
        email: `user${i + 1}@example.com`
      }));

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.resolves({ insertedCount: 1000 });

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name', 'email'],
          batchSize: 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.migratedCount).to.equal(3000); // 3 batches * 1000 each
      expect(response.body.totalBatches).to.equal(3);

      expect(mongoStub.insertDocuments.callCount).to.equal(3);
    });

    it('should handle empty dataset', async () => {
      sqlStub.executeQuery.resolves([[]]);

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name'],
          batchSize: 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.include('No data found to migrate');
      expect(response.body.migratedCount).to.equal(0);

      expect(mongoStub.insertDocuments.called).to.be.false;
    });

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users'
          // missing collectionName
        });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include('Missing required parameters');
    });

    it('should handle SQL query errors', async () => {
      sqlStub.executeQuery.rejects(new Error('Table does not exist'));

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'nonexistent_table',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name'],
          batchSize: 1000
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Migration failed');
    });

    it('should handle MongoDB insert errors', async () => {
      const mockSqlData = [
        { id: 1, name: 'John' }
      ];

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.rejects(new Error('MongoDB insert failed'));

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name'],
          batchSize: 1000
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Migration failed');
    });

    it('should use default batch size when not provided', async () => {
      const mockSqlData = [
        { id: 1, name: 'John' }
      ];

      sqlStub.executeQuery.resolves([mockSqlData]);
      mongoStub.insertDocuments.resolves({ insertedCount: 1 });

      const response = await request(app)
        .post('/api/migration/migrate')
        .send({
          sqlConnectionKey: 'mysql-localhost-testdb',
          mongoConnectionKey: 'mongo-localhost-testdb',
          tableName: 'users',
          collectionName: 'users_collection',
          selectedColumns: ['id', 'name']
          // batchSize not provided, should default to 1000
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });
  });

  describe('GET /api/migration/status/:migrationId', () => {
    it('should return migration status placeholder', async () => {
      const response = await request(app)
        .get('/api/migration/status/test-migration-id');

      expect(response.status).to.equal(200);
      expect(response.body.message).to.include('Migration status tracking not implemented yet');
      expect(response.body.migrationId).to.equal('test-migration-id');
    });
  });
});