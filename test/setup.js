const chai = require('chai');
const sinon = require('sinon');

// Global test setup
global.expect = chai.expect;
global.sinon = sinon;

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = 3001; // Use different port for testing

// Increase timeout for database operations
chai.config.truncateThreshold = 0;

// Setup and teardown hooks
beforeEach(function() {
  // Reset all sinon stubs/spies before each test
  sinon.restore();
});

after(function() {
  // Clean up after all tests
  sinon.restore();
});