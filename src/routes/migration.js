const express = require('express');
const sqlConnector = require('../database/sqlConnector');
const mongoConnector = require('../database/mongoConnector');

const router = express.Router();

/**
 * @swagger
 * /api/migration/migrate:
 *   post:
 *     summary: Perform one-time data migration
 *     description: Migrate data from SQL database to MongoDB collection with customizable column selection and filtering
 *     tags: [Migration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MigrationConfig'
 *           example:
 *             sqlConnectionKey: "mysql-localhost-mydb"
 *             mongoConnectionKey: "mongo-localhost-mydb"
 *             tableName: "users"
 *             collectionName: "users_collection"
 *             selectedColumns: ["id", "name", "email", "created_at"]
 *             whereClause: "status = 'active'"
 *             batchSize: 1000
 *     responses:
 *       200:
 *         description: Migration completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   description: Success message with migration details
 *                 migratedCount:
 *                   type: integer
 *                   description: Total number of records migrated
 *                 totalBatches:
 *                   type: integer
 *                   description: Number of batches processed
 *       400:
 *         description: Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Migration failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Perform migration from SQL to MongoDB
router.post('/migrate', async (req, res) => {
  try {
    const {
      sqlConnectionKey,
      mongoConnectionKey,
      tableName,
      selectedColumns,
      collectionName,
      whereClause,
      batchSize = 1000
    } = req.body;

    // Validate required parameters
    if (!sqlConnectionKey || !mongoConnectionKey || !tableName || !collectionName) {
      return res.status(400).json({ 
        error: 'Missing required parameters: sqlConnectionKey, mongoConnectionKey, tableName, or collectionName' 
      });
    }

    // Get data from SQL
    const columns = selectedColumns && selectedColumns.length > 0 ? selectedColumns.join(', ') : '*';
    let query = `SELECT ${columns} FROM ${tableName}`;
    
    if (whereClause && whereClause.trim()) {
      query += ` WHERE ${whereClause}`;
    }

    const [sqlData] = await sqlConnector.executeQuery(sqlConnectionKey, query);

    if (!sqlData || sqlData.length === 0) {
      return res.json({
        success: true,
        message: 'No data found to migrate',
        migratedCount: 0
      });
    }

    // Process data in batches
    let totalMigrated = 0;
    const batches = [];
    
    for (let i = 0; i < sqlData.length; i += batchSize) {
      batches.push(sqlData.slice(i, i + batchSize));
    }

    // Insert data into MongoDB in batches
    for (const batch of batches) {
      const result = await mongoConnector.insertDocuments(
        mongoConnectionKey,
        collectionName,
        batch
      );
      totalMigrated += result.insertedCount;
    }

    res.json({
      success: true,
      message: `Successfully migrated ${totalMigrated} records from ${tableName} to ${collectionName}`,
      migratedCount: totalMigrated,
      totalBatches: batches.length
    });

  } catch (error) {
    res.status(500).json({ 
      error: `Migration failed: ${error.message}` 
    });
  }
});

/**
 * @swagger
 * /api/migration/status/{migrationId}:
 *   get:
 *     summary: Get migration status
 *     description: Get the status of a migration job (placeholder for future enhancement)
 *     tags: [Migration]
 *     parameters:
 *       - in: path
 *         name: migrationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Migration job identifier
 *     responses:
 *       200:
 *         description: Migration status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 migrationId:
 *                   type: string
 */

// Get migration status/progress (for future enhancement)
router.get('/status/:migrationId', async (req, res) => {
  // This could be enhanced to track migration progress
  res.json({ 
    message: 'Migration status tracking not implemented yet',
    migrationId: req.params.migrationId 
  });
});

module.exports = router;