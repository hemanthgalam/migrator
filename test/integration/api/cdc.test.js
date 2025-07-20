const request = require("supertest");
const { expect, sinon } = require("chai");
const express = require("express");
const cdcRoutes = require("../../../src/routes/cdc");
const cdcService = require("../../../src/services/cdcService");
const sqlConnector = require("../../../src/database/sqlConnector");

describe("CDC API Routes", () => {
  let app, cdcStub, sqlStub;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/cdc", cdcRoutes);

    cdcStub = sinon.stub(cdcService);
    sqlStub = sinon.stub(sqlConnector);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("POST /api/cdc/start", () => {
    it("should start CDC job successfully", async () => {
      cdcStub.startPolling.resolves({
        success: true,
        jobId: "test-job-123",
        message: "Polling job started successfully",
      });

      const response = await request(app)
        .post("/api/cdc/start")
        .send({
          sqlConnectionKey: "mysql-localhost-testdb",
          mongoConnectionKey: "mongo-localhost-testdb",
          tableName: "users",
          collectionName: "users_sync",
          selectedColumns: ["id", "name", "email"],
          timestampColumn: "updated_at",
          primaryKeyColumn: "id",
          pollingInterval: 5000,
          batchSize: 1000,
          whereClause: 'status = "active"',
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.jobId).to.equal("test-job-123");
      expect(response.body.message).to.include("started successfully");
      expect(cdcStub.startPolling.calledOnce).to.be.true;
    });

    it("should validate required parameters", async () => {
      const response = await request(app).post("/api/cdc/start").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        mongoConnectionKey: "mongo-localhost-testdb",
        tableName: "users",
        collectionName: "users_sync",
        // missing timestampColumn and primaryKeyColumn
      });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include("Missing required parameters");
    });

    it("should handle CDC service errors", async () => {
      cdcStub.startPolling.rejects(new Error("Job already exists"));

      const response = await request(app).post("/api/cdc/start").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        mongoConnectionKey: "mongo-localhost-testdb",
        tableName: "users",
        collectionName: "users_sync",
        timestampColumn: "updated_at",
        primaryKeyColumn: "id",
      });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Job already exists");
    });

    it("should use default values for optional parameters", async () => {
      cdcStub.startPolling.resolves({
        success: true,
        jobId: "test-job-456",
        message: "Polling job started successfully",
      });

      const response = await request(app).post("/api/cdc/start").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        mongoConnectionKey: "mongo-localhost-testdb",
        tableName: "users",
        collectionName: "users_sync",
        timestampColumn: "updated_at",
        primaryKeyColumn: "id",
        // pollingInterval and batchSize should use defaults
      });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      const calledArgs = cdcStub.startPolling.getCall(0).args[0];
      expect(calledArgs.pollingInterval).to.equal(5000);
      expect(calledArgs.batchSize).to.equal(1000);
    });
  });

  describe("POST /api/cdc/stop/:jobId", () => {
    it("should stop CDC job successfully", async () => {
      cdcStub.stopPolling.resolves({
        success: true,
        message: "Polling job test-job-123 stopped",
      });

      const response = await request(app).post("/api/cdc/stop/test-job-123");

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.include("stopped");
      expect(cdcStub.stopPolling.calledWith("test-job-123")).to.be.true;
    });

    it("should handle stop errors", async () => {
      cdcStub.stopPolling.rejects(new Error("Job not found"));

      const response = await request(app).post("/api/cdc/stop/nonexistent-job");

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Job not found");
    });
  });

  describe("POST /api/cdc/pause/:jobId", () => {
    it("should pause CDC job successfully", async () => {
      cdcStub.pauseJob.resolves({
        success: true,
        message: "Job test-job-123 paused",
      });

      const response = await request(app).post("/api/cdc/pause/test-job-123");

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.include("paused");
      expect(cdcStub.pauseJob.calledWith("test-job-123")).to.be.true;
    });

    it("should handle pause errors", async () => {
      cdcStub.pauseJob.rejects(new Error("Job not found"));

      const response = await request(app).post(
        "/api/cdc/pause/nonexistent-job"
      );

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Job not found");
    });
  });

  describe("POST /api/cdc/resume/:jobId", () => {
    it("should resume CDC job successfully", async () => {
      cdcStub.resumeJob.resolves({
        success: true,
        message: "Job test-job-123 resumed",
      });

      const response = await request(app).post("/api/cdc/resume/test-job-123");

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.include("resumed");
      expect(cdcStub.resumeJob.calledWith("test-job-123")).to.be.true;
    });

    it("should handle resume errors", async () => {
      cdcStub.resumeJob.rejects(new Error("Job not found"));

      const response = await request(app).post(
        "/api/cdc/resume/nonexistent-job"
      );

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Job not found");
    });
  });

  describe("GET /api/cdc/status/:jobId", () => {
    it("should get job status successfully", async () => {
      const mockStatus = {
        jobId: "test-job-123",
        tableName: "users",
        collectionName: "users_sync",
        isActive: true,
        lastTimestamp: new Date("2023-06-15T10:30:00Z"),
        pollingInterval: 5000,
        stats: {
          totalProcessed: 150,
          lastRun: new Date("2023-06-15T10:35:00Z"),
          errors: 0,
          successfulRuns: 30,
        },
      };

      cdcStub.getJobStatus.returns(mockStatus);

      const response = await request(app).get("/api/cdc/status/test-job-123");

      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal(mockStatus);
      expect(cdcStub.getJobStatus.calledWith("test-job-123")).to.be.true;
    });

    it("should return 404 for non-existent job", async () => {
      cdcStub.getJobStatus.returns(null);

      const response = await request(app).get(
        "/api/cdc/status/nonexistent-job"
      );

      expect(response.status).to.equal(404);
      expect(response.body.error).to.equal("Job not found");
    });

    it("should handle service errors", async () => {
      cdcStub.getJobStatus.throws(new Error("Service error"));

      const response = await request(app).get("/api/cdc/status/test-job-123");

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Service error");
    });
  });

  describe("GET /api/cdc/jobs", () => {
    it("should get all jobs successfully", async () => {
      const mockJobs = [
        {
          jobId: "job-1",
          tableName: "users",
          collectionName: "users_sync",
          isActive: true,
          stats: { totalProcessed: 100 },
        },
        {
          jobId: "job-2",
          tableName: "orders",
          collectionName: "orders_sync",
          isActive: false,
          stats: { totalProcessed: 50 },
        },
      ];

      cdcStub.getAllJobs.returns(mockJobs);

      const response = await request(app).get("/api/cdc/jobs");

      expect(response.status).to.equal(200);
      expect(response.body.jobs).to.deep.equal(mockJobs);
      expect(cdcStub.getAllJobs.calledOnce).to.be.true;
    });

    it("should return empty array when no jobs exist", async () => {
      cdcStub.getAllJobs.returns([]);

      const response = await request(app).get("/api/cdc/jobs");

      expect(response.status).to.equal(200);
      expect(response.body.jobs).to.be.an("array").that.is.empty;
    });

    it("should handle service errors", async () => {
      cdcStub.getAllJobs.throws(new Error("Service error"));

      const response = await request(app).get("/api/cdc/jobs");

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Service error");
    });
  });

  describe("PUT /api/cdc/update/:jobId", () => {
    it("should update job configuration successfully", async () => {
      cdcStub.updateJobConfig.resolves({
        success: true,
        message: "Job test-job-123 updated successfully",
      });

      const updates = {
        pollingInterval: 10000,
        batchSize: 500,
        whereClause: 'status IN ("active", "pending")',
      };

      const response = await request(app)
        .put("/api/cdc/update/test-job-123")
        .send(updates);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.include("updated successfully");
      expect(cdcStub.updateJobConfig.calledWith("test-job-123", updates)).to.be
        .true;
    });

    it("should handle update errors", async () => {
      cdcStub.updateJobConfig.rejects(new Error("Job not found"));

      const response = await request(app)
        .put("/api/cdc/update/nonexistent-job")
        .send({ pollingInterval: 10000 });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Job not found");
    });

    it("should handle empty update body", async () => {
      cdcStub.updateJobConfig.resolves({
        success: true,
        message: "Job test-job-123 updated successfully",
      });

      const response = await request(app)
        .put("/api/cdc/update/test-job-123")
        .send({});

      expect(response.status).to.equal(200);
      expect(cdcStub.updateJobConfig.calledWith("test-job-123", {})).to.be.true;
    });
  });

  describe("GET /api/cdc/stats/:jobId", () => {
    it("should get job statistics successfully", async () => {
      const mockStatus = {
        jobId: "test-job-123",
        stats: {
          totalProcessed: 500,
          lastRun: new Date("2023-06-15T10:35:00Z"),
          errors: 2,
          successfulRuns: 98,
        },
        isActive: true,
        lastTimestamp: new Date("2023-06-15T10:30:00Z"),
      };

      cdcStub.getJobStatus.returns(mockStatus);

      const response = await request(app).get("/api/cdc/stats/test-job-123");

      expect(response.status).to.equal(200);
      expect(response.body.jobId).to.equal("test-job-123");
      expect(response.body.stats).to.deep.equal(mockStatus.stats);
      expect(response.body.isActive).to.be.true;
      expect(response.body.lastTimestamp).to.equal(
        mockStatus.lastTimestamp.toISOString()
      );
    });

    it("should return 404 for non-existent job", async () => {
      cdcStub.getJobStatus.returns(null);

      const response = await request(app).get("/api/cdc/stats/nonexistent-job");

      expect(response.status).to.equal(404);
      expect(response.body.error).to.equal("Job not found");
    });
  });

  describe("POST /api/cdc/test", () => {
    it("should test CDC configuration successfully", async () => {
      const mockColumns = [
        { name: "id", type: "int" },
        { name: "name", type: "varchar" },
        { name: "updated_at", type: "timestamp" },
      ];

      const mockTestData = [
        { id: 1, name: "John", updated_at: new Date() },
        { id: 2, name: "Jane", updated_at: new Date() },
      ];

      sqlStub.getTableColumns.resolves(mockColumns);
      sqlStub.executeQuery.resolves([mockTestData]);

      const response = await request(app)
        .post("/api/cdc/test")
        .send({
          sqlConnectionKey: "mysql-localhost-testdb",
          tableName: "users",
          timestampColumn: "updated_at",
          primaryKeyColumn: "id",
          selectedColumns: ["id", "name"],
          whereClause: 'status = "active"',
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.equal("CDC configuration is valid");
      expect(response.body.sampleData).to.deep.equal(mockTestData);
      expect(response.body.timestampColumnValid).to.be.true;
      expect(response.body.primaryKeyColumnValid).to.be.true;
    });

    it("should detect invalid timestamp column", async () => {
      const mockColumns = [
        { name: "id", type: "int" },
        { name: "name", type: "varchar" },
        // missing updated_at column
      ];

      sqlStub.getTableColumns.resolves(mockColumns);

      const response = await request(app).post("/api/cdc/test").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        tableName: "users",
        timestampColumn: "updated_at",
        primaryKeyColumn: "id",
      });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include(
        "Timestamp column 'updated_at' not found"
      );
    });

    it("should detect invalid primary key column", async () => {
      const mockColumns = [
        { name: "user_id", type: "int" },
        { name: "name", type: "varchar" },
        { name: "updated_at", type: "timestamp" },
      ];

      sqlStub.getTableColumns.resolves(mockColumns);

      const response = await request(app).post("/api/cdc/test").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        tableName: "users",
        timestampColumn: "updated_at",
        primaryKeyColumn: "id",
      });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include(
        "Primary key column 'id' not found"
      );
    });

    it("should handle SQL query errors during test", async () => {
      const mockColumns = [
        { name: "id", type: "int" },
        { name: "updated_at", type: "timestamp" },
      ];

      sqlStub.getTableColumns.resolves(mockColumns);
      sqlStub.executeQuery.rejects(new Error("Table access denied"));

      const response = await request(app).post("/api/cdc/test").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        tableName: "users",
        timestampColumn: "updated_at",
        primaryKeyColumn: "id",
      });

      expect(response.status).to.equal(500);
      expect(response.body.error).to.include("Table access denied");
    });

    it("should validate required parameters", async () => {
      const response = await request(app).post("/api/cdc/test").send({
        sqlConnectionKey: "mysql-localhost-testdb",
        tableName: "users",
        // missing timestampColumn and primaryKeyColumn
      });

      expect(response.status).to.equal(500);
    });

    it("should handle WHERE clause in test query", async () => {
      const mockColumns = [
        { name: "id", type: "int" },
        { name: "status", type: "varchar" },
        { name: "updated_at", type: "timestamp" },
      ];

      const mockTestData = [
        { id: 1, status: "active", updated_at: new Date() },
      ];

      sqlStub.getTableColumns.resolves(mockColumns);
      sqlStub.executeQuery.resolves([mockTestData]);

      const response = await request(app)
        .post("/api/cdc/test")
        .send({
          sqlConnectionKey: "mysql-localhost-testdb",
          tableName: "users",
          timestampColumn: "updated_at",
          primaryKeyColumn: "id",
          selectedColumns: ["id", "status"],
          whereClause: 'status = "active"',
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      // Verify the query includes the WHERE clause
      const expectedQuery =
        'SELECT id, status FROM users WHERE updated_at IS NOT NULL AND (status = "active") ORDER BY updated_at DESC LIMIT 5';
      expect(
        sqlStub.executeQuery.calledWith("mysql-localhost-testdb", expectedQuery)
      ).to.be.true;
    });
  });
});
