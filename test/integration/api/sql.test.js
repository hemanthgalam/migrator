const request = require('supertest');
const { expect, sinon } = require('chai');
const express = require('express');
const sqlRoutes = require('../../../src/routes/sql');
const sqlConnector = require('../../../src/database/sqlConnector');

describe('SQL API Routes', () => {
  let app, sqlStub;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sql', sqlRoutes);
    
    sqlStub = sinon.stub(sqlConnector);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /api/sql/connect', () => {
    it('should connect to SQL database successfully', async () => {
      sqlStub.connect.resolves({
        success: true,
        connectionKey: 'mysql-localhost-testdb'
      });

      const response = await request(app)
        .post('/api/sql/connect')
        .send({
          type: 'mysql',
          host: 'localhost',
          database: 'testdb',
          username: 'user',
          password: 'pass'
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.connectionKey).to.equal('mysql-localhost-testdb');
      expect(sqlStub.connect.calledOnce).to.be.true;
    });

    it('should handle connection failures', async () => {
      sqlStub.connect.rejects(new Error('Connection failed'));

      const response = await request(app)
        .post('/api/sql/connect')
        .send({
          type: 'mysql',
          host: 'invalid-host',
          database: 'testdb',
          username: 'user',
          password: 'pass'
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Connection failed');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/sql/connect')
        .send({
          type: 'mysql',
          host: 'localhost'
          // missing required fields
        });

      expect(response.status).to.equal(500);
    });
  });

  describe('GET /api/sql/tables/:connectionKey', () => {
    it('should get tables successfully', async () => {
      const mockTables = ['users', 'orders', 'products'];
      sqlStub.getTables.resolves(mockTables);

      const response = await request(app)
        .get('/api/sql/tables/mysql-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.tables).to.deep.equal(mockTables);
      expect(sqlStub.getTables.calledWith('mysql-localhost-testdb')).to.be.true;
    });

    it('should handle getTables errors', async () => {
      sqlStub.getTables.rejects(new Error('Connection not found'));

      const response = await request(app)
        .get('/api/sql/tables/invalid-connection');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Connection not found');
    });
  });

  describe('GET /api/sql/columns/:connectionKey/:tableName', () => {
    it('should get table columns successfully', async () => {
      const mockColumns = [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'varchar' },
        { name: 'email', type: 'varchar' }
      ];
      sqlStub.getTableColumns.resolves(mockColumns);

      const response = await request(app)
        .get('/api/sql/columns/mysql-localhost-testdb/users');

      expect(response.status).to.equal(200);
      expect(response.body.columns).to.deep.equal(mockColumns);
      expect(sqlStub.getTableColumns.calledWith('mysql-localhost-testdb', 'users')).to.be.true;
    });

    it('should handle getTableColumns errors', async () => {
      sqlStub.getTableColumns.rejects(new Error('Table not found'));

      const response = await request(app)
        .get('/api/sql/columns/mysql-localhost-testdb/nonexistent');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Table not found');
    });
  });

  describe('POST /api/sql/preview/:connectionKey', () => {
    it('should preview table data successfully', async () => {
      const mockData = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
      ];
      sqlStub.executeQuery.resolves([mockData]);

      const response = await request(app)
        .post('/api/sql/preview/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name', 'email'],
          limit: 10
        });

      expect(response.status).to.equal(200);
      expect(response.body.data).to.deep.equal(mockData);
      expect(sqlStub.executeQuery.calledOnce).to.be.true;
    });

    it('should handle preview with all columns', async () => {
      const mockData = [{ id: 1, name: 'John' }];
      sqlStub.executeQuery.resolves([mockData]);

      const response = await request(app)
        .post('/api/sql/preview/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: [],
          limit: 5
        });

      expect(response.status).to.equal(200);
      expect(response.body.data).to.deep.equal(mockData);
      
      const expectedQuery = 'SELECT * FROM users LIMIT 5';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle preview errors', async () => {
      sqlStub.executeQuery.rejects(new Error('Query failed'));

      const response = await request(app)
        .post('/api/sql/preview/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name'],
          limit: 10
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Query failed');
    });
  });

  describe('POST /api/sql/data/:connectionKey', () => {
    it('should get table data successfully', async () => {
      const mockData = [
        { id: 1, name: 'John', status: 'active' },
        { id: 2, name: 'Jane', status: 'active' }
      ];
      sqlStub.executeQuery.resolves([mockData]);

      const response = await request(app)
        .post('/api/sql/data/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name', 'status'],
          whereClause: 'status = "active"'
        });

      expect(response.status).to.equal(200);
      expect(response.body.data).to.deep.equal(mockData);
      
      const expectedQuery = 'SELECT id, name, status FROM users WHERE status = "active"';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle data query without WHERE clause', async () => {
      const mockData = [{ id: 1, name: 'John' }];
      sqlStub.executeQuery.resolves([mockData]);

      const response = await request(app)
        .post('/api/sql/data/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name'],
          whereClause: ''
        });

      expect(response.status).to.equal(200);
      
      const expectedQuery = 'SELECT id, name FROM users';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle data query with all columns', async () => {
      const mockData = [{ id: 1, name: 'John' }];
      sqlStub.executeQuery.resolves([mockData]);

      const response = await request(app)
        .post('/api/sql/data/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: []
        });

      expect(response.status).to.equal(200);
      
      const expectedQuery = 'SELECT * FROM users';
      expect(sqlStub.executeQuery.calledWith('mysql-localhost-testdb', expectedQuery)).to.be.true;
    });

    it('should handle data query errors', async () => {
      sqlStub.executeQuery.rejects(new Error('Invalid query'));

      const response = await request(app)
        .post('/api/sql/data/mysql-localhost-testdb')
        .send({
          tableName: 'users',
          selectedColumns: ['id', 'name']
        });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Invalid query');
    });
  });

  describe('DELETE /api/sql/disconnect/:connectionKey', () => {
    it('should disconnect successfully', async () => {
      sqlStub.disconnect.resolves();

      const response = await request(app)
        .delete('/api/sql/disconnect/mysql-localhost-testdb');

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(sqlStub.disconnect.calledWith('mysql-localhost-testdb')).to.be.true;
    });

    it('should handle disconnect errors', async () => {
      sqlStub.disconnect.rejects(new Error('Disconnect failed'));

      const response = await request(app)
        .delete('/api/sql/disconnect/mysql-localhost-testdb');

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include('Disconnect failed');
    });
  });
});