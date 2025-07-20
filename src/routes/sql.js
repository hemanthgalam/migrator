const express = require('express');
const sqlConnector = require('../database/sqlConnector');

const router = express.Router();

/**
 * @swagger
 * /api/sql/connect:
 *   post:
 *     summary: Connect to SQL database
 *     description: Establish a connection to a SQL database (MySQL, PostgreSQL, or SQL Server)
 *     tags: [SQL Database]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SQLConnectionConfig'
 *           examples:
 *             mysql:
 *               summary: MySQL connection
 *               value:
 *                 type: "mysql"
 *                 host: "localhost"
 *                 port: 3306
 *                 database: "mydb"
 *                 username: "user"
 *                 password: "password"
 *             postgresql:
 *               summary: PostgreSQL connection
 *               value:
 *                 type: "postgresql"
 *                 host: "localhost"
 *                 port: 5432
 *                 database: "mydb"
 *                 username: "user"
 *                 password: "password"
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

// Connect to SQL database
router.post('/connect', async (req, res) => {
  try {
    const result = await sqlConnector.connect(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sql/tables/{connectionKey}:
 *   get:
 *     summary: Get all tables from connected SQL database
 *     description: Retrieve a list of all tables in the connected SQL database
 *     tags: [SQL Database]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: SQL connection identifier
 *     responses:
 *       200:
 *         description: List of tables retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tables:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of table names
 *       500:
 *         description: Failed to retrieve tables
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get tables from connected database
router.get('/tables/:connectionKey', async (req, res) => {
  try {
    const tables = await sqlConnector.getTables(req.params.connectionKey);
    res.json({ tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sql/columns/{connectionKey}/{tableName}:
 *   get:
 *     summary: Get columns for a specific table
 *     description: Retrieve column information for a specific table in the connected SQL database
 *     tags: [SQL Database]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: SQL connection identifier
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the table
 *     responses:
 *       200:
 *         description: Column information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 columns:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TableColumn'
 *       500:
 *         description: Failed to retrieve columns
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get columns for a specific table
router.get('/columns/:connectionKey/:tableName', async (req, res) => {
  try {
    const columns = await sqlConnector.getTableColumns(
      req.params.connectionKey, 
      req.params.tableName
    );
    res.json({ columns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sql/preview/{connectionKey}:
 *   post:
 *     summary: Preview data from a table
 *     description: Get a limited preview of data from a specific table with optional column selection
 *     tags: [SQL Database]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: SQL connection identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tableName]
 *             properties:
 *               tableName:
 *                 type: string
 *                 description: Name of the table to preview
 *               selectedColumns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of columns to include (empty for all columns)
 *               limit:
 *                 type: integer
 *                 default: 10
 *                 description: Maximum number of rows to return
 *           example:
 *             tableName: "users"
 *             selectedColumns: ["id", "name", "email"]
 *             limit: 5
 *     responses:
 *       200:
 *         description: Data preview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Array of data rows
 *       500:
 *         description: Failed to preview data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Preview data from table
router.post('/preview/:connectionKey', async (req, res) => {
  try {
    const { tableName, selectedColumns, limit = 10 } = req.body;
    const columns = selectedColumns.length > 0 ? selectedColumns.join(', ') : '*';
    const query = `SELECT ${columns} FROM ${tableName} LIMIT ${limit}`;
    
    const [rows] = await sqlConnector.executeQuery(req.params.connectionKey, query);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sql/data/{connectionKey}:
 *   post:
 *     summary: Get all data from a table
 *     description: Retrieve all data from a specific table with optional column selection and WHERE clause filtering
 *     tags: [SQL Database]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: SQL connection identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tableName]
 *             properties:
 *               tableName:
 *                 type: string
 *                 description: Name of the table to query
 *               selectedColumns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of columns to include (empty for all columns)
 *               whereClause:
 *                 type: string
 *                 description: SQL WHERE clause to filter data
 *           example:
 *             tableName: "users"
 *             selectedColumns: ["id", "name", "email", "created_at"]
 *             whereClause: "status = 'active' AND created_at > '2023-01-01'"
 *     responses:
 *       200:
 *         description: Data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Array of data rows
 *       500:
 *         description: Failed to retrieve data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get all data from table with selected columns
router.post('/data/:connectionKey', async (req, res) => {
  try {
    const { tableName, selectedColumns, whereClause } = req.body;
    const columns = selectedColumns.length > 0 ? selectedColumns.join(', ') : '*';
    let query = `SELECT ${columns} FROM ${tableName}`;
    
    if (whereClause && whereClause.trim()) {
      query += ` WHERE ${whereClause}`;
    }
    
    const [rows] = await sqlConnector.executeQuery(req.params.connectionKey, query);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sql/disconnect/{connectionKey}:
 *   delete:
 *     summary: Disconnect from SQL database
 *     description: Close the connection to a SQL database
 *     tags: [SQL Database]
 *     parameters:
 *       - in: path
 *         name: connectionKey
 *         required: true
 *         schema:
 *           type: string
 *         description: SQL connection identifier
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

// Disconnect from SQL database
router.delete('/disconnect/:connectionKey', async (req, res) => {
  try {
    await sqlConnector.disconnect(req.params.connectionKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;