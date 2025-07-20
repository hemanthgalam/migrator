const request = require('supertest');
const { expect, sinon } = require('chai');
const express = require('express');
const mongoRoutes = require('../../../src/routes/mongo');
const mongoConnector = require('../../../src/database/mongoConnector');

describe('MongoDB API Routes', () => {
  let app, mongoStub;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mongo', mongoRoutes);
    
    mongoStub = sinon.stub(mongoConnector);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /api/mongo/connect', () => {
    it('should connect to MongoDB successfully', async () => {
      mongoStub.connect.resolves({
        success: true,
        connectionKey: 'mongo-localhost-testdb'
      });

      const response = await request(app)
        .post('/api/mongo/connect')
        .send({
          host: 'localhost',
          port: 27017,
          database: 'testdb'
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.connectionKey).to.equal('mongo-localhost-testdb');
      expect(mongoStub.connect.calledOnce).to.be.true;
    });

    it('should connect to MongoDB with authentication', async () => {
      mongoStub.connect.resolves({
        success: true,
        connectionKey: 'mongo-localhost-testdb'
      });

      const response = await request(app)
        .post('/api/mongo/connect')
        .send({
          host: 'localhost',
          port: 27017,
          database: 'testdb',
          username: 'user',
          password: 'pass',
          authSource: 'admin'
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(mongoStub.connect.calledOnce).to.be.true;
    });

    it('should handle connection failures', async () => {
      mongoStub.connect.rejects(new Error('MongoDB connection failed'));

      const response = await request(app)
        .post('/api/mongo/connect')
        .send({
          host: 'invalid-host',
          database: 'testdb'
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('MongoDB connection failed');
    });
  });

  describe('GET /api/mongo/test/:connectionKey', () => {
    it('should test connection successfully', async () => {
      mongoStub.testConnection.resolves({ success: true });

      const response = await request(app)
        .get('/api/mongo/test/mongo-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(mongoStub.testConnection.calledWith('mongo-localhost-testdb')).to.be.true;
    });

    it('should handle connection test failures', async () => {
      mongoStub.testConnection.rejects(new Error('Connection test failed'));

      const response = await request(app)
        .get('/api/mongo/test/invalid-connection');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Connection test failed');
    });
  });

  describe('GET /api/mongo/collections/:connectionKey', () => {
    it('should get collections successfully', async () => {
      const mockCollections = ['users', 'orders', 'products'];
      mongoStub.getCollections.resolves(mockCollections);

      const response = await request(app)
        .get('/api/mongo/collections/mongo-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.collections).to.deep.equal(mockCollections);
      expect(mongoStub.getCollections.calledWith('mongo-localhost-testdb')).to.be.true;
    });

    it('should handle empty collections list', async () => {
      mongoStub.getCollections.resolves([]);

      const response = await request(app)
        .get('/api/mongo/collections/mongo-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.collections).to.be.an('array').that.is.empty;
    });

    it('should handle getCollections errors', async () => {
      mongoStub.getCollections.rejects(new Error('Failed to get collections'));

      const response = await request(app)
        .get('/api/mongo/collections/invalid-connection');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Failed to get collections');
    });
  });

  describe('POST /api/mongo/insert/:connectionKey', () => {
    it('should insert documents successfully', async () => {
      const mockResult = {
        success: true,
        insertedCount: 2,
        insertedIds: { 0: 'id1', 1: 'id2' }
      };
      mongoStub.insertDocuments.resolves(mockResult);

      const documents = [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' }
      ];

      const response = await request(app)
        .post('/api/mongo/insert/mongo-localhost-testdb')
        .send({
          collectionName: 'users',
          documents: documents
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.insertedCount).to.equal(2);
      expect(response.body.insertedIds).to.deep.equal({ 0: 'id1', 1: 'id2' });
      expect(mongoStub.insertDocuments.calledWith(
        'mongo-localhost-testdb',
        'users',
        documents
      )).to.be.true;
    });

    it('should handle empty documents array', async () => {
      const mockResult = {
        success: true,
        insertedCount: 0,
        insertedIds: {}
      };
      mongoStub.insertDocuments.resolves(mockResult);

      const response = await request(app)
        .post('/api/mongo/insert/mongo-localhost-testdb')
        .send({
          collectionName: 'users',
          documents: []
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.insertedCount).to.equal(0);
    });

    it('should handle insert errors', async () => {
      mongoStub.insertDocuments.rejects(new Error('Insert failed'));

      const response = await request(app)
        .post('/api/mongo/insert/mongo-localhost-testdb')
        .send({
          collectionName: 'users',
          documents: [{ name: 'John' }]
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Insert failed');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/mongo/insert/mongo-localhost-testdb')
        .send({
          collectionName: 'users'
          // missing documents field
        });

      expect(response.status).to.equal(500);
    });
  });

  describe('DELETE /api/mongo/disconnect/:connectionKey', () => {
    it('should disconnect successfully', async () => {
      mongoStub.disconnect.resolves();

      const response = await request(app)
        .delete('/api/mongo/disconnect/mongo-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(mongoStub.disconnect.calledWith('mongo-localhost-testdb')).to.be.true;
    });

    it('should handle disconnect errors', async () => {
      mongoStub.disconnect.rejects(new Error('Disconnect failed'));

      const response = await request(app)
        .delete('/api/mongo/disconnect/mongo-localhost-testdb');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Disconnect failed');
    });
  });
});