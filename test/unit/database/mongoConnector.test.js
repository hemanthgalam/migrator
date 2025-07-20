const { expect, sinon } = require('chai');
const { MongoClient } = require('mongodb');
const mongoConnector = require('../../../src/database/mongoConnector');

describe('MongoConnector', () => {
  let mongoClientStub, mockClient, mockDb, mockCollection;

  beforeEach(() => {
    mockCollection = {
      insertMany: sinon.stub(),
      bulkWrite: sinon.stub()
    };

    mockDb = {
      collection: sinon.stub().returns(mockCollection),
      listCollections: sinon.stub().returns({
        toArray: sinon.stub()
      }),
      admin: sinon.stub().returns({
        ping: sinon.stub()
      })
    };

    mockClient = {
      connect: sinon.stub().resolves(),
      db: sinon.stub().returns(mockDb),
      close: sinon.stub().resolves()
    };

    mongoClientStub = sinon.stub(MongoClient.prototype, 'connect').resolves();
    sinon.stub(MongoClient, 'constructor').returns(mockClient);
  });

  afterEach(() => {
    sinon.restore();
    // Clean up any existing connections
    mongoConnector.connections.clear();
  });

  describe('connect', () => {
    it('should connect to MongoDB without authentication', async () => {
      const config = {
        host: 'localhost',
        port: 27017,
        database: 'testdb'
      };

      // Mock MongoClient constructor and methods
      const connectStub = sinon.stub().resolves();
      const dbStub = sinon.stub().returns(mockDb);
      const clientMock = { connect: connectStub, db: dbStub, close: sinon.stub() };
      
      sinon.stub(MongoClient, 'constructor').callsFake(() => clientMock);
      const mongoClientConstructorStub = sinon.stub().returns(clientMock);
      sinon.replace(MongoClient, 'constructor', mongoClientConstructorStub);

      // We need to mock the actual MongoClient instantiation
      const originalMongoClient = MongoClient;
      const MockMongoClient = function(uri) {
        this.uri = uri;
        this.connect = connectStub;
        this.db = dbStub;
        this.close = sinon.stub();
        return this;
      };
      
      // Replace MongoClient temporarily
      require.cache[require.resolve('mongodb')] = {
        exports: { MongoClient: MockMongoClient }
      };

      const result = await mongoConnector.connect(config);

      expect(result.success).to.be.true;
      expect(result.connectionKey).to.equal('mongo-localhost-testdb');
    });

    it('should connect to MongoDB with authentication', async () => {
      const config = {
        host: 'localhost',
        port: 27017,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        authSource: 'admin'
      };

      const connectStub = sinon.stub().resolves();
      const dbStub = sinon.stub().returns(mockDb);
      
      const MockMongoClient = function(uri) {
        expect(uri).to.include('user:pass@localhost:27017/testdb?authSource=admin');
        this.connect = connectStub;
        this.db = dbStub;
        this.close = sinon.stub();
        return this;
      };

      // Replace MongoClient temporarily
      const originalMongoClient = require.cache[require.resolve('mongodb')];
      require.cache[require.resolve('mongodb')] = {
        exports: { MongoClient: MockMongoClient }
      };

      const result = await mongoConnector.connect(config);

      expect(result.success).to.be.true;
      expect(result.connectionKey).to.equal('mongo-localhost-testdb');

      // Restore original
      require.cache[require.resolve('mongodb')] = originalMongoClient;
    });

    it('should handle connection failures', async () => {
      const config = {
        host: 'invalid-host',
        database: 'testdb'
      };

      const MockMongoClient = function(uri) {
        this.connect = sinon.stub().rejects(new Error('Connection failed'));
        this.db = sinon.stub();
        this.close = sinon.stub();
        return this;
      };

      const originalMongoClient = require.cache[require.resolve('mongodb')];
      require.cache[require.resolve('mongodb')] = {
        exports: { MongoClient: MockMongoClient }
      };

      try {
        await mongoConnector.connect(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('MongoDB connection failed');
      }

      require.cache[require.resolve('mongodb')] = originalMongoClient;
    });

    it('should use default port when not specified', async () => {
      const config = {
        host: 'localhost',
        database: 'testdb'
      };

      const connectStub = sinon.stub().resolves();
      const dbStub = sinon.stub().returns(mockDb);
      
      const MockMongoClient = function(uri) {
        expect(uri).to.equal('mongodb://localhost:27017/testdb');
        this.connect = connectStub;
        this.db = dbStub;
        this.close = sinon.stub();
        return this;
      };

      const originalMongoClient = require.cache[require.resolve('mongodb')];
      require.cache[require.resolve('mongodb')] = {
        exports: { MongoClient: MockMongoClient }
      };

      await mongoConnector.connect(config);

      require.cache[require.resolve('mongodb')] = originalMongoClient;
    });
  });

  describe('getCollections', () => {
    beforeEach(async () => {
      // Setup a mock connection
      mongoConnector.connections.set('test-conn', {
        client: mockClient,
        db: mockDb
      });
    });

    it('should get collections successfully', async () => {
      const mockCollections = [
        { name: 'users' },
        { name: 'orders' },
        { name: 'products' }
      ];

      mockDb.listCollections().toArray.resolves(mockCollections);

      const collections = await mongoConnector.getCollections('test-conn');

      expect(collections).to.deep.equal(['users', 'orders', 'products']);
      expect(mockDb.listCollections().toArray.calledOnce).to.be.true;
    });

    it('should handle empty collections list', async () => {
      mockDb.listCollections().toArray.resolves([]);

      const collections = await mongoConnector.getCollections('test-conn');

      expect(collections).to.be.an('array').that.is.empty;
    });

    it('should throw error for invalid connection', async () => {
      try {
        await mongoConnector.getCollections('invalid-conn');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to get collections');
      }
    });
  });

  describe('insertDocuments', () => {
    beforeEach(async () => {
      mongoConnector.connections.set('test-conn', {
        client: mockClient,
        db: mockDb
      });
    });

    it('should insert documents successfully', async () => {
      const documents = [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' }
      ];

      const mockResult = {
        insertedCount: 2,
        insertedIds: { 0: 'id1', 1: 'id2' }
      };

      mockCollection.insertMany.resolves(mockResult);

      const result = await mongoConnector.insertDocuments('test-conn', 'users', documents);

      expect(result.success).to.be.true;
      expect(result.insertedCount).to.equal(2);
      expect(result.insertedIds).to.deep.equal({ 0: 'id1', 1: 'id2' });
      expect(mockDb.collection.calledWith('users')).to.be.true;
      expect(mockCollection.insertMany.calledWith(documents)).to.be.true;
    });

    it('should handle empty documents array', async () => {
      const mockResult = {
        insertedCount: 0,
        insertedIds: {}
      };

      mockCollection.insertMany.resolves(mockResult);

      const result = await mongoConnector.insertDocuments('test-conn', 'users', []);

      expect(result.success).to.be.true;
      expect(result.insertedCount).to.equal(0);
    });

    it('should throw error on insert failure', async () => {
      const documents = [{ name: 'John' }];
      mockCollection.insertMany.rejects(new Error('Insert failed'));

      try {
        await mongoConnector.insertDocuments('test-conn', 'users', documents);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to insert documents');
      }
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      mongoConnector.connections.set('test-conn', {
        client: mockClient,
        db: mockDb
      });
    });

    it('should test connection successfully', async () => {
      mockDb.admin().ping.resolves();

      const result = await mongoConnector.testConnection('test-conn');

      expect(result.success).to.be.true;
      expect(mockDb.admin().ping.calledOnce).to.be.true;
    });

    it('should handle connection test failure', async () => {
      mockDb.admin().ping.rejects(new Error('Connection lost'));

      try {
        await mongoConnector.testConnection('test-conn');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Connection test failed');
      }
    });

    it('should throw error for invalid connection', async () => {
      try {
        await mongoConnector.testConnection('invalid-conn');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Connection test failed');
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      mongoConnector.connections.set('test-conn', {
        client: mockClient,
        db: mockDb
      });

      await mongoConnector.disconnect('test-conn');

      expect(mockClient.close.calledOnce).to.be.true;
      expect(mongoConnector.connections.has('test-conn')).to.be.false;
    });

    it('should handle disconnect errors gracefully', async () => {
      const errorClient = {
        close: sinon.stub().rejects(new Error('Already closed'))
      };

      mongoConnector.connections.set('error-conn', {
        client: errorClient,
        db: mockDb
      });

      // Should not throw error
      await mongoConnector.disconnect('error-conn');
      expect(mongoConnector.connections.has('error-conn')).to.be.false;
    });

    it('should handle non-existent connection key', async () => {
      // Should not throw error
      await mongoConnector.disconnect('non-existent-key');
    });
  });
});