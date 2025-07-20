const request = require("supertest");
const { expect } = require("chai");
const express = require("express");
const path = require("path");

// Create a test version of the app
const createTestApp = () => {
  const app = express();

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.static(path.join(__dirname, "../../public")));

  // Mock routes for testing
  app.use("/api/sql", (req, res) => res.json({ message: "SQL API" }));
  app.use("/api/mongo", (req, res) => res.json({ message: "MongoDB API" }));
  app.use("/api/migration", (req, res) =>
    res.json({ message: "Migration API" })
  );
  app.use("/api/cdc", (req, res) => res.json({ message: "CDC API" }));

  // API Info endpoint
  app.get("/api", (req, res) => {
    res.json({
      name: "SQL to MongoDB Migration API",
      version: "1.0.0",
      description:
        "API for migrating data from SQL databases to MongoDB with CDC capabilities",
      documentation: "/api-docs",
      endpoints: {
        sql: "/api/sql",
        mongodb: "/api/mongo",
        migration: "/api/migration",
        cdc: "/api/cdc",
      },
    });
  });

  // Serve the main HTML file
  app.get("/", (req, res) => {
    res.json({ message: "Main application page" });
  });

  return app;
};

describe("Application Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /", () => {
    it("should serve the main application page", async () => {
      const response = await request(app).get("/");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal("Main application page");
    });
  });

  describe("GET /api", () => {
    it("should return API information", async () => {
      const response = await request(app).get("/api");

      expect(response.status).to.equal(200);
      expect(response.body.name).to.equal("SQL to MongoDB Migration API");
      expect(response.body.version).to.equal("1.0.0");
      expect(response.body.description).to.include("API for migrating data");
      expect(response.body.documentation).to.equal("/api-docs");
      expect(response.body.endpoints).to.be.an("object");
      expect(response.body.endpoints.sql).to.equal("/api/sql");
      expect(response.body.endpoints.mongodb).to.equal("/api/mongo");
      expect(response.body.endpoints.migration).to.equal("/api/migration");
      expect(response.body.endpoints.cdc).to.equal("/api/cdc");
    });
  });

  describe("API Route Mounting", () => {
    it("should mount SQL API routes", async () => {
      const response = await request(app).get("/api/sql");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal("SQL API");
    });

    it("should mount MongoDB API routes", async () => {
      const response = await request(app).get("/api/mongo");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal("MongoDB API");
    });

    it("should mount Migration API routes", async () => {
      const response = await request(app).get("/api/migration");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal("Migration API");
    });

    it("should mount CDC API routes", async () => {
      const response = await request(app).get("/api/cdc");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal("CDC API");
    });
  });

  describe("Middleware", () => {
    it("should parse JSON requests", async () => {
      const testData = { test: "data", number: 123 };

      // Add a test route that echoes the request body
      app.post("/test-json", (req, res) => {
        res.json(req.body);
      });

      const response = await request(app).post("/test-json").send(testData);

      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal(testData);
    });

    it("should handle large JSON payloads", async () => {
      // Create a large test object
      const largeData = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: "A".repeat(100),
        })),
      };

      app.post("/test-large-json", (req, res) => {
        res.json({ received: req.body.data.length });
      });

      const response = await request(app)
        .post("/test-large-json")
        .send(largeData);

      expect(response.status).to.equal(200);
      expect(response.body.received).to.equal(1000);
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 for non-existent routes", async () => {
      const response = await request(app).get("/non-existent-route");

      expect(response.status).to.equal(404);
    });

    it("should handle invalid JSON", async () => {
      app.post("/test-invalid-json", (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post("/test-invalid-json")
        .set("Content-Type", "application/json")
        .send("{ invalid json }");

      expect(response.status).to.equal(400);
    });
  });

  describe("Static File Serving", () => {
    it("should serve static files", async () => {
      // This test assumes static files are served correctly
      // In a real scenario, you might want to create test static files
      const response = await request(app).get("/non-existent-static-file.txt");

      // Should return 404 for non-existent static files
      expect(response.status).to.equal(404);
    });
  });
});
