const { MongoClient } = require('mongodb');

class MongoConnector {
  constructor() {
    this.connections = new Map();
  }

  async connect(config) {
    const { host, port, database, username, password, authSource } = config;
    
    let uri;
    if (username && password) {
      uri = `mongodb://${username}:${password}@${host}:${port || 27017}/${database}`;
      if (authSource) {
        uri += `?authSource=${authSource}`;
      }
    } else {
      uri = `mongodb://${host}:${port || 27017}/${database}`;
    }

    const connectionKey = `mongo-${host}-${database}`;

    try {
      const client = new MongoClient(uri);
      await client.connect();
      
      const db = client.db(database);
      this.connections.set(connectionKey, { client, db });
      
      return { success: true, connectionKey };
    } catch (error) {
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }

  async getCollections(connectionKey) {
    const { db } = this.connections.get(connectionKey);
    
    try {
      const collections = await db.listCollections().toArray();
      return collections.map(col => col.name);
    } catch (error) {
      throw new Error(`Failed to get collections: ${error.message}`);
    }
  }

  async insertDocuments(connectionKey, collectionName, documents) {
    const { db } = this.connections.get(connectionKey);
    
    try {
      const collection = db.collection(collectionName);
      const result = await collection.insertMany(documents);
      return {
        success: true,
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds
      };
    } catch (error) {
      throw new Error(`Failed to insert documents: ${error.message}`);
    }
  }

  async testConnection(connectionKey) {
    const { db } = this.connections.get(connectionKey);
    
    try {
      await db.admin().ping();
      return { success: true };
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  async disconnect(connectionKey) {
    const connectionData = this.connections.get(connectionKey);
    if (connectionData) {
      try {
        await connectionData.client.close();
        this.connections.delete(connectionKey);
      } catch (error) {
        console.error(`Error disconnecting from MongoDB: ${error.message}`);
      }
    }
  }
}

module.exports = new MongoConnector();