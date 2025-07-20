const EventEmitter = require("events");
const sqlConnector = require("../database/sqlConnector");
const mongoConnector = require("../database/mongoConnector");

class CDCService extends EventEmitter {
  constructor() {
    super();
    this.pollingJobs = new Map();
    this.isRunning = false;
  }

  async startPolling(config) {
    const {
      jobId,
      sqlConnectionKey,
      mongoConnectionKey,
      tableName,
      collectionName,
      selectedColumns,
      timestampColumn,
      primaryKeyColumn,
      pollingInterval = 5000, // 5 seconds default
      batchSize = 1000,
      whereClause = "",
    } = config;

    if (this.pollingJobs.has(jobId)) {
      throw new Error(`Polling job ${jobId} already exists`);
    }

    const job = {
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
      whereClause,
      lastTimestamp: null,
      lastProcessedId: null,
      isActive: true,
      stats: {
        totalProcessed: 0,
        lastRun: null,
        errors: 0,
        successfulRuns: 0,
      },
    };

    this.pollingJobs.set(jobId, job);

    // Initialize last timestamp
    await this.initializeLastTimestamp(job);

    // Start polling
    this.scheduleNextPoll(job);

    this.emit("jobStarted", { jobId, config });

    return {
      success: true,
      jobId,
      message: "Polling job started successfully",
    };
  }

  async initializeLastTimestamp(job) {
    try {
      const columns =
        job.selectedColumns.length > 0 ? job.selectedColumns.join(", ") : "*";
      let query = `SELECT MAX(${job.timestampColumn}) as max_timestamp FROM ${job.tableName}`;

      if (job.whereClause) {
        query += ` WHERE ${job.whereClause}`;
      }

      const [rows] = await sqlConnector.executeQuery(
        job.sqlConnectionKey,
        query
      );

      if (rows.length > 0 && rows[0].max_timestamp) {
        job.lastTimestamp = rows[0].max_timestamp;
      } else {
        // If no timestamp found, use current time
        job.lastTimestamp = new Date();
      }

      console.log(
        `Initialized CDC job ${job.jobId} with timestamp: ${job.lastTimestamp}`
      );
    } catch (error) {
      console.error(
        `Failed to initialize timestamp for job ${job.jobId}:`,
        error
      );
      job.lastTimestamp = new Date();
    }
  }

  scheduleNextPoll(job) {
    if (!job.isActive) return;

    setTimeout(async () => {
      try {
        await this.pollForChanges(job);
        job.stats.successfulRuns++;
      } catch (error) {
        job.stats.errors++;
        console.error(`Polling error for job ${job.jobId}:`, error);
        this.emit("pollingError", { jobId: job.jobId, error: error.message });
      }

      job.stats.lastRun = new Date();
      this.scheduleNextPoll(job);
    }, job.pollingInterval);
  }

  async pollForChanges(job) {
    const columns =
      job.selectedColumns.length > 0 ? job.selectedColumns.join(", ") : "*";

    // Build query to get changes since last timestamp
    let query = `SELECT ${columns} FROM ${job.tableName} WHERE ${job.timestampColumn} > ?`;

    if (job.whereClause) {
      query += ` AND (${job.whereClause})`;
    }

    query += ` ORDER BY ${job.timestampColumn} ASC LIMIT ${job.batchSize}`;

    const [rows] = await sqlConnector.executeQuery(
      job.sqlConnectionKey,
      query,
      [job.lastTimestamp]
    );

    if (rows.length === 0) {
      // No changes found
      return;
    }

    console.log(`Found ${rows.length} changes for job ${job.jobId}`);

    // Process changes in batches
    const batches = this.createBatches(rows, job.batchSize);

    for (const batch of batches) {
      await this.processBatch(job, batch);
    }

    // Update last timestamp
    const lastRow = rows[rows.length - 1];
    job.lastTimestamp = lastRow[job.timestampColumn];
    job.stats.totalProcessed += rows.length;

    this.emit("changesProcessed", {
      jobId: job.jobId,
      changesCount: rows.length,
      lastTimestamp: job.lastTimestamp,
    });
  }

