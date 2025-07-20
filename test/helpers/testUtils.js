const { expect } = require('chai');

/**
 * Test utilities for SQL to MongoDB Migration application
 */
class TestUtils {
  /**
   * Create mock SQL connection configuration
   */
  static createMockSQLConfig(overrides = {}) {
    return {
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
      ...overrides
    };
  }

  /**
   * Create mock MongoDB connection configuration
   */
  static createMockMongoConfig(overrides = {}) {
    return {
      host: 'localhost',
      port: 27017,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
      authSource: 'admin',
      ...overrides
    };
  }

  /**
   * Create mock CDC job configuration
   */
  static createMockCDCConfig(overrides = {}) {
    return {
      jobId: 'test-job-123',
      sqlConnectionKey: 'mysql-localhost-testdb',
      mongoConnectionKey: 'mongo-localhost-testdb',
      tableName: 'users',
      collectionName: 'users_sync',
      selectedColumns: ['id', 'name', 'email', 'updated_at'],
      timestampColumn: 'updated_at',
      primaryKeyColumn: 'id',
      pollingInterval: 5000,
      batchSize: 1000,
      whereClause: '',
      ...overrides
    };
  }

  /**
   * Create mock migration configuration
   */
  static createMockMigrationConfig(overrides = {}) {
    return {
      sqlConnectionKey: 'mysql-localhost-testdb',
      mongoConnectionKey: 'mongo-localhost-testdb',
      tableName: 'users',
      collectionName: 'users_collection',
      selectedColumns: ['id', 'name', 'email'],
      whereClause: '',
      batchSize: 1000,
      ...overrides
    };
  }

  /**
   * Generate mock SQL data
   */
  static generateMockSQLData(count = 10, columns = ['id', 'name', 'email']) {
    return Array.from({ length: count }, (_, i) => {
      const row = {};
      columns.forEach(col => {
        switch (col) {
          case 'id':
            row[col] = i + 1;
            break;
          case 'name':
            row[col] = `User ${i + 1}`;
            break;
          case 'email':
            row[col] = `user${i + 1}@example.com`;
            break;
          case 'created_at':
          case 'updated_at':
            row[col] = new Date(Date.now() - (count - i) * 1000);
            break;
          case 'status':
            row[col] = i % 2 === 0 ? 'active' : 'inactive';
            break;
          default:
            row[col] = `value_${i + 1}`;
        }
      });
      return row;
    });
  }

  /**
   * Generate mock table columns
   */
  static generateMockColumns(columnNames = ['id', 'name', 'email']) {
    return columnNames.map(name => {
      let type;
      switch (name) {
        case 'id':
          type = 'int(11)';
          break;
        case 'name':
        case 'email':
          type = 'varchar(255)';
          break;
        case 'created_at':
        case 'updated_at':
          type = 'timestamp';
          break;
        case 'status':
          type = 'enum("active","inactive")';
          break;
        default:
          type = 'varchar(255)';
      }
      return { name, type };
    });
  }

  /**
   * Create mock CDC job status
   */
  static createMockJobStatus(overrides = {}) {
    return {
      jobId: 'test-job-123',
      tableName: 'users',
      collectionName: 'users_sync',
      isActive: true,
      lastTimestamp: new Date('2023-06-15T10:30:00Z'),
      pollingInterval: 5000,
      stats: {
        totalProcessed: 150,
        lastRun: new Date('2023-06-15T10:35:00Z'),
        errors: 0,
        successfulRuns: 30
      },
      ...overrides
    };
  }

  /**
   * Assert that an object has required properties
   */
  static assertHasProperties(obj, properties) {
    properties.forEach(prop => {
      expect(obj).to.have.property(prop);
    });
  }

  /**
   * Assert that a response is a successful API response
   */
  static assertSuccessResponse(response, expectedProperties = []) {
    expect(response.body).to.have.property('success', true);
    if (expectedProperties.length > 0) {
      this.assertHasProperties(response.body, expectedProperties);
    }
  }

  /**
   * Assert that a response is an error response
   */
  static assertErrorResponse(response, expectedMessage = null) {
    expect(response.body).to.have.property('error');
    if (expectedMessage) {
      expect(response.body.error).to.include(expectedMessage);
    }
  }

  /**
   * Create a delay for testing async operations
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique test identifier
   */
  static generateTestId(prefix = 'test') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate CDC job configuration
   */
  static validateCDCConfig(config) {
    const requiredFields = [
      'sqlConnectionKey',
      'mongoConnectionKey',
      'tableName',
      'collectionName',
      'timestampColumn',
      'primaryKeyColumn'
    ];

    requiredFields.forEach(field => {
      expect(config).to.have.property(field);
      expect(config[field]).to.not.be.empty;
    });

    if (config.pollingInterval) {
      expect(config.pollingInterval).to.be.a('number');
      expect(config.pollingInterval).to.be.greaterThan(0);
    }

    if (config.batchSize) {
      expect(config.batchSize).to.be.a('number');
      expect(config.batchSize).to.be.greaterThan(0);
    }

    if (config.selectedColumns) {
      expect(config.selectedColumns).to.be.an('array');
    }
  }

  /**
   * Validate migration configuration
   */
  static validateMigrationConfig(config) {
    const requiredFields = [
      'sqlConnectionKey',
      'mongoConnectionKey',
      'tableName',
      'collectionName'
    ];

    requiredFields.forEach(field => {
      expect(config).to.have.property(field);
      expect(config[field]).to.not.be.empty;
    });

    if (config.selectedColumns) {
      expect(config.selectedColumns).to.be.an('array');
    }

    if (config.batchSize) {
      expect(config.batchSize).to.be.a('number');
      expect(config.batchSize).to.be.greaterThan(0);
    }
  }

  /**
   * Create mock MongoDB insert result
   */
  static createMockInsertResult(count = 1) {
    const insertedIds = {};
    for (let i = 0; i < count; i++) {
      insertedIds[i] = `mock-id-${i + 1}`;
    }

    return {
      success: true,
      insertedCount: count,
      insertedIds
    };
  }

  /**
   * Create mock connection response
   */
  static createMockConnectionResponse(type = 'mysql', host = 'localhost', database = 'testdb') {
    return {
      success: true,
      connectionKey: `${type}-${host}-${database}`
    };
  }

  /**
   * Validate job statistics
   */
  static validateJobStats(stats) {
    expect(stats).to.be.an('object');
    expect(stats).to.have.property('totalProcessed').that.is.a('number');
    expect(stats).to.have.property('errors').that.is.a('number');
    expect(stats).to.have.property('successfulRuns').that.is.a('number');
    
    if (stats.lastRun) {
      expect(new Date(stats.lastRun)).to.be.a('date');
    }
  }

  /**
   * Create test database configurations for different scenarios
   */
  static getTestConfigurations() {
    return {
      mysql: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'test_mysql',
        username: 'test_user',
        password: 'test_pass'
      },
      postgresql: {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_postgres',
        username: 'test_user',
        password: 'test_pass'
      },
      mssql: {
        type: 'mssql',
        host: 'localhost',
        port: 1433,
        database: 'test_mssql',
        username: 'test_user',
        password: 'test_pass'
      },
      mongodb: {
        host: 'localhost',
        port: 27017,
        database: 'test_mongo',
        username: 'test_user',
        password: 'test_pass',
        authSource: 'admin'
      }
    };
  }
}

module.exports = TestUtils;