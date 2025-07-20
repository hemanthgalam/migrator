const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * Enhanced Logger Class for SQL to MongoDB Migration App
 * Provides structured logging with multiple transports and observability features
 */
class Logger {
  constructor() {
    this.logDir = process.env.LOG_DIR || 'logs';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.nodeEnv = process.env.NODE_ENV || 'development';
    
    // Ensure log directory exists
    this.ensureLogDirectory();
    
    // Initialize Winston logger
    this.logger = this.createLogger();
    
    // Performance tracking
    this.performanceMetrics = new Map();
    
    // Request tracking
    this.requestId = 0;
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Create Winston logger with multiple transports
   */
  createLogger() {
    const formats = {
      console: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
      file: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    };

    const transports = [
      // Console transport for development
      new winston.transports.Console({
        level: this.nodeEnv === 'production' ? 'warn' : 'debug',
        format: formats.console,
        handleExceptions: true,
        handleRejections: true
      }),

      // File transport for all logs
      new winston.transports.File({
        filename: path.join(this.logDir, 'app.log'),
        level: this.logLevel,
        format: formats.file,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true
      }),

      // Error-specific file
      new winston.transports.File({
        filename: path.join(this.logDir, 'error.log'),
        level: 'error',
        format: formats.file,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
        tailable: true
      }),

      // Performance logs
      new winston.transports.File({
        filename: path.join(this.logDir, 'performance.log'),
        level: 'info',
        format: formats.file,
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
        tailable: true,
        // Only log performance-related entries
        filter: (info) => info.type === 'performance'
      })
    ];

    // Add HTTP transport for centralized logging in production
    if (this.nodeEnv === 'production' && process.env.LOG_ENDPOINT) {
      transports.push(
        new winston.transports.Http({
          host: process.env.LOG_HOST || 'localhost',
          port: process.env.LOG_PORT || 3001,
          path: process.env.LOG_ENDPOINT || '/logs',
          level: 'error'
        })
      );
    }

    return winston.createLogger({
      level: this.logLevel,
      transports,
      exitOnError: false,
      // Global metadata
      defaultMeta: {
        service: 'sql-mongo-migrator',
        version: process.env.npm_package_version || '1.0.0',
        environment: this.nodeEnv,
        hostname: require('os').hostname(),
        pid: process.pid
      }
    });
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${++this.requestId}`;
  }

  /**
   * Create child logger with context
   */
  child(context = {}) {
    return {
      debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
      error: (message, meta = {}) => this.error(message, { ...context, ...meta })
    };
  }

  /**
   * Debug level logging
   */
  debug(message, meta = {}) {
    this.logger.debug(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'debug'
    });
  }

  /**
   * Info level logging
   */
  info(message, meta = {}) {
    this.logger.info(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'info'
    });
  }

  /**
   * Warning level logging
   */
  warn(message, meta = {}) {
    this.logger.warn(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'warn'
    });
  }

  /**
   * Error level logging with stack trace
   */
  error(message, error = null, meta = {}) {
    const errorMeta = {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'error'
    };

    if (error instanceof Error) {
      errorMeta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      };
    } else if (error) {
      errorMeta.error = error;
    }

    this.logger.error(message, errorMeta);
  }

  /**
   * Log database operations
   */
  database(operation, details = {}) {
    this.info(`Database operation: ${operation}`, {
      type: 'database',
      operation,
      ...details
    });
  }

  /**
   * Log API requests
   */
  request(req, res, responseTime) {
    const requestId = req.requestId || this.generateRequestId();
    
    this.info('HTTP Request', {
      type: 'request',
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('Content-Length') || 0
    });
  }

  /**
   * Log CDC operations
   */
  cdc(jobId, operation, details = {}) {
    this.info(`CDC ${operation}`, {
      type: 'cdc',
      jobId,
      operation,
      ...details
    });
  }

  /**
   * Log migration operations
   */
  migration(operation, details = {}) {
    this.info(`Migration ${operation}`, {
      type: 'migration',
      operation,
      ...details
    });
  }

  /**
   * Log performance metrics
   */
  performance(operation, duration, details = {}) {
    this.logger.info(`Performance: ${operation}`, {
      type: 'performance',
      operation,
      duration: `${duration}ms`,
      ...details
    });
  }

  /**
   * Start performance timer
   */
  startTimer(operation) {
    const startTime = Date.now();
    const timerId = `${operation}_${startTime}_${Math.random()}`;
    
    this.performanceMetrics.set(timerId, {
      operation,
      startTime,
      timestamp: new Date().toISOString()
    });
    
    return timerId;
  }

  /**
   * End performance timer and log
   */
  endTimer(timerId, details = {}) {
    const metric = this.performanceMetrics.get(timerId);
    if (!metric) {
      this.warn('Timer not found', { timerId });
      return;
    }

    const duration = Date.now() - metric.startTime;
    this.performance(metric.operation, duration, details);
    
    this.performanceMetrics.delete(timerId);
    return duration;
  }

  /**
   * Log security events
   */
  security(event, details = {}) {
    this.warn(`Security event: ${event}`, {
      type: 'security',
      event,
      ...details
    });
  }

  /**
   * Log system metrics
   */
  system(metrics) {
    this.info('System metrics', {
      type: 'system',
      ...metrics
    });
  }

  /**
   * Log business events
   */
  business(event, details = {}) {
    this.info(`Business event: ${event}`, {
      type: 'business',
      event,
      ...details
    });
  }

  /**
   * Create structured error for API responses
   */
  createError(message, code = 'INTERNAL_ERROR', statusCode = 500, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    error.timestamp = new Date().toISOString();
    
    this.error(message, error, { code, statusCode, details });
    
    return error;
  }

  /**
   * Log application startup
   */
  startup(details = {}) {
    this.info('Application starting', {
      type: 'startup',
      ...details
    });
  }

  /**
   * Log application shutdown
   */
  shutdown(details = {}) {
    this.info('Application shutting down', {
      type: 'shutdown',
      ...details
    });
  }

  /**
   * Get logger statistics
   */
  getStats() {
    return {
      activeTimers: this.performanceMetrics.size,
      logLevel: this.logLevel,
      environment: this.nodeEnv,
      logDirectory: this.logDir
    };
  }

  /**
   * Flush all logs (useful for testing)
   */
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
module.exports = logger;
module.exports.Logger = Logger;