const mysql = require('mysql2/promise');
const { Client } = require('pg');
const sql = require('mssql');

class SQLConnector {
  constructor() {
    this.connections = new Map();
  }

  async connect(config) {
    const { type, host, port, database, username, password } = config;
    const connectionKey = `${type}-${host}-${database}`;

    try {
      let connection;
      
      switch (type) {
        case 'mysql':
          connection = await mysql.createConnection({
            host,
            port: port || 3306,
            user: username,
            password,
            database
          });
          break;
          
        case 'postgresql':
          connection = new Client({
            host,
            port: port || 5432,
            user: username,
            password,
            database
          });
          await connection.connect();
          break;
          
        case 'mssql':
          connection = await sql.connect({
            server: host,
            port: port || 1433,
            user: username,
            password,
            database,
            options: {
              encrypt: false,
              trustServerCertificate: true
            }
          });
          break;
          
        default:
          throw new Error(`Unsupported database type: ${type}`);
      }

      this.connections.set(connectionKey, { connection, type });
      return { success: true, connectionKey };
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  async getTables(connectionKey) {
    const { connection, type } = this.connections.get(connectionKey);
    
    try {
      let query;
      switch (type) {
        case 'mysql':
          query = 'SHOW TABLES';
          break;
        case 'postgresql':
          query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public'";
          break;
        case 'mssql':
          query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'";
          break;
      }

      const [rows] = await this.executeQuery(connectionKey, query);
      return rows.map(row => Object.values(row)[0]);
    } catch (error) {
      throw new Error(`Failed to get tables: ${error.message}`);
    }
  }

  async getTableColumns(connectionKey, tableName) {
    const { connection, type } = this.connections.get(connectionKey);
    
    try {
      let query;
      switch (type) {
        case 'mysql':
          query = `DESCRIBE ${tableName}`;
          break;
        case 'postgresql':
          query = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`;
          break;
        case 'mssql':
          query = `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
          break;
      }

      const [rows] = await this.executeQuery(connectionKey, query);
      return rows.map(row => ({
        name: row.Field || row.column_name || row.COLUMN_NAME,
        type: row.Type || row.data_type || row.DATA_TYPE
      }));
    } catch (error) {
      throw new Error(`Failed to get table columns: ${error.message}`);
    }
  }

  async executeQuery(connectionKey, query, params = []) {
    const { connection, type } = this.connections.get(connectionKey);
    
    try {
      switch (type) {
        case 'mysql':
          return await connection.execute(query, params);
        case 'postgresql':
          const result = await connection.query(query, params);
          return [result.rows, result.fields];
        case 'mssql':
          const request = connection.request();
          params.forEach((param, index) => {
            request.input(`param${index}`, param);
          });
          const sqlResult = await request.query(query);
          return [sqlResult.recordset, sqlResult.recordset.columns];
      }
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async disconnect(connectionKey) {
    const connectionData = this.connections.get(connectionKey);
    if (connectionData) {
      const { connection, type } = connectionData;
      
      try {
        switch (type) {
          case 'mysql':
            await connection.end();
            break;
          case 'postgresql':
            await connection.end();
            break;
          case 'mssql':
            await connection.close();
            break;
        }
        this.connections.delete(connectionKey);
      } catch (error) {
        console.error(`Error disconnecting: ${error.message}`);
      }
    }
  }
}

module.exports = new SQLConnector();