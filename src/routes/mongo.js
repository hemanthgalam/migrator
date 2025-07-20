const express = require('express');
const mongoConnector = require('../database/mongoConnector');

const router = express.Router();

/**
 * @swagger
 * /api/mongo/connect:
 *   post:
 *     summary: Connect to MongoDB
 *     description: Establish a connection to a MongoDB database
 *     tags: [MongoDB]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MongoConnectionConfig'
 *           examples:
 *             local:
 *               summary: Local MongoDB connection
 *               value:
 *                 host: "localhost"
 *                 port: 27017
 *                 database: "mydb"
 *             authenticated:
 *               summary: Authenticated MongoDB connection
 *               value:
 *                 host: "localhost"
 *                 port: 27017
 *                 database: "mydb"
 *                 username: "user"
 *                 password: "password"
 *                 authSource: "admin"
 *     responses:
 *       200:
 *         description: Connection successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConnectionResponse'
 *       500:
 *         description: Connection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Connect to MongoDB
router.post('/connect', async (req, res) => {
  try {
    const result = await mongoConnector.connect(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/mongo/test/{connectionKey}:
 *   get:
 *     summary: Test MongoDB connection
 *     description: Test if the MongoDB connection is still active and responsive
 *     tags: [MongoDB]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB connection identifier
 *     responses:
 *       200:
 *         description: Connection test successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Connection test failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Test MongoDB connection
router.get('/test/:connectionKey', async (req, res) => {
  try {
    const result = await mongoConnector.testConnection(req.params.connectionKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/mongo/collections/{connectionKey}:
 *   get:
 *     summary: Get all collections from MongoDB database
 *     description: Retrieve a list of all collections in the connected MongoDB database
 *     tags: [MongoDB]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB connection identifier
 *     responses:
 *       200:
 *         description: List of collections retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of collection names
 *       500:
 *         description: Failed to retrieve collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get collections from MongoDB
router.get('/collections/:connectionKey', async (req, res) => {
  try {
    const collections = await mongoConnector.getCollections(req.params.connectionKey);
    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/mongo/insert/{connectionKey}:
 *   post:
 *     summary: Insert documents into MongoDB collection
 *     description: Insert one or more documents into a specified MongoDB collection
 *     tags: [MongoDB]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB connection identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionName, documents]
 *             properties:
 *               collectionName:
 *                 type: string
 *                 description: Name of the MongoDB collection
 *               documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Array of documents to insert
 *           example:
 *             collectionName: "users"
 *             documents:
 *               - name: "John Doe"
 *                 email: "john@example.com"
 *                 age: 30
 *               - name: "Jane Smith"
 *                 email: "jane@example.com"
 *                 age: 25
 *     responses:
 *       200:
 *         description: Documents inserted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 insertedCount:
 *                   type: integer
 *                   description: Number of documents inserted
 *                 insertedIds:
 *                   type: object
 *                   description: Map of inserted document IDs
 *       500:
 *         description: Failed to insert documents
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Insert documents into MongoDB collection
router.post('/insert/:connectionKey', async (req, res) => {
  try {
    const { collectionName, documents } = req.body;
    const result = await mongoConnector.insertDocuments(
      req.params.connectionKey,
      collectionName,
      documents
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/mongo/disconnect/{connectionKey}:
 *   delete:
 *     summary: Disconnect from MongoDB
 *     description: Close the connection to a MongoDB database
 *     tags: [MongoDB]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB connection identifier
 *     responses:
 *       200:
 *         description: Disconnection successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Disconnection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Disconnect from MongoDB
router.delete('/disconnect/:connectionKey', async (req, res) => {
  try {
    await mongoConnector.disconnect(req.params.connectionKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;