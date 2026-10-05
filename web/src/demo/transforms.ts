// Browser port of server/engine/transforms.js for the static demo build.
// Keep the two in step; the hash mask uses FNV-1a here instead of SHA-256.

type Row = Record<string, unknown>;
type Step = { type: string } & Record<string, any>;

export const STEP_TYPES: Record<string, { label: string; required: string[] }> = {
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
export const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'exists', 'notExists'];
export const CAST_TYPES = ['string', 'number', 'integer', 'boolean', 'date'];
export const FORMAT_FNS = ['upper', 'lower', 'trim', 'title'];
export const MASK_STRATEGIES = ['redact', 'hash', 'email'];

export function validateTransforms(steps: Step[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(steps)) return ['transforms must be an array'];
  steps.forEach((step, i) => {
    const where = `Step ${i + 1}`;
    const spec = step && STEP_TYPES[step.type];
    if (!spec) { errors.push(`${where}: unknown transform type "${step?.type}"`); return; }
    for (const key of spec.required) {
      const v = step[key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) errors.push(`${where} (${spec.label}): "${key}" is required`);
    }
    if (step.type === 'filter' && step.op && !FILTER_OPS.includes(step.op)) errors.push(`${where}: unknown operator "${step.op}"`);
    if (step.type === 'cast' && step.to && !CAST_TYPES.includes(step.to)) errors.push(`${where}: unknown type "${step.to}"`);
  });
  return errors;
}

const toList = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));

function comparable(a: unknown, b: unknown): [number, number] | [string, string] {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && a != null && b != null && !Number.isNaN(na) && !Number.isNaN(nb)) return [na, nb];
  return [String(a ?? ''), String(b ?? '')];
}

function matches(row: Row, { field, op, value }: Step) {
  const v = row[field];
  switch (op) {
    case 'exists': return v !== undefined && v !== null && v !== '';
    case 'notExists': return v === undefined || v === null || v === '';
    case 'contains': return String(v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'startsWith': return String(v ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'in': return toList(value).map(String).includes(String(v));
    default: {
      const [a, b] = comparable(v, value);
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

function cast(value: unknown, to: string) {
  if (value === null || value === undefined || value === '') return null;
  switch (to) {
    case 'string': return typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'number': { const n = Number(value); return Number.isNaN(n) ? null : n; }
    case 'integer': { const n = parseInt(String(value), 10); return Number.isNaN(n) ? null : n; }
    case 'boolean': return ['true', '1', 'yes', 'y', 't'].includes(String(value).toLowerCase());
    case 'date': { const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
    default: return value;
  }
}

function format(value: unknown, fn: string) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  if (fn === 'upper') return s.toUpperCase();
  if (fn === 'lower') return s.toLowerCase();
  if (fn === 'trim') return s.trim();
  if (fn === 'title') return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return s;
}

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function mask(value: unknown, strategy: string) {
  if (value === null || value === undefined || value === '') return value;
  const s = String(value);
  if (strategy === 'hash') return fnv(s) + fnv(`${s}#`);
  if (strategy === 'email') {
    const [user, domain] = s.split('@');
    return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
  }
  return '[REDACTED]';
}

const renderTemplate = (template: string, row: Row) =>
  String(template).replace(/\{([^}]+)\}/g, (_, key) => {
    const v = row[key.trim()];
    return v === null || v === undefined ? '' : String(v);
  });

export function compileTransforms(steps: Step[] = []) {
  const seen = steps.map((s) => (s.type === 'dedupe' ? new Set<string>() : null));
  return (rows: Row[]) => {
    let out = rows;
    let filtered = 0;
    steps.forEach((step, i) => {
      const before = out.length;
      switch (step.type) {
        case 'select': { const f = toList(step.fields); out = out.map((r) => Object.fromEntries(f.map((k) => [k, r[k] ?? null]))); break; }
        case 'drop': { const f = new Set(toList(step.fields)); out = out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !f.has(k)))); break; }
        case 'rename': out = out.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [step.mapping?.[k] || k, v]))); break;
        case 'filter': out = out.filter((r) => matches(r, step)); break;
        case 'cast': out = out.map((r) => (step.field in r ? { ...r, [step.field]: cast(r[step.field], step.to) } : r)); break;
        case 'format': out = out.map((r) => (step.field in r ? { ...r, [step.field]: format(r[step.field], step.fn) } : r)); break;
        case 'derive': out = out.map((r) => ({ ...r, [step.field]: renderTemplate(step.template, r) })); break;
        case 'default': out = out.map((r) => (r[step.field] === null || r[step.field] === undefined || r[step.field] === '' ? { ...r, [step.field]: step.value ?? null } : r)); break;
        case 'mask': out = out.map((r) => (step.field in r ? { ...r, [step.field]: mask(r[step.field], step.strategy) } : r)); break;
        case 'dedupe': {
          const keys = toList(step.keys);
          out = out.filter((r) => {
            const k = JSON.stringify(keys.map((key) => r[key]));
            if (seen[i]!.has(k)) return false;
            seen[i]!.add(k);
            return true;
          });
          break;
        }
        default: throw new Error(`Unknown transform type "${step.type}"`);
      }
      filtered += before - out.length;
    });
    return { rows: out, filtered };
  };
}
