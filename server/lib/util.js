const crypto = require('crypto');

const newId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });

function abortError() {
  const err = new Error('Run was cancelled');
  err.name = 'AbortError';
  return err;
}

// Async route wrapper so thrown errors reach the error middleware.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { newId, now, HttpError, sleep, abortError, route };