  async processBatch(job, batch) {
    try {
      // For CDC, we might want to handle different operation types
      // For now, we'll treat all as upserts
      const operations = batch.map((row) => ({
        updateOne: {
          filter: { [job.primaryKeyColumn]: row[job.primaryKeyColumn] },
          update: { $set: row },
          upsert: true,
        },
      }));

      const { db } = mongoConnector.connections.get(job.mongoConnectionKey);
      const collection = db.collection(job.collectionName);

      await collection.bulkWrite(operations);
    } catch (error) {
      console.error(`Failed to process batch for job ${job.jobId}:`, error);
      throw error;
    }
  }

  createBatches(data, batchSize) {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  async stopPolling(jobId) {
    const job = this.pollingJobs.get(jobId);
    if (!job) {
      throw new Error(`Polling job ${jobId} not found`);
    }

    job.isActive = false;
    this.pollingJobs.delete(jobId);

    this.emit("jobStopped", { jobId });

    return { success: true, message: `Polling job ${jobId} stopped` };
  }

  getJobStatus(jobId) {
    const job = this.pollingJobs.get(jobId);
    if (!job) {
      return null;
    }

    return {
      jobId: job.jobId,
      tableName: job.tableName,
      collectionName: job.collectionName,
      isActive: job.isActive,
      lastTimestamp: job.lastTimestamp,
      pollingInterval: job.pollingInterval,
      stats: job.stats,
    };
  }

  getAllJobs() {
    const jobs = [];
    for (const [jobId, job] of this.pollingJobs) {
      jobs.push(this.getJobStatus(jobId));
    }
    return jobs;
  }

  async updateJobConfig(jobId, updates) {
    const job = this.pollingJobs.get(jobId);
    if (!job) {
      throw new Error(`Polling job ${jobId} not found`);
    }

    // Update allowed properties
    const allowedUpdates = [
      "pollingInterval",
      "batchSize",
      "whereClause",
      "selectedColumns",
    ];

    for (const key of allowedUpdates) {
      if (updates.hasOwnProperty(key)) {
        job[key] = updates[key];
      }
    }

    this.emit("jobUpdated", { jobId, updates });

    return { success: true, message: `Job ${jobId} updated successfully` };
  }

  async pauseJob(jobId) {
    const job = this.pollingJobs.get(jobId);
    if (!job) {
      throw new Error(`Polling job ${jobId} not found`);
    }

    job.isActive = false;
    this.emit("jobPaused", { jobId });

    return { success: true, message: `Job ${jobId} paused` };
  }

  async resumeJob(jobId) {
    const job = this.pollingJobs.get(jobId);
    if (!job) {
      throw new Error(`Polling job ${jobId} not found`);
    }

    job.isActive = true;
    this.scheduleNextPoll(job);
    this.emit("jobResumed", { jobId });

    return { success: true, message: `Job ${jobId} resumed` };
  }

  // Advanced CDC with operation type detection
  async pollForChangesWithOperationType(job) {
    // This would require additional setup like triggers or log tables
    // For now, we'll implement a basic version using timestamp comparison

    const columns =
      job.selectedColumns.length > 0 ? job.selectedColumns.join(", ") : "*";

    // Get new/updated records
    let insertUpdateQuery = `SELECT ${columns}, '${job.timestampColumn}' as cdc_timestamp, 'UPSERT' as cdc_operation 
                            FROM ${job.tableName} 
                            WHERE ${job.timestampColumn} > ?`;

    if (job.whereClause) {
      insertUpdateQuery += ` AND (${job.whereClause})`;
    }

    insertUpdateQuery += ` ORDER BY ${job.timestampColumn} ASC LIMIT ${job.batchSize}`;

    const [rows] = await sqlConnector.executeQuery(
      job.sqlConnectionKey,
      insertUpdateQuery,
      [job.lastTimestamp]
    );

    return rows;
  }
}

module.exports = new CDCService();
