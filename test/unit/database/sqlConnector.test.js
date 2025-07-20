const { expect, sinon } = require('chai');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const sql = require('mssql');
const sqlConnector = require('../../../src/database/sqlConnector');

describe('SQLConnector', () => {
  let mysqlStub, pgStub, mssqlStub;

  beforeEach(() => {
    mysqlStub = sinon.stub(mysql, 'createConnection');
    pgStub = sinon.stub(Client.prototype, 'connect');
    mssqlStub = sinon.stub(sql, 'connect');
  });

  afterEach(() => {
    sinon.restore();
    // Clean up any existing connections
    sqlConnector.connections.clear();
  });

  describe('connect', () => {
    it('should connect to MySQL database successfully', async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub()
      };
      mysqlStub.resolves(mockConnection);

      const config = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      const result = await sqlConnector.connect(config);

      expect(result.success).to.be.true;
      expect(result.connectionKey).to.equal('mysql-localhost-testdb');
      expect(mysqlStub.calledOnce).to.be.true;
      expect(mysqlStub.calledWith({
        host: 'localhost',
        port: 3306,
        user: 'user',
        password: 'pass',
        database: 'testdb'
      })).to.be.true;
    });

    it('should connect to PostgreSQL database successfully', async () => {
      const mockClient = {
        connect: sinon.stub().resolves(),
        query: sinon.stub(),
        end: sinon.stub()
      };
      
      // Mock the Client constructor
      const ClientStub = sinon.stub().returns(mockClient);
      ClientStub.prototype.connect = mockClient.connect;
      ClientStub.prototype.query = mockClient.query;
      ClientStub.prototype.end = mockClient.end;

      // Replace the require cache temporarily
      const originalClient = require.cache[require.resolve('pg')];
      require.cache[require.resolve('pg')] = {
        exports: { Client: ClientStub }
      };

      const config = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      const result = await sqlConnector.connect(config);

      expect(result.success).to.be.true;
      expect(result.connectionKey).to.equal('postgresql-localhost-testdb');

      // Restore original
      require.cache[require.resolve('pg')] = originalClient;
    });

    it('should connect to SQL Server database successfully', async () => {
      const mockConnection = {
        request: sinon.stub().returns({
          input: sinon.stub().returnsThis(),
          query: sinon.stub()
        }),
        close: sinon.stub()
      };
      mssqlStub.resolves(mockConnection);

      const config = {
        type: 'mssql',
        host: 'localhost',
        port: 1433,
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      const result = await sqlConnector.connect(config);

      expect(result.success).to.be.true;
      expect(result.connectionKey).to.equal('mssql-localhost-testdb');
      expect(mssqlStub.calledOnce).to.be.true;
    });

    it('should throw error for unsupported database type', async () => {
      const config = {
        type: 'oracle',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      try {
        await sqlConnector.connect(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Unsupported database type');
      }
    });

    it('should handle connection failures', async () => {
      mysqlStub.rejects(new Error('Connection refused'));

      const config = {
        type: 'mysql',
        host: 'invalid-host',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      try {
        await sqlConnector.connect(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Connection failed');
      }
    });
  });

  describe('getTables', () => {
    beforeEach(async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub()
      };
      mysqlStub.resolves(mockConnection);

      await sqlConnector.connect({
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      });
    });

    it('should get tables for MySQL', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const mockTables = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
        { 'Tables_in_testdb': 'products' }
      ];

      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.resolves([mockTables]);

      const tables = await sqlConnector.getTables(connectionKey);

      expect(tables).to.deep.equal(['users', 'orders', 'products']);
      expect(connection.execute.calledWith('SHOW TABLES')).to.be.true;
    });

    it('should handle empty table list', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.resolves([[]]);

      const tables = await sqlConnector.getTables(connectionKey);

      expect(tables).to.be.an('array').that.is.empty;
    });

    it('should throw error for invalid connection key', async () => {
      try {
        await sqlConnector.getTables('invalid-key');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to get tables');
      }
    });
  });

  describe('getTableColumns', () => {
    beforeEach(async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub()
      };
      mysqlStub.resolves(mockConnection);

      await sqlConnector.connect({
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      });
    });

    it('should get table columns for MySQL', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const mockColumns = [
        { Field: 'id', Type: 'int(11)' },
        { Field: 'name', Type: 'varchar(255)' },
        { Field: 'email', Type: 'varchar(255)' }
      ];

      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.resolves([mockColumns]);

      const columns = await sqlConnector.getTableColumns(connectionKey, 'users');

      expect(columns).to.deep.equal([
        { name: 'id', type: 'int(11)' },
        { name: 'name', type: 'varchar(255)' },
        { name: 'email', type: 'varchar(255)' }
      ]);
      expect(connection.execute.calledWith('DESCRIBE users')).to.be.true;
    });

    it('should handle table with no columns', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.resolves([[]]);

      const columns = await sqlConnector.getTableColumns(connectionKey, 'empty_table');

      expect(columns).to.be.an('array').that.is.empty;
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub()
      };
      mysqlStub.resolves(mockConnection);

      await sqlConnector.connect({
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      });
    });

    it('should execute query successfully', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const mockResult = [
        [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
        [{ name: 'id' }, { name: 'name' }]
      ];

      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.resolves(mockResult);

      const result = await sqlConnector.executeQuery(
        connectionKey,
        'SELECT * FROM users WHERE id > ?',
        [0]
      );

      expect(result).to.deep.equal(mockResult);
      expect(connection.execute.calledWith(
        'SELECT * FROM users WHERE id > ?',
        [0]
      )).to.be.true;
    });

    it('should handle query execution errors', async () => {
      const connectionKey = 'mysql-localhost-testdb';
      const connection = sqlConnector.connections.get(connectionKey).connection;
      connection.execute.rejects(new Error('Table does not exist'));

      try {
        await sqlConnector.executeQuery(connectionKey, 'SELECT * FROM nonexistent');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Query execution failed');
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect MySQL connection successfully', async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub().resolves()
      };
      mysqlStub.resolves(mockConnection);

      const config = {
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      const { connectionKey } = await sqlConnector.connect(config);
      await sqlConnector.disconnect(connectionKey);

      expect(mockConnection.end.calledOnce).to.be.true;
      expect(sqlConnector.connections.has(connectionKey)).to.be.false;
    });

    it('should handle disconnect errors gracefully', async () => {
      const mockConnection = {
        execute: sinon.stub(),
        end: sinon.stub().rejects(new Error('Connection already closed'))
      };
      mysqlStub.resolves(mockConnection);

      const config = {
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        username: 'user',
        password: 'pass'
      };

      const { connectionKey } = await sqlConnector.connect(config);
      
      // Should not throw error
      await sqlConnector.disconnect(connectionKey);
      expect(sqlConnector.connections.has(connectionKey)).to.be.false;
    });

    it('should handle non-existent connection key', async () => {
      // Should not throw error
      await sqlConnector.disconnect('non-existent-key');
    });
  });
});