const sample = require('./sample');
const filesystem = require('./filesystem');
const http = require('./http');
const { postgres, mysql, mssql } = require('./sql');
const mongodb = require('./mongo');

const CONNECTORS = Object.fromEntries([sample, filesystem, http, postgres, mysql, mssql, mongodb].map((c) => [c.type, c]));

const MASK = '••••••••';

function getConnector(type) {
  const c = CONNECTORS[type];
  if (!c) throw new Error(`Unknown connector type "${type}"`);
  return c;
}

// Public description of each connector, used by the UI to render forms.
function describeConnectors() {
  return Object.values(CONNECTORS).map(({ type, label, category, description, roles, fields, writeModes }) => ({
    type, label, category, description, roles, fields, writeModes: writeModes || [],
  }));
}

function normalizeConfig(type, input = {}, previous = {}) {
  const connector = getConnector(type);
  const config = {};
  const missing = [];
  for (const f of connector.fields) {
    let v = input[f.key];
    if (f.secret && v === MASK) v = previous[f.key];
    if (v === undefined || v === '') v = f.default;
    if (f.type === 'number' && v !== undefined && v !== null && v !== '') v = Number(v);
    if (f.required && (v === undefined || v === null || v === '')) missing.push(f.label);
    if (v !== undefined) config[f.key] = v;
  }
  return { config, missing };
}

function redactConfig(type, config) {
  const connector = CONNECTORS[type];
  if (!connector) return config;
  const out = { ...config };
  for (const f of connector.fields) if (f.secret && out[f.key]) out[f.key] = MASK;
  return out;
}

module.exports = { CONNECTORS, getConnector, describeConnectors, normalizeConfig, redactConfig, MASK };
