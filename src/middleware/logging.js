const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

/**
 * Request Logging Middleware
 * Logs all HTTP requests with detailed information and metrics
 */
const requestLogging = (req, res, next) => {
  // Generate unique request ID
  req.requestId = logger.generateRequestId();
  req.startTime = Date.now();

  // Create child logger with request context
  req.logger = logger.child({
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  });

  // Log incoming request
  req.logger.info('Incoming request', {
    type: 'request_start',
    headers: req.headers,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - req.startTime;
    
    // Log response
    req.logger.info('Request completed', {
      type: 'request_end',
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      responseSize: JSON.stringify(data).length
    });

    // Record metrics
    const route = req.route ? req.route.path : req.path;
    metrics.recordHttpRequest(req.method, route, res.statusCode, responseTime);

    // Call original json method
    return originalJson.call(this, data);
  };

  // Handle response finish event
  res.on('finish', () => {
    const responseTime = Date.now() - req.startTime;
    
    // Log request completion
    logger.request(req, res, responseTime);
    
    // Record metrics if not already recorded
    if (!res.headersSent) {
      const route = req.route ? req.route.path : req.path;
      metrics.recordHttpRequest(req.method, route, res.statusCode, responseTime);
    }
  });

  next();
};

/**
 * Error Logging Middleware
 * Logs all errors with stack traces and context
 */
const errorLogging = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const responseTime = Date.now() - (req.startTime || Date.now());

  // Log error with full context
  logger.error('Request error', err, {
    requestId,
    method: req.method,
    url: req.url,
    statusCode: err.statusCode || 500,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Record error metrics
  metrics.recordError(err.code || 'UNKNOWN_ERROR', 'error');
  
  const route = req.route ? req.route.path : req.path;
  metrics.recordHttpRequest(req.method, route, err.statusCode || 500, responseTime);

  // Send error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    requestId,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

/**
 * Security Logging Middleware
 * Logs security-related events
 */
const securityLogging = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
    /eval\(/i,  // Code injection
  ];

  const url = req.url.toLowerCase();
  const body = JSON.stringify(req.body || {}).toLowerCase();
  
  suspiciousPatterns.forEach(pattern => {
    if (pattern.test(url) || pattern.test(body)) {
      logger.security('Suspicious request detected', {
        requestId: req.requestId,
        pattern: pattern.toString(),
        url: req.url,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        body: req.body
      });
      
      metrics.recordError('SECURITY_THREAT', 'warning');
    }
  });

  // Log failed authentication attempts
  if (req.url.includes('/login') && req.method === 'POST') {
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        logger.security('Authentication failure', {
          requestId: req.requestId,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          statusCode: res.statusCode
        });
        
        metrics.recordError('AUTH_FAILURE', 'warning');
      }
    });
  }

  next();
};

/**
 * Performance Monitoring Middleware
 * Monitors and logs performance metrics
 */
const performanceMonitoring = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log slow requests
    const slowRequestThreshold = process.env.SLOW_REQUEST_THRESHOLD || 1000;
    if (duration > slowRequestThreshold) {
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        threshold: `${slowRequestThreshold}ms`,
        statusCode: res.statusCode
      });
      
      metrics.recordError('SLOW_REQUEST', 'warning');
    }
    
    // Log performance metrics
    logger.performance(`${req.method} ${req.url}`, duration, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length') || 0
    });
  });

  next();
};

/**
 * Rate Limiting Logging Middleware
 * Logs rate limiting events
 */
const rateLimitLogging = (req, res, next) => {
  // This middleware works with express-rate-limit
  res.on('finish', () => {
    if (res.statusCode === 429) {
      logger.security('Rate limit exceeded', {
        requestId: req.requestId,
        ip: req.ip || req.connection.remoteAddress,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      
      metrics.recordError('RATE_LIMIT_EXCEEDED', 'warning');
    }
  });

  next();
};

/**
 * Database Operation Logging Wrapper
 * Wraps database operations with logging and metrics
 */
const logDatabaseOperation = (databaseType, operation) => {
  return async (operationFn) => {
    const startTime = Date.now();
    const timerId = logger.startTimer(`db_${databaseType}_${operation}`);
    
    try {
      logger.database(operation, { databaseType, status: 'started' });
      
      const result = await operationFn();
      
      const duration = logger.endTimer(timerId);
      metrics.recordDatabaseOperation(databaseType, operation, 'success', duration);
      
      logger.database(operation, { 
        databaseType, 
        status: 'completed', 
        duration: `${duration}ms` 
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordDatabaseOperation(databaseType, operation, 'error', duration);
      
      logger.error(`Database operation failed: ${operation}`, error, {
        databaseType,
        operation,
        duration: `${duration}ms`
      });
      
      throw error;
    }
  };
};

/**
 * Migration Operation Logging Wrapper
 * Wraps migration operations with logging and metrics
 */
const logMigrationOperation = (sourceDb, targetDb, sourceTable, targetCollection) => {
  return async (migrationFn) => {
    const startTime = Date.now();
    const timerId = logger.startTimer(`migration_${sourceTable}_to_${targetCollection}`);
    
    try {
      logger.migration('started', { 
        sourceDb, 
        targetDb, 
        sourceTable, 
        targetCollection 
      });
      
      const result = await migrationFn();
      
      const duration = logger.endTimer(timerId);
      const recordsProcessed = result.migratedCount || 0;
      
      metrics.recordMigration(
        sourceDb, 
        targetDb, 
        'success', 
        recordsProcessed, 
        duration, 
        sourceTable, 
        targetCollection
      );
      
      logger.migration('completed', {
        sourceDb,
        targetDb,
        sourceTable,
        targetCollection,
        recordsProcessed,
        duration: `${duration}ms`
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      metrics.recordMigration(
        sourceDb, 
        targetDb, 
        'error', 
        0, 
        duration, 
        sourceTable, 
        targetCollection
      );
      
      logger.error('Migration failed', error, {
        sourceDb,
        targetDb,
        sourceTable,
        targetCollection,
        duration: `${duration}ms`
      });
      
      throw error;
    }
  };
};

/**
 * CDC Operation Logging Wrapper
 * Wraps CDC operations with logging and metrics
 */
const logCdcOperation = (jobId, tableName) => {
  return async (cdcFn) => {
    const startTime = Date.now();
    
    try {
      const result = await cdcFn();
      
      const duration = Date.now() - startTime;
      const recordsProcessed = result.recordsProcessed || 0;
      
      metrics.recordCdcJob(jobId, tableName, recordsProcessed, duration);
      
      logger.cdc(jobId, 'polling_completed', {
        tableName,
        recordsProcessed,
        duration: `${duration}ms`
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      metrics.recordCdcJob(jobId, tableName, 0, duration, error.code || 'UNKNOWN_ERROR');
      
      logger.error(`CDC operation failed for job ${jobId}`, error, {
        jobId,
        tableName,
        duration: `${duration}ms`
      });
      
      throw error;
    }
  };
};

module.exports = {
  requestLogging,
  errorLogging,
  securityLogging,
  performanceMonitoring,
  rateLimitLogging,
  logDatabaseOperation,
  logMigrationOperation,
  logCdcOperation
};