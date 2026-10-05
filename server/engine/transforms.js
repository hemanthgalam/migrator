const crypto = require('crypto');

// Declarative, row-level transform steps. Each step is plain JSON so pipelines
// can be stored, versioned and edited in the UI.

const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'exists', 'notExists'];
const CAST_TYPES = ['string', 'number', 'integer', 'boolean', 'date'];
const FORMAT_FNS = ['upper', 'lower', 'trim', 'title'];
const MASK_STRATEGIES = ['redact', 'hash', 'email'];

const STEP_TYPES = {
  select: { label: 'Select fields', required: ['fields'] },
  drop: { label: 'Drop fields', required: ['fields'] },
  rename: { label: 'Rename fields', required: ['mapping'] },
  filter: { label: 'Filter rows', required: ['field', 'op'] },
  cast: { label: 'Cast type', required: ['field', 'to'] },
  format: { label: 'Format text', required: ['field', 'fn'] },
  derive: { label: 'Derive field', required: ['field', 'template'] },
  default: { label: 'Fill nulls', required: ['field'] },
  mask: { label: 'Mask PII', required: ['field', 'strategy'] },
  dedupe: { label: 'Deduplicate', required: ['keys'] },
};

function validateTransforms(steps) {
  const errors = [];
  if (!Array.isArray(steps)) return ['transforms must be an array'];
  steps.forEach((step, i) => {
    const where = `Step ${i + 1}`;
    const spec = step && STEP_TYPES[step.type];
    if (!spec) return errors.push(`${where}: unknown transform type "${step?.type}"`);
    for (const key of spec.required) {
      const v = step[key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
        errors.push(`${where} (${spec.label}): "${key}" is required`);
      }
    }
    if (step.type === 'filter' && step.op && !FILTER_OPS.includes(step.op)) errors.push(`${where}: unknown operator "${step.op}"`);
    if (step.type === 'cast' && step.to && !CAST_TYPES.includes(step.to)) errors.push(`${where}: unknown type "${step.to}"`);
    if (step.type === 'format' && step.fn && !FORMAT_FNS.includes(step.fn)) errors.push(`${where}: unknown format "${step.fn}"`);
    if (step.type === 'mask' && step.strategy && !MASK_STRATEGIES.includes(step.strategy)) errors.push(`${where}: unknown strategy "${step.strategy}"`);
    if (step.type === 'rename' && step.mapping && typeof step.mapping !== 'object') errors.push(`${where}: mapping must be an object`);
  });
  return errors;
}

const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));

function coerceComparable(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return [na, nb];
  return [String(a ?? ''), String(b ?? '')];
}

function matches(row, { field, op, value }) {
  const v = row[field];
  switch (op) {
    case 'exists': return v !== undefined && v !== null && v !== '';
    case 'notExists': return v === undefined || v === null || v === '';
    case 'contains': return String(v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'startsWith': return String(v ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'in': return toList(value).map(String).includes(String(v));
    default: {
      const [a, b] = coerceComparable(v, value);
      if (op === 'eq') return a === b;
      if (op === 'neq') return a !== b;
      if (op === 'gt') return a > b;
      if (op === 'gte') return a >= b;
      if (op === 'lt') return a < b;
      if (op === 'lte') return a <= b;
      return true;
    }
  }
}

function cast(value, to) {
  if (value === null || value === undefined || value === '') return null;
  switch (to) {
    case 'string': return typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'number': { const n = Number(value); return Number.isNaN(n) ? null : n; }
    case 'integer': { const n = parseInt(value, 10); return Number.isNaN(n) ? null : n; }
    case 'boolean': return ['true', '1', 'yes', 'y', 't'].includes(String(value).toLowerCase());
    case 'date': { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
    default: return value;
  }
}

function format(value, fn) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  if (fn === 'upper') return s.toUpperCase();
  if (fn === 'lower') return s.toLowerCase();
  if (fn === 'trim') return s.trim();
  if (fn === 'title') return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return s;
}

function mask(value, strategy) {
  if (value === null || value === undefined || value === '') return value;
  const s = String(value);
  if (strategy === 'hash') return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  if (strategy === 'email') {
    const [user, domain] = s.split('@');
    return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
  }
  return '[REDACTED]';
}

const renderTemplate = (template, row) =>
  String(template).replace(/\{([^}]+)\}/g, (_, key) => {
    const v = row[key.trim()];
    return v === null || v === undefined ? '' : String(v);
  });

/**
 * Compile a list of steps into a stateful batch function. State (e.g. dedupe
 * keys) lives for the whole run, so call compile() once per run.
 * Returns (rows) => { rows, filtered }.
 */
function compileTransforms(steps = []) {
  const seen = steps.map((s) => (s.type === 'dedupe' ? new Set() : null));
  return function apply(rows) {
    let out = rows;
    let filtered = 0;
    steps.forEach((step, i) => {
      const before = out.length;
      switch (step.type) {
        case 'select': {
          const fields = toList(step.fields);
          out = out.map((r) => Object.fromEntries(fields.map((f) => [f, r[f] ?? null])));
          break;
        }
        case 'drop': {
          const fields = new Set(toList(step.fields));
          out = out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !fields.has(k))));
          break;
        }
        case 'rename':
          out = out.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [step.mapping[k] || k, v])));
          break;
        case 'filter':
          out = out.filter((r) => matches(r, step));
          break;
        case 'cast':
          out = out.map((r) => (step.field in r ? { ...r, [step.field]: cast(r[step.field], step.to) } : r));
          break;
        case 'format':
          out = out.map((r) => (step.field in r ? { ...r, [step.field]: format(r[step.field], step.fn) } : r));
          break;
        case 'derive':
          out = out.map((r) => ({ ...r, [step.field]: renderTemplate(step.template, r) }));
          break;
        case 'default':
          out = out.map((r) => (r[step.field] === null || r[step.field] === undefined || r[step.field] === ''
            ? { ...r, [step.field]: step.value ?? null } : r));
          break;
        case 'mask':
          out = out.map((r) => (step.field in r ? { ...r, [step.field]: mask(r[step.field], step.strategy) } : r));
          break;
        case 'dedupe': {
          const keys = toList(step.keys);
          out = out.filter((r) => {
            const k = JSON.stringify(keys.map((key) => r[key]));
            if (seen[i].has(k)) return false;
            seen[i].add(k);
            return true;
          });
          break;
        }
        default:
          throw new Error(`Unknown transform type "${step.type}"`);
      }
      filtered += before - out.length;
    });
    return { rows: out, filtered };
  };
}

module.exports = {
  STEP_TYPES, FILTER_OPS, CAST_TYPES, FORMAT_FNS, MASK_STRATEGIES,
  validateTransforms, compileTransforms,
};
