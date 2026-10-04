import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useMeta } from '../lib/meta';
import type { TransformStep } from '../lib/types';
import { Button, Input, Select } from './ui';

const DEFAULTS: Record<string, TransformStep> = {
  select: { type: 'select', fields: [] },
  drop: { type: 'drop', fields: [] },
  rename: { type: 'rename', mapping: {} },
  filter: { type: 'filter', field: '', op: 'eq', value: '' },
  cast: { type: 'cast', field: '', to: 'number' },
  format: { type: 'format', field: '', fn: 'trim' },
  derive: { type: 'derive', field: '', template: '' },
  default: { type: 'default', field: '', value: '' },
  mask: { type: 'mask', field: '', strategy: 'redact' },
  dedupe: { type: 'dedupe', keys: [] },
};

const OP_LABEL: Record<string, string> = {
  eq: 'equals', neq: 'not equals', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains', startsWith: 'starts with', in: 'is one of', exists: 'is present', notExists: 'is empty',
};

const toList = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
const fromList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function FieldInput({ value, onChange, columns, placeholder = 'field', label }: { value: string; onChange: (v: string) => void; columns: string[]; placeholder?: string; label: string }) {
  const id = `cols-${label.replace(/\W/g, '')}`;
  return (
    <>
      <Input aria-label={label} className="font-mono text-[13px]" list={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{columns.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

function RenameEditor({ mapping, onChange, columns, label }: { mapping: Record<string, string>; onChange: (m: Record<string, string>) => void; columns: string[]; label: string }) {
  const text = Object.entries(mapping).map(([a, b]) => `${a}:${b}`).join(', ');
  const [draft, setDraft] = useState(text);
  return (
    <Input
      aria-label={label}
      className="font-mono text-[13px]"
      value={draft}
      placeholder={`${columns[0] || 'old'}:new_name, other:renamed`}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(Object.fromEntries(fromList(e.target.value).map((pair) => pair.split(':').map((s) => s.trim())).filter((p) => p[0] && p[1])));
      }}
    />
  );
}

export function TransformEditor({ steps, onChange, columns }: { steps: TransformStep[]; onChange: (s: TransformStep[]) => void; columns: string[] }) {
  const meta = useMeta();
  const types = meta.transforms.types;
  const [adding, setAdding] = useState('filter');
  // Stable React keys per step so uncontrolled inputs survive reorders and removals.
  const counter = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < steps.length) keys.current.push(counter.current++);
  if (keys.current.length > steps.length) keys.current = keys.current.slice(0, steps.length);

  const update = (i: number, patch: Record<string, unknown>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = steps.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    const k = keys.current;
    [k[i], k[i + d]] = [k[i + d], k[i]];
    onChange(next);
  };
  const remove = (i: number) => {
    keys.current = keys.current.filter((_, j) => j !== i);
    onChange(steps.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-3">
          No transforms. Rows are loaded exactly as extracted.
        </p>
      )}
      {steps.map((step, i) => {
        const s = step as Record<string, any>;
        const label = `Step ${i + 1}`;
        return (
          <div key={keys.current[i]} className="rounded-xl border border-default surface p-3" data-testid="transform-step">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
              <span className="text-sm font-medium text-1">{types[step.type]?.label ?? step.type}</span>
              <div className="ml-auto flex gap-0.5">
                <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${label} up`} icon={<ArrowUp className="size-3.5" />} />
                <Button type="button" size="sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${label} down`} icon={<ArrowDown className="size-3.5" />} />
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)} aria-label={`Remove ${label}`} icon={<Trash2 className="size-3.5" />} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(step.type === 'select' || step.type === 'drop') && (
                <div className="sm:col-span-3">
                  <Input aria-label={`${label} fields`} className="font-mono text-[13px]" defaultValue={toList(s.fields)} placeholder={columns.slice(0, 3).join(', ') || 'id, name'} onChange={(e) => update(i, { fields: fromList(e.target.value) })} />
                </div>
              )}
              {step.type === 'dedupe' && (
                <div className="sm:col-span-3">
                  <Input aria-label={`${label} keys`} className="font-mono text-[13px]" defaultValue={toList(s.keys)} placeholder="email" onChange={(e) => update(i, { keys: fromList(e.target.value) })} />
                </div>
              )}
              {step.type === 'rename' && (
                <div className="sm:col-span-3"><RenameEditor label={`${label} mapping`} mapping={s.mapping || {}} columns={columns} onChange={(mapping) => update(i, { mapping })} /></div>
              )}
              {step.type === 'filter' && (
                <>
                  <FieldInput label={`${label} field`} value={s.field} columns={columns} onChange={(field) => update(i, { field })} />
                  <Select aria-label={`${label} operator`} value={s.op} onChange={(e) => update(i, { op: e.target.value })}>
                    {meta.transforms.filterOps.map((o) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
                  </Select>
                  {!['exists', 'notExists'].includes(s.op) && (
                    <Input aria-label={`${label} value`} value={s.value ?? ''} placeholder={s.op === 'in' ? 'a, b, c' : 'value'} onChange={(e) => update(i, { value: e.target.value })} />
                  )}
                </>
              )}
              {step.type === 'cast' && (
                <>
                  <FieldInput label={`${label} field`} value={s.field} columns={columns} onChange={(field) => update(i, { field })} />
                  <Select aria-label={`${label} type`} value={s.to} onChange={(e) => update(i, { to: e.target.value })}>
                    {meta.transforms.castTypes.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </>
              )}
              {step.type === 'format' && (
                <>
                  <FieldInput label={`${label} field`} value={s.field} columns={columns} onChange={(field) => update(i, { field })} />
                  <Select aria-label={`${label} format`} value={s.fn} onChange={(e) => update(i, { fn: e.target.value })}>
                    {meta.transforms.formatFns.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </>
              )}
              {step.type === 'mask' && (
                <>
                  <FieldInput label={`${label} field`} value={s.field} columns={columns} onChange={(field) => update(i, { field })} />
                  <Select aria-label={`${label} strategy`} value={s.strategy} onChange={(e) => update(i, { strategy: e.target.value })}>
                    {meta.transforms.maskStrategies.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </>
              )}
              {step.type === 'derive' && (
                <>
                  <FieldInput label={`${label} new field`} value={s.field} columns={[]} placeholder="new_field" onChange={(field) => update(i, { field })} />
                  <div className="sm:col-span-2">
                    <Input aria-label={`${label} template`} className="font-mono text-[13px]" value={s.template} placeholder="{first_name} {last_name}" onChange={(e) => update(i, { template: e.target.value })} />
                  </div>
                </>
              )}
              {step.type === 'default' && (
                <>
                  <FieldInput label={`${label} field`} value={s.field} columns={columns} onChange={(field) => update(i, { field })} />
                  <Input aria-label={`${label} default value`} value={s.value ?? ''} placeholder="fallback value" onChange={(e) => update(i, { value: e.target.value })} />
                </>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Select aria-label="Transform type" className="w-48" value={adding} onChange={(e) => setAdding(e.target.value)}>
          {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Button type="button" icon={<Plus className="size-4" />} onClick={() => onChange([...steps, { ...DEFAULTS[adding] }])}>Add step</Button>
      </div>
    </div>
  );
}
