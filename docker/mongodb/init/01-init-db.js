// MongoDB initialization script for SQL to MongoDB Migration App

// Switch to the migration database
db = db.getSiblingDB('migration_test');

// Create collections with validation
db.createCollection('users_sync', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email'],
      properties: {
        id: {
          bsonType: 'int',
          description: 'must be an integer and is required'
        },
        name: {
          bsonType: 'string',
          description: 'must be a string and is required'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'must be a valid email address and is required'
        },
        status: {
          enum: ['active', 'inactive'],
          description: 'must be either active or inactive'
        },
        created_at: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updated_at: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

db.createCollection('orders_sync', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'total'],
      properties: {
        id: {
          bsonType: 'int',
          description: 'must be an integer and is required'
        },
        user_id: {
          bsonType: 'int',
          description: 'must be an integer and is required'
        },
        total: {
          bsonType: 'number',
          minimum: 0,
          description: 'must be a positive number and is required'
        },
        status: {
          enum: ['pending', 'completed', 'cancelled'],
          description: 'must be pending, completed, or cancelled'
        },
        created_at: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updated_at: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

db.createCollection('products_sync', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'price'],
      properties: {
        id: {
          bsonType: 'int',
          description: 'must be an integer and is required'
        },
        name: {
          bsonType: 'string',
          description: 'must be a string and is required'
        },
        description: {
          bsonType: 'string',
          description: 'must be a string'
        },
        price: {
          bsonType: 'number',
          minimum: 0,
          description: 'must be a positive number and is required'
        },
        category: {
          bsonType: 'string',
          description: 'must be a string'
        },
        stock_quantity: {
          bsonType: 'int',
          minimum: 0,
          description: 'must be a non-negative integer'
        },
        status: {
          enum: ['active', 'inactive'],
          description: 'must be either active or inactive'
        },
        created_at: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updated_at: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

// Create indexes for better performance
db.users_sync.createIndex({ 'id': 1 }, { unique: true });
db.users_sync.createIndex({ 'email': 1 }, { unique: true });
db.users_sync.createIndex({ 'status': 1 });
db.users_sync.createIndex({ 'updated_at': 1 });

db.orders_sync.createIndex({ 'id': 1 }, { unique: true });
db.orders_sync.createIndex({ 'user_id': 1 });
db.orders_sync.createIndex({ 'status': 1 });
db.orders_sync.createIndex({ 'updated_at': 1 });

db.products_sync.createIndex({ 'id': 1 }, { unique: true });
db.products_sync.createIndex({ 'category': 1 });
db.products_sync.createIndex({ 'status': 1 });
db.products_sync.createIndex({ 'updated_at': 1 });

// Create a user for the application
db.createUser({
  user: 'migrator',
  pwd: 'migratorpass',
  roles: [
    {
      role: 'readWrite',
      db: 'migration_test'
    }
  ]
});

print('MongoDB initialization completed successfully!');