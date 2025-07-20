const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
require('dotenv').config();

// Import utilities and middleware
const logger = require('./utils/logger');
const metrics = require('./utils/metrics');
const healthCheck = require('./utils/healthCheck');
const {
  requestLogging,
  errorLogging,
  securityLogging,
  performanceMonitoring,
  rateLimitLogging
} = require('./middleware/logging');

// Import routes
const sqlRoutes = require('./routes/sql');
const mongoRoutes = require('./routes/mongo');
const migrationRoutes = require('./routes/migration');
const cdcRoutes = require('./routes/cdc');

const app = express();
const PORT = process.env.PORT || 3000;

// Log application startup
logger.startup({
  port: PORT,
  nodeEnv: process.env.NODE_ENV,
  nodeVersion: process.version,
  platform: process.platform
});

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.API_RATE_LIMIT || 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.security('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Apply rate limiting to API routes
app.use('/api', limiter);

// Logging and monitoring middleware
app.use(requestLogging);
app.use(securityLogging);
app.use(performanceMonitoring);
app.use(rateLimitLogging);

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SQL to MongoDB Migration API',
  swaggerOptions: {
    persistAuthorization: true,
  }
}));

// API Routes
app.use('/api/sql', sqlRoutes);
app.use('/api/mongo', mongoRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/cdc', cdcRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await healthCheck.runHealthChecks();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const metricsData = await metrics.getMetrics();
    res.set('Content-Type', metrics.register.contentType);
    res.end(metricsData);
  } catch (error) {
    logger.error('Failed to get metrics', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Metrics summary endpoint (JSON format)
app.get('/api/metrics', async (req, res) => {
  try {
    const summary = await metrics.getSummary();
    res.json(summary);
  } catch (error) {
    logger.error('Failed to get metrics summary', error);
    res.status(500).json({ error: 'Failed to get metrics summary' });
  }
});

// System status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const health = healthCheck.getLastHealthCheck() || await healthCheck.runHealthChecks();
    const metricsStats = await metrics.getSummary();
    const loggerStats = logger.getStats();
    
    res.json({
      status: health.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      health: health.summary,
      metrics: metricsStats,
      logger: loggerStats,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    logger.error('Failed to get system status', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// API Info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'SQL to MongoDB Migration API',
    version: '1.0.0',
    description: 'API for migrating data from SQL databases to MongoDB with CDC capabilities',
    documentation: '/api-docs',
    endpoints: {
      sql: '/api/sql',
      mongodb: '/api/mongo', 
      migration: '/api/migration',
      cdc: '/api/cdc',
      health: '/health',
      metrics: '/metrics',
      status: '/api/status'
    }
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware (must be last)
app.use(errorLogging);

// Start periodic health checks
healthCheck.startPeriodicChecks(60000); // Every minute

// Start the server
const server = app.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });
  
  console.log(`SQL to MongoDB Migration Server running on port ${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`📖 API Guide: http://localhost:${PORT}/api-docs.html`);
  console.log(`🔗 API Info: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`📈 Status: http://localhost:${PORT}/api/status`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Stop health checks
    healthCheck.stopPeriodicChecks();
    
    // Close database connections
    const sqlConnector = require('./database/sqlConnector');
    const mongoConnector = require('./database/mongoConnector');
    const cdcService = require('./services/cdcService');
    
    // Stop all CDC jobs
    const cdcJobs = cdcService.getAllJobs();
    Promise.all(cdcJobs.map(job => cdcService.stopPolling(job.jobId).catch(() => {})))
      .then(() => {
        logger.info('All CDC jobs stopped');
        
        // Close database connections
        const sqlConnections = Array.from(sqlConnector.connections.keys());
        const mongoConnections = Array.from(mongoConnector.connections.keys());
        
        return Promise.all([
          ...sqlConnections.map(key => sqlConnector.disconnect(key).catch(() => {})),
          ...mongoConnections.map(key => mongoConnector.disconnect(key).catch(() => {}))
        ]);
      })
      .then(() => {
        logger.shutdown({ signal, graceful: true });
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      });
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', reason, { promise });
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;