const { expect, sinon } = require('chai');
const fs = require('fs');
const path = require('path');
const logger = require('../../../src/utils/logger');

describe('Logger', () => {
  let logDir;

  beforeEach(() => {
    logDir = path.join(__dirname, '../../../logs');
    
    // Clean up log files before each test
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up log files after each test
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create log directory if it does not exist', () => {
      expect(fs.existsSync(logDir)).to.be.true;
    });

    it('should have correct default configuration', () => {
      const stats = logger.getStats();
      expect(stats.logLevel).to.equal('info');
      expect(stats.environment).to.equal('test');
      expect(stats.logDirectory).to.include('logs');
    });
  });

  describe('logging methods', () => {
    it('should log debug messages', () => {
      const spy = sinon.spy(logger.logger, 'debug');
      
      logger.debug('Test debug message', { key: 'value' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Test debug message')).to.be.true;
      
      spy.restore();
    });

    it('should log info messages', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.info('Test info message', { key: 'value' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Test info message')).to.be.true;
      
      spy.restore();
    });

    it('should log warning messages', () => {
      const spy = sinon.spy(logger.logger, 'warn');
      
      logger.warn('Test warning message', { key: 'value' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Test warning message')).to.be.true;
      
      spy.restore();
    });

    it('should log error messages with error objects', () => {
      const spy = sinon.spy(logger.logger, 'error');
      const testError = new Error('Test error');
      
      logger.error('Test error message', testError, { key: 'value' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Test error message')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.error.name).to.equal('Error');
      expect(callArgs.error.message).to.equal('Test error');
      expect(callArgs.error.stack).to.be.a('string');
      
      spy.restore();
    });
  });

  describe('specialized logging methods', () => {
    it('should log database operations', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.database('SELECT', { table: 'users', duration: '100ms' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Database operation: SELECT')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('database');
      expect(callArgs.operation).to.equal('SELECT');
      expect(callArgs.table).to.equal('users');
      
      spy.restore();
    });

    it('should log CDC operations', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.cdc('job-123', 'polling', { recordsProcessed: 50 });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('CDC polling')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('cdc');
      expect(callArgs.jobId).to.equal('job-123');
      expect(callArgs.operation).to.equal('polling');
      expect(callArgs.recordsProcessed).to.equal(50);
      
      spy.restore();
    });

    it('should log migration operations', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.migration('started', { sourceTable: 'users', targetCollection: 'users_sync' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Migration started')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('migration');
      expect(callArgs.operation).to.equal('started');
      expect(callArgs.sourceTable).to.equal('users');
      
      spy.restore();
    });

    it('should log security events', () => {
      const spy = sinon.spy(logger.logger, 'warn');
      
      logger.security('suspicious_activity', { ip: '192.168.1.1' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Security event: suspicious_activity')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('security');
      expect(callArgs.event).to.equal('suspicious_activity');
      expect(callArgs.ip).to.equal('192.168.1.1');
      
      spy.restore();
    });
  });

  describe('performance tracking', () => {
    it('should start and end performance timers', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      const timerId = logger.startTimer('test_operation');
      expect(timerId).to.be.a('string');
      expect(logger.performanceMetrics.has(timerId)).to.be.true;
      
      // Simulate some work
      setTimeout(() => {
        const duration = logger.endTimer(timerId);
        
        expect(duration).to.be.a('number');
        expect(duration).to.be.greaterThan(0);
        expect(logger.performanceMetrics.has(timerId)).to.be.false;
        expect(spy.calledOnce).to.be.true;
        
        const callArgs = spy.getCall(0).args[1];
        expect(callArgs.type).to.equal('performance');
        expect(callArgs.operation).to.equal('test_operation');
        
        spy.restore();
      }, 10);
    });

    it('should handle invalid timer IDs gracefully', () => {
      const spy = sinon.spy(logger.logger, 'warn');
      
      const duration = logger.endTimer('invalid-timer-id');
      
      expect(duration).to.be.undefined;
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Timer not found')).to.be.true;
      
      spy.restore();
    });
  });

  describe('child logger', () => {
    it('should create child logger with context', () => {
      const childLogger = logger.child({ requestId: 'req-123', userId: 'user-456' });
      
      expect(childLogger).to.have.property('debug');
      expect(childLogger).to.have.property('info');
      expect(childLogger).to.have.property('warn');
      expect(childLogger).to.have.property('error');
      
      const spy = sinon.spy(logger.logger, 'info');
      
      childLogger.info('Test message', { additional: 'data' });
      
      expect(spy.calledOnce).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.requestId).to.equal('req-123');
      expect(callArgs.userId).to.equal('user-456');
      expect(callArgs.additional).to.equal('data');
      
      spy.restore();
    });
  });

  describe('error creation', () => {
    it('should create structured errors', () => {
      const error = logger.createError('Test error', 'TEST_ERROR', 400, { field: 'value' });
      
      expect(error).to.be.an('error');
      expect(error.message).to.equal('Test error');
      expect(error.code).to.equal('TEST_ERROR');
      expect(error.statusCode).to.equal(400);
      expect(error.details.field).to.equal('value');
      expect(error.timestamp).to.be.a('string');
    });

    it('should use default values for error creation', () => {
      const error = logger.createError('Test error');
      
      expect(error.code).to.equal('INTERNAL_ERROR');
      expect(error.statusCode).to.equal(500);
      expect(error.details).to.deep.equal({});
    });
  });

  describe('request ID generation', () => {
    it('should generate unique request IDs', () => {
      const id1 = logger.generateRequestId();
      const id2 = logger.generateRequestId();
      
      expect(id1).to.be.a('string');
      expect(id2).to.be.a('string');
      expect(id1).to.not.equal(id2);
      expect(id1).to.match(/^req_\d+_\d+$/);
    });
  });

  describe('application lifecycle logging', () => {
    it('should log application startup', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.startup({ port: 3000, environment: 'test' });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Application starting')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('startup');
      expect(callArgs.port).to.equal(3000);
      expect(callArgs.environment).to.equal('test');
      
      spy.restore();
    });

    it('should log application shutdown', () => {
      const spy = sinon.spy(logger.logger, 'info');
      
      logger.shutdown({ signal: 'SIGTERM', graceful: true });
      
      expect(spy.calledOnce).to.be.true;
      expect(spy.calledWith('Application shutting down')).to.be.true;
      
      const callArgs = spy.getCall(0).args[1];
      expect(callArgs.type).to.equal('shutdown');
      expect(callArgs.signal).to.equal('SIGTERM');
      expect(callArgs.graceful).to.be.true;
      
      spy.restore();
    });
  });

  describe('statistics', () => {
    it('should return logger statistics', () => {
      const stats = logger.getStats();
      
      expect(stats).to.be.an('object');
      expect(stats).to.have.property('activeTimers');
      expect(stats).to.have.property('logLevel');
      expect(stats).to.have.property('environment');
      expect(stats).to.have.property('logDirectory');
      
      expect(stats.activeTimers).to.be.a('number');
      expect(stats.logLevel).to.be.a('string');
      expect(stats.environment).to.be.a('string');
      expect(stats.logDirectory).to.be.a('string');
    });
  });
});