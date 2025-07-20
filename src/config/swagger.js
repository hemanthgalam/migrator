const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SQL to MongoDB Migration API',
      version: '1.0.0',
      description: 'A comprehensive API for migrating data from SQL databases to MongoDB collections with real-time Change Data Capture (CDC) capabilities',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://your-production-domain.com',
        description: 'Production server'
      }
    ],
    components: {
      schemas: {
        SQLConnectionConfig: {
          type: 'object',
          required: ['type', 'host', 'database', 'username', 'password'],
          properties: {
            type: {
              type: 'string',
              enum: ['mysql', 'postgresql', 'mssql'],
              description: 'Type of SQL database'
            },
            host: {
              type: 'string',
              description: 'Database host address'
            },
            port: {
              type: 'integer',
              description: 'Database port (optional, uses default if not specified)'
            },
            database: {
              type: 'string',
              description: 'Database name'
            },
            username: {
              type: 'string',
              description: 'Database username'
            },
            password: {
              type: 'string',
              description: 'Database password'
            }
          }
        },
        MongoConnectionConfig: {
          type: 'object',
          required: ['host', 'database'],
          properties: {
            host: {
              type: 'string',
              description: 'MongoDB host address'
            },
            port: {
              type: 'integer',
              description: 'MongoDB port (default: 27017)'
            },
            database: {
              type: 'string',
              description: 'MongoDB database name'
            },
            username: {
              type: 'string',
              description: 'MongoDB username (optional)'
            },
            password: {
              type: 'string',
              description: 'MongoDB password (optional)'
            },
            authSource: {
              type: 'string',
              description: 'Authentication source (optional)'
            }
          }
        },
        MigrationConfig: {
          type: 'object',
          required: ['sqlConnectionKey', 'mongoConnectionKey', 'tableName', 'collectionName'],
          properties: {
            sqlConnectionKey: {
              type: 'string',
              description: 'SQL connection identifier'
            },
            mongoConnectionKey: {
              type: 'string',
              description: 'MongoDB connection identifier'
            },
            tableName: {
              type: 'string',
              description: 'Source SQL table name'
            },
            collectionName: {
              type: 'string',
              description: 'Target MongoDB collection name'
            },
            selectedColumns: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of columns to migrate (empty array for all columns)'
            },
            whereClause: {
              type: 'string',
              description: 'SQL WHERE clause to filter data (optional)'
            },
            batchSize: {
              type: 'integer',
              default: 1000,
              description: 'Number of records to process in each batch'
            }
          }
        },
        CDCJobConfig: {
          type: 'object',
          required: ['sqlConnectionKey', 'mongoConnectionKey', 'tableName', 'collectionName', 'timestampColumn', 'primaryKeyColumn'],
          properties: {
            sqlConnectionKey: {
              type: 'string',
              description: 'SQL connection identifier'
            },
            mongoConnectionKey: {
              type: 'string',
              description: 'MongoDB connection identifier'
            },
            tableName: {
              type: 'string',
              description: 'Source SQL table name'
            },
            collectionName: {
              type: 'string',
              description: 'Target MongoDB collection name'
            },
            selectedColumns: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of columns to sync (empty array for all columns)'
            },
            timestampColumn: {
              type: 'string',
              description: 'Column used to track changes (e.g., updated_at, modified_date)'
            },
            primaryKeyColumn: {
              type: 'string',
              description: 'Primary key column for upsert operations'
            },
            pollingInterval: {
              type: 'integer',
              default: 5000,
              description: 'Polling interval in milliseconds'
            },
            batchSize: {
              type: 'integer',
              default: 1000,
              description: 'Number of records to process in each batch'
            },
            whereClause: {
              type: 'string',
              description: 'SQL WHERE clause to filter data (optional)'
            }
          }
        },
        ConnectionResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            connectionKey: {
              type: 'string',
              description: 'Unique identifier for the connection'
            }
          }
        },
        TableColumn: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Column name'
            },
            type: {
              type: 'string',
              description: 'Column data type'
            }
          }
        },
        CDCJob: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Unique job identifier'
            },
            tableName: {
              type: 'string',
              description: 'Source table name'
            },
            collectionName: {
              type: 'string',
              description: 'Target collection name'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the job is currently active'
            },
            lastTimestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Last processed timestamp'
            },
            pollingInterval: {
              type: 'integer',
              description: 'Polling interval in milliseconds'
            },
            stats: {
              type: 'object',
              properties: {
                totalProcessed: {
                  type: 'integer',
                  description: 'Total number of records processed'
                },
                lastRun: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Last execution time'
                },
                errors: {
                  type: 'integer',
                  description: 'Number of errors encountered'
                },
                successfulRuns: {
                  type: 'integer',
                  description: 'Number of successful polling runs'
                }
              }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            message: {
              type: 'string'
            }
          }
        }
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication (if implemented)'
        }
      }
    },
    tags: [
      {
        name: 'SQL Database',
        description: 'Operations for SQL database connections and data retrieval'
      },
      {
        name: 'MongoDB',
        description: 'Operations for MongoDB connections and data insertion'
      },
      {
        name: 'Migration',
        description: 'One-time data migration operations'
      },
      {
        name: 'Change Data Capture',
        description: 'Real-time data synchronization and CDC job management'
      }
    ]
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = specs;