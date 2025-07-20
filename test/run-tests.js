#!/usr/bin/env node

/**
 * Test runner script for SQL to MongoDB Migration application
 * This script provides various test execution options
 */

const { spawn } = require('child_process');
const path = require('path');

const testTypes = {
  unit: 'test/unit/**/*.test.js',
  integration: 'test/integration/**/*.test.js',
  api: 'test/api/**/*.test.js',
  e2e: 'test/integration/e2e/**/*.test.js',
  all: 'test/**/*.test.js'
};

function runTests(pattern, options = {}) {
  const args = [
    'mocha',
    pattern,
    '--timeout', '10000',
    '--recursive'
  ];

  if (options.watch) {
    args.push('--watch');
  }

  if (options.coverage) {
    args.unshift('nyc');
  }

  if (options.reporter) {
    args.push('--reporter', options.reporter);
  }

  console.log(`Running tests: ${pattern}`);
  console.log(`Command: npx ${args.join(' ')}\n`);

  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ Tests completed successfully!');
    } else {
      console.log(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });

  child.on('error', (error) => {
    console.error('❌ Failed to start test process:', error);
    process.exit(1);
  });
}

function showHelp() {
  console.log(`
SQL to MongoDB Migration Test Runner

Usage: node test/run-tests.js [type] [options]

Test Types:
  unit        Run unit tests only
  integration Run integration tests only
  api         Run API tests only
  e2e         Run end-to-end tests only
  all         Run all tests (default)

Options:
  --watch     Watch for file changes and re-run tests
  --coverage  Run tests with coverage report
  --reporter  Specify test reporter (spec, json, html, etc.)
  --help      Show this help message

Examples:
  node test/run-tests.js unit
  node test/run-tests.js integration --watch
  node test/run-tests.js all --coverage
  node test/run-tests.js api --reporter json
`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const testType = args.find(arg => testTypes[arg]) || 'all';
  const options = {
    watch: args.includes('--watch'),
    coverage: args.includes('--coverage'),
    reporter: args.includes('--reporter') ? args[args.indexOf('--reporter') + 1] : null
  };

  const pattern = testTypes[testType];
  
  if (!pattern) {
    console.error(`❌ Unknown test type: ${testType}`);
    console.error('Available types:', Object.keys(testTypes).join(', '));
    process.exit(1);
  }

  runTests(pattern, options);
}

if (require.main === module) {
  main();
}

module.exports = { runTests, testTypes };