const logger = require('./logger');
const metrics = require('./metrics');
const sqlConnector = require('../database/sqlConnector');
const mongoConnector = require('../database/mongoConnector');
const cdcService = require('../services/cdcService');

/**
 * Health Check System for Application Monitoring
 * Provides comprehensive health status for all system components
 */
class HealthCheck {
  constructor() {
    this.checks = new Map();
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    
    // Register default health checks
    this.registerDefaultChecks();
    
    logger.info('Health check system initialized');
  }

  /**
   * Register default health checks
   */
  registerDefaultChecks() {
    this.registerCheck('application', this.checkApplication.bind(this));
    this.registerCheck('memory', this.checkMemory.bind(this));
    this.registerCheck('database_connections', this.checkDatabaseConnections.bind(this));
    this.registerCheck('cdc_service', this.checkCdcService.bind(this));
    this.registerCheck('disk_space', this.checkDiskSpace.bind(this));
  }

  /**
   * Register a new health check
   */
  registerCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      name,
      checkFunction,
      timeout: options.timeout || 5000,
      critical: options.critical || false,
      enabled: options.enabled !== false
    });
    
    logger.debug('Health check registered', { name, options });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name) {
    this.checks.delete(name);
    logger.debug('Health check unregistered', { name });
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    const startTime = Date.now();
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      summary: {
        total: this.checks.size,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };

    // Run all checks in parallel
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      if (!check.enabled) {
        return { name, status: 'disabled' };
      }

      try {
        const checkStartTime = Date.now();
        
        // Run check with timeout
        const checkResult = await Promise.race([
          check.checkFunction(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
          )
        ]);

        const duration = Date.now() - checkStartTime;
        
        return {
          name,
          status: 'healthy',
          duration: `${duration}ms`,
          ...checkResult
        };
      } catch (error) {
        logger.warn(`Health check failed: ${name}`, { error: error.message });
        
        return {
          name,
          status: 'unhealthy',
          error: error.message,
          critical: check.critical
        };
      }
    });

    // Wait for all checks to complete
    const checkResults = await Promise.all(checkPromises);
    
    // Process results
    checkResults.forEach(result => {
      results.checks[result.name] = result;
      
      if (result.status === 'healthy') {
        results.summary.passed++;
      } else if (result.status === 'unhealthy') {
        results.summary.failed++;
        
        // Mark overall status as unhealthy if critical check fails
        if (result.critical) {
          results.status = 'unhealthy';
        } else if (results.status === 'healthy') {
          results.status = 'degraded';
        }
      } else if (result.status === 'warning') {
        results.summary.warnings++;
        
        if (results.status === 'healthy') {
          results.status = 'degraded';
        }
      }
    });

    const totalDuration = Date.now() - startTime;
    results.duration = `${totalDuration}ms`;
    
    this.lastHealthCheck = results;
    
    // Log health check results
    logger.info('Health check completed', {
      status: results.status,
      duration: results.duration,
      passed: results.summary.passed,
      failed: results.summary.failed,
      warnings: results.summary.warnings
    });

    return results;
  }

  /**
   * Check application health
   */
  async checkApplication() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Check memory usage
   */
  async checkMemory() {
    const memUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const systemMemoryUsedPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    let status = 'healthy';
    const warnings = [];
    
    if (heapUsedPercent > 90) {
      status = 'warning';
      warnings.push('High heap usage');
    }
    
    if (systemMemoryUsedPercent > 90) {
      status = 'warning';
      warnings.push('High system memory usage');
    }
    
    return {
      status,
      warnings,
      heap: {
        used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        usedPercent: `${heapUsedPercent.toFixed(2)}%`
      },
      system: {
        total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
        free: `${Math.round(freeMemory / 1024 / 1024)}MB`,
        usedPercent: `${systemMemoryUsedPercent.toFixed(2)}%`
      }
    };
  }

  /**
   * Check database connections
   */
  async checkDatabaseConnections() {
    const connections = {
      sql: sqlConnector.connections.size,
      mongo: mongoConnector.connections.size
    };
    
    const issues = [];
    
    // Check for connection leaks
    if (connections.sql > 10) {
      issues.push('High number of SQL connections');
    }
    
    if (connections.mongo > 10) {
      issues.push('High number of MongoDB connections');
    }
    
    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      warnings: issues,
      connections
    };
  }

  /**
   * Check CDC service health
   */
  async checkCdcService() {
    const jobs = cdcService.getAllJobs();
    const activeJobs = jobs.filter(job => job.isActive);
    const pausedJobs = jobs.filter(job => !job.isActive);
    
    const issues = [];
    let errorCount = 0;
    
    // Check for jobs with errors
    jobs.forEach(job => {
      if (job.stats.errors > 0) {
        errorCount += job.stats.errors;
      }
      
      // Check for jobs that haven't run recently
      if (job.isActive && job.stats.lastRun) {
        const lastRunTime = new Date(job.stats.lastRun);
        const timeSinceLastRun = Date.now() - lastRunTime.getTime();
        const expectedInterval = job.pollingInterval * 2; // Allow 2x interval
        
        if (timeSinceLastRun > expectedInterval) {
          issues.push(`Job ${job.jobId} hasn't run recently`);
        }
      }
    });
    
    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      warnings: issues,
      jobs: {
        total: jobs.length,
        active: activeJobs.length,
        paused: pausedJobs.length,
        totalErrors: errorCount
      }
    };
  }

  /**
   * Check disk space
   */
  async checkDiskSpace() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');
      
      // This is a simplified check - in production, you'd want to check actual disk usage
      return {
        status: 'healthy',
        message: 'Disk space check not implemented for this platform'
      };
    } catch (error) {
      return {
        status: 'warning',
        error: error.message
      };
    }
  }

  /**
   * Get last health check results
   */
  getLastHealthCheck() {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(interval = 60000) { // Default: 1 minute
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.runHealthChecks();
      } catch (error) {
        logger.error('Periodic health check failed', error);
      }
    }, interval);
    
    logger.info('Periodic health checks started', { interval: `${interval}ms` });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Periodic health checks stopped');
    }
  }

  /**
   * Get health check summary for metrics
   */
  getHealthSummary() {
    if (!this.lastHealthCheck) {
      return { status: 'unknown', checks: 0 };
    }
    
    return {
      status: this.lastHealthCheck.status,
      checks: this.lastHealthCheck.summary.total,
      passed: this.lastHealthCheck.summary.passed,
      failed: this.lastHealthCheck.summary.failed,
      warnings: this.lastHealthCheck.summary.warnings,
      lastCheck: this.lastHealthCheck.timestamp
    };
  }
}

// Create singleton instance
const healthCheck = new HealthCheck();

module.exports = healthCheck;
module.exports.HealthCheck = HealthCheck;