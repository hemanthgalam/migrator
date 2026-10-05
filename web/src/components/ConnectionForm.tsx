import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useMeta } from '../lib/meta';
import type { Connection, ConnectorMeta } from '../lib/types';
import { Badge, Button, ConnectorIcon, ErrorBanner, Field, Input, Modal, Select, Textarea } from './ui';

function initialValues(c: ConnectorMeta, existing?: Connection) {
  const v: Record<string, string> = {};
  for (const f of c.fields) {
    const cur = existing?.config[f.key];
    v[f.key] = cur !== undefined && cur !== null ? String(cur) : f.default !== undefined ? String(f.default) : '';
  }
  return v;
}

export function ConnectionForm({ open, onClose, onSaved, existing }: {
  open: boolean; onClose: () => void; onSaved: (c: Connection) => void; existing?: Connection;
}) {
  const meta = useMeta();
  const [type, setType] = useState<string | null>(existing?.type ?? null);
  const connector = meta.connectors.find((c) => c.type === type);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(existing?.type ?? null);
    setName(existing?.name ?? '');
    setError(null);
    setTest(null);
  }, [open, existing]);

  useEffect(() => {
    if (connector) setValues(initialValues(connector, existing));
    setTest(null);
  }, [connector, existing]);

  const groups = useMemo(() => {
    const g: Record<string, ConnectorMeta[]> = {};
    for (const c of meta.connectors) (g[c.category] ||= []).push(c);
    return Object.entries(g);
  }, [meta.connectors]);

  const body = () => ({ name: name || connector?.label, type, config: values });

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.post(existing ? `/connections/${existing.id}/test` : '/connections/test', existing ? undefined : body()));
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    }
    setTesting(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = existing
        ? await api.put<Connection>(`/connections/${existing.id}`, body())
        : await api.post<Connection>('/connections', body());
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={existing ? `Edit ${existing.name}` : connector ? `New ${connector.label} connection` : 'Add a connection'}
      description={connector ? connector.description : 'Choose where data comes from or where it lands.'}
      footer={connector ? <>
        {!existing && <Button variant="ghost" className="mr-auto" icon={<ArrowLeft className="size-4" />} onClick={() => setType(null)}>Back</Button>}
        {!existing && <Button icon={<Zap className="size-4" />} loading={testing} onClick={runTest}>Test connection</Button>}
        {existing && <Button icon={<Zap className="size-4" />} loading={testing} onClick={runTest}>Test saved settings</Button>}
        <Button variant="primary" loading={saving} onClick={save}>{existing ? 'Save changes' : 'Create connection'}</Button>
      </> : undefined}
    >
      {!connector ? (
        <div className="space-y-5">
          {groups.map(([category, list]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-medium tracking-wide text-3 uppercase">{category}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => setType(c.type)}
                    className="flex items-start gap-3 rounded-xl border border-default p-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-600/10"
                  >
                    <ConnectorIcon type={c.type} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-1">{c.label}</span>
                      <span className="mt-0.5 block text-xs text-2">{c.roles.map((r) => (r === 'source' ? 'Source' : 'Destination')).join(' · ')}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="flex gap-1.5">{connector.roles.map((r) => <Badge key={r} tone="brand">{r}</Badge>)}</div>
          <Field label="Connection name" htmlFor="conn-name" required>
            <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Production ${connector.label}`} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {connector.fields.map((f) => (
              <div key={f.key} className={clsx(f.type === 'textarea' || f.key === 'url' || f.key === 'uri' ? 'sm:col-span-2' : '')}>
                <Field label={f.label} htmlFor={`f-${f.key}`} help={f.help} required={f.required}>
                  {f.type === 'select' ? (
                    <Select id={`f-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                      {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : f.type === 'textarea' ? (
                    <Textarea id={`f-${f.key}`} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                  ) : (
                    <Input
                      id={`f-${f.key}`}
                      type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      value={values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      autoComplete="off"
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            ))}
          </div>
          {test && (
            <div data-testid="connection-test-result" className={clsx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm', test.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200')}>
              {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              {test.message}
            </div>
          )}
          <ErrorBanner error={error} />
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
