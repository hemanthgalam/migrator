const express = require('express');
const cdcService = require('../services/cdcService');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * @swagger
 * /api/cdc/start:
 *   post:
 *     summary: Start a new CDC polling job
 *     description: Create and start a new Change Data Capture job for real-time data synchronization between SQL and MongoDB
 *     tags: [Change Data Capture]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CDCJobConfig'
 *           example:
 *             sqlConnectionKey: "mysql-localhost-mydb"
 *             mongoConnectionKey: "mongo-localhost-mydb"
 *             tableName: "users"
 *             collectionName: "users_sync"
 *             selectedColumns: ["id", "name", "email", "updated_at"]
 *             timestampColumn: "updated_at"
 *             primaryKeyColumn: "id"
 *             pollingInterval: 5000
 *             batchSize: 1000
 *             whereClause: "status = 'active'"
 *     responses:
 *       200:
 *         description: CDC job started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 jobId:
 *                   type: string
 *                   description: Unique identifier for the CDC job
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to start CDC job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Start a new CDC polling job
router.post('/start', async (req, res) => {
  try {
    const {
      sqlConnectionKey,
      mongoConnectionKey,
      tableName,
      collectionName,
      selectedColumns = [],
      timestampColumn,
      primaryKeyColumn,
      pollingInterval = 5000,
      batchSize = 1000,
      whereClause = ''
    } = req.body;

    // Validate required parameters
    if (!sqlConnectionKey || !mongoConnectionKey || !tableName || !collectionName || !timestampColumn || !primaryKeyColumn) {
      return res.status(400).json({
        error: 'Missing required parameters: sqlConnectionKey, mongoConnectionKey, tableName, collectionName, timestampColumn, or primaryKeyColumn'
      });
    }

    const jobId = uuidv4();
    
    const result = await cdcService.startPolling({
      jobId,
      sqlConnectionKey,
      mongoConnectionKey,
      tableName,
      collectionName,
      selectedColumns,
      timestampColumn,
      primaryKeyColumn,
      pollingInterval,
      batchSize,
      whereClause
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/stop/{jobId}:
 *   post:
 *     summary: Stop a CDC polling job
 *     description: Stop and remove a running CDC job permanently
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     responses:
 *       200:
 *         description: CDC job stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Failed to stop CDC job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Stop a CDC polling job
router.post('/stop/:jobId', async (req, res) => {
  try {
    const result = await cdcService.stopPolling(req.params.jobId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/pause/{jobId}:
 *   post:
 *     summary: Pause a CDC polling job
 *     description: Temporarily pause a running CDC job without removing it
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     responses:
 *       200:
 *         description: CDC job paused successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Failed to pause CDC job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Pause a CDC polling job
router.post('/pause/:jobId', async (req, res) => {
  try {
    const result = await cdcService.pauseJob(req.params.jobId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/resume/{jobId}:
 *   post:
 *     summary: Resume a paused CDC polling job
 *     description: Resume a previously paused CDC job
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     responses:
 *       200:
 *         description: CDC job resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Failed to resume CDC job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Resume a CDC polling job
router.post('/resume/:jobId', async (req, res) => {
  try {
    const result = await cdcService.resumeJob(req.params.jobId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/status/{jobId}:
 *   get:
 *     summary: Get status of a specific CDC job
 *     description: Retrieve detailed status information for a specific CDC job
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     responses:
 *       200:
 *         description: CDC job status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CDCJob'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to get job status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get status of a specific CDC job
router.get('/status/:jobId', async (req, res) => {
  try {
    const status = cdcService.getJobStatus(req.params.jobId);
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/jobs:
 *   get:
 *     summary: Get all CDC jobs
 *     description: Retrieve a list of all active and paused CDC jobs
 *     tags: [Change Data Capture]
 *     responses:
 *       200:
 *         description: List of CDC jobs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CDCJob'
 *       500:
 *         description: Failed to retrieve CDC jobs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get all CDC jobs
router.get('/jobs', async (req, res) => {
  try {
    const jobs = cdcService.getAllJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/update/{jobId}:
 *   put:
 *     summary: Update CDC job configuration
 *     description: Update configuration parameters for an existing CDC job
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pollingInterval:
 *                 type: integer
 *                 description: New polling interval in milliseconds
 *               batchSize:
 *                 type: integer
 *                 description: New batch size for processing
 *               whereClause:
 *                 type: string
 *                 description: New WHERE clause for filtering
 *               selectedColumns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Updated list of columns to sync
 *           example:
 *             pollingInterval: 10000
 *             batchSize: 500
 *             whereClause: "status IN ('active', 'pending')"
 *     responses:
 *       200:
 *         description: CDC job updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Failed to update CDC job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Update CDC job configuration
router.put('/update/:jobId', async (req, res) => {
  try {
    const updates = req.body;
    const result = await cdcService.updateJobConfig(req.params.jobId, updates);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/stats/{jobId}:
 *   get:
 *     summary: Get CDC job statistics
 *     description: Retrieve detailed statistics for a specific CDC job including processing counts and performance metrics
 *     tags: [Change Data Capture]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: CDC job identifier
 *     responses:
 *       200:
 *         description: CDC job statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalProcessed:
 *                       type: integer
 *                       description: Total records processed
 *                     lastRun:
 *                       type: string
 *                       format: date-time
 *                       description: Last execution time
 *                     errors:
 *                       type: integer
 *                       description: Number of errors
 *                     successfulRuns:
 *                       type: integer
 *                       description: Number of successful runs
 *                 isActive:
 *                   type: boolean
 *                   description: Whether the job is currently active
 *                 lastTimestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Last processed timestamp
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to get job statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Get CDC job statistics
router.get('/stats/:jobId', async (req, res) => {
  try {
    const status = cdcService.getJobStatus(req.params.jobId);
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      jobId: status.jobId,
      stats: status.stats,
      isActive: status.isActive,
      lastTimestamp: status.lastTimestamp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cdc/test:
 *   post:
 *     summary: Test CDC configuration
 *     description: Validate CDC configuration and test data access before starting a job (dry run)
 *     tags: [Change Data Capture]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sqlConnectionKey, tableName, timestampColumn, primaryKeyColumn]
 *             properties:
 *               sqlConnectionKey:
 *                 type: string
 *                 description: SQL connection identifier
 *               tableName:
 *                 type: string
 *                 description: Name of the table to test
 *               timestampColumn:
 *                 type: string
 *                 description: Column used to track changes
 *               primaryKeyColumn:
 *                 type: string
 *                 description: Primary key column for upsert operations
 *               selectedColumns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of columns to include in test
 *               whereClause:
 *                 type: string
 *                 description: WHERE clause to test filtering
 *           example:
 *             sqlConnectionKey: "mysql-localhost-mydb"
 *             tableName: "users"
 *             timestampColumn: "updated_at"
 *             primaryKeyColumn: "id"
 *             selectedColumns: ["id", "name", "email"]
 *             whereClause: "status = 'active'"
 *     responses:
 *       200:
 *         description: CDC configuration test successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 sampleData:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Sample data from the table
 *                 timestampColumnValid:
 *                   type: boolean
 *                   description: Whether timestamp column exists
 *                 primaryKeyColumnValid:
 *                   type: boolean
 *                   description: Whether primary key column exists
 *       400:
 *         description: Configuration validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Test failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Test CDC configuration (dry run)
router.post('/test', async (req, res) => {
  try {
    const {
      sqlConnectionKey,
      tableName,
      timestampColumn,
      primaryKeyColumn,
      selectedColumns = [],
      whereClause = ''
    } = req.body;

    // Validate timestamp column exists
    const sqlConnector = require('../database/sqlConnector');
    const columns = await sqlConnector.getTableColumns(sqlConnectionKey, tableName);
    
    const timestampColumnExists = columns.some(col => col.name === timestampColumn);
    const primaryKeyColumnExists = columns.some(col => col.name === primaryKeyColumn);
    
    if (!timestampColumnExists) {
      return res.status(400).json({ 
        error: `Timestamp column '${timestampColumn}' not found in table '${tableName}'` 
      });
    }
    
    if (!primaryKeyColumnExists) {
      return res.status(400).json({ 
        error: `Primary key column '${primaryKeyColumn}' not found in table '${tableName}'` 
      });
    }

    // Test query to check if we can read recent data
    const testColumns = selectedColumns.length > 0 ? selectedColumns.join(', ') : '*';
    let testQuery = `SELECT ${testColumns} FROM ${tableName} WHERE ${timestampColumn} IS NOT NULL`;
    
    if (whereClause) {
      testQuery += ` AND (${whereClause})`;
    }
    
    testQuery += ` ORDER BY ${timestampColumn} DESC LIMIT 5`;
    
    const [testRows] = await sqlConnector.executeQuery(sqlConnectionKey, testQuery);
    
    res.json({
      success: true,
      message: 'CDC configuration is valid',
      sampleData: testRows,
      timestampColumnValid: timestampColumnExists,
      primaryKeyColumnValid: primaryKeyColumnExists
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;