import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { TransformEditor } from '../components/TransformEditor';
import { Button, Card, ConnectorIcon, ErrorBanner, Field, Input, Loading, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { fmtInterval } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useMeta } from '../lib/meta';
import type { Connection, Pipeline, Preview, Run, Stream, TransformStep } from '../lib/types';

type Form = {
  name: string; description: string; sourceConnectionId: string; sourceStream: string; destConnectionId: string; destTarget: string;
  writeMode: string; upsertKey: string; transforms: TransformStep[]; batchSize: number; maxRetries: number; scheduleIntervalSec: number | null;
};

const EMPTY: Form = {
  name: '', description: '', sourceConnectionId: '', sourceStream: '', destConnectionId: '', destTarget: '', writeMode: 'append',
  upsertKey: '', transforms: [], batchSize: 500, maxRetries: 2, scheduleIntervalSec: null,
};

const STEPS = ['Source', 'Transform', 'Destination', 'Schedule & review'];
const SCHEDULES = [null, 60, 300, 900, 3600, 21600, 86400];

function Stepper({ step, setStep, canVisit }: { step: number; setStep: (n: number) => void; canVisit: (n: number) => boolean }) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pipeline builder steps">
      {STEPS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            disabled={!canVisit(i)}
            onClick={() => setStep(i)}
            aria-current={step === i ? 'step' : undefined}
            className={clsx('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              step === i ? 'border-brand-500 bg-brand-50 dark:bg-brand-600/10' : 'border-default surface hover:border-brand-500/60')}
          >
            <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
              i < step ? 'bg-brand-600 text-white' : step === i ? 'bg-brand-600 text-white' : 'surface-2 text-2')}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={clsx('font-medium', step === i ? 'text-brand-700 dark:text-indigo-300' : 'text-1')}>{label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function PipelineEditor() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const connections = useApi<Connection[]>('/connections');
  const [form, setForm] = useState<Form | null>(editing ? null : EMPTY);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<{ input: Preview; output: Preview; filtered: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'run'>(null);
  const streams = useApi<Stream[]>(form?.sourceConnectionId ? `/connections/${form.sourceConnectionId}/streams` : null);

  useEffect(() => {
    if (!editing) return;
    api.get<Pipeline>(`/pipelines/${id}`).then((p) => setForm({
      ...EMPTY, ...p, upsertKey: p.upsertKey || '', description: p.description || '',
    })).catch((e) => setError(e.message));
  }, [editing, id]);

  if (!form || !connections.data) return error ? <ErrorBanner error={error} /> : <Loading />;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));
  const connectorOf = (cid: string) => meta.connectors.find((c) => c.type === connections.data!.find((x) => x.id === cid)?.type);
  const sources = connections.data.filter((c) => meta.connectors.find((m) => m.type === c.type)?.roles.includes('source'));
  const dests = connections.data.filter((c) => meta.connectors.find((m) => m.type === c.type)?.roles.includes('destination'));
  const destConnector = connectorOf(form.destConnectionId);
  const writeModes = destConnector?.writeModes ?? ['append'];
  const columns = preview?.input.columns ?? [];
  const outColumns = preview?.output.columns ?? columns;

  const valid = [
    !!form.sourceConnectionId && !!form.sourceStream,
    true,
    !!form.destConnectionId && !!form.destTarget && (form.writeMode !== 'upsert' || !!form.upsertKey),
    !!form.name.trim(),
  ];
  const canVisit = (n: number) => valid.slice(0, n).every(Boolean);

  async function runPreview() {
    if (!form!.sourceConnectionId || !form!.sourceStream) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(await api.post('/pipelines/preview', { sourceConnectionId: form!.sourceConnectionId, sourceStream: form!.sourceStream, transforms: form!.transforms, limit: 25 }));
    } catch (e) {
      setPreviewError((e as Error).message);
    }
    setPreviewing(false);
  }

  function go(n: number) {
    setStep(n);
    if (n === 1 && !preview) runPreview();
    if (n === 2 && !form!.destTarget) set({ destTarget: form!.sourceStream.replace(/\.(csv|jsonl)$/, '').replace(/[^\w]+/g, '_') });
    if (n === 3 && !form!.name) {
      const src = connections.data!.find((c) => c.id === form!.sourceConnectionId);
      set({ name: `${src?.name ?? 'Source'} ${form!.sourceStream} sync` });
    }
  }

  async function save(andRun: boolean) {
    setSaving(andRun ? 'run' : 'save');
    setError(null);
    const body = { ...form, upsertKey: form!.upsertKey || null };
    try {
      const saved = editing ? await api.put<Pipeline>(`/pipelines/${id}`, body) : await api.post<Pipeline>('/pipelines', body);
      toast({ tone: 'success', title: editing ? 'Pipeline saved' : 'Pipeline created', description: saved.name });
      if (andRun) {
        const run = await api.post<Run>(`/pipelines/${saved.id}/runs`);
        navigate(`/runs/${run.id}`);
      } else {
        navigate(`/pipelines/${saved.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiError && e.details?.length ? e.details.join(' · ') : (e as Error).message);
      setSaving(null);
    }
  }

  const ConnectionPicker = ({ list, value, onPick, label }: { list: Connection[]; value: string; onPick: (id: string) => void; label: string }) => (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={label}>
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onPick(c.id)}
          className={clsx('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors', value === c.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-600/10' : 'border-default surface hover:border-brand-500/60')}
        >
          <ConnectorIcon type={c.type} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-1">{c.name}</span>
            <span className="block text-xs text-2">{meta.connectors.find((m) => m.type === c.type)?.label}</span>
          </span>
        </button>
      ))}
      {list.length === 0 && <p className="text-sm text-2">No compatible connections. <Link className="text-brand-600 underline" to="/connections">Add one</Link> first.</p>}
    </div>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/pipelines" className="hover:text-brand-600">Pipelines</Link> / {editing ? 'Edit' : 'New'}</>}
        title={editing ? `Edit ${form.name}` : 'New pipeline'}
        description="Extract, transform and load in four steps. Nothing runs until you start it."
      />
      <Stepper step={step} setStep={go} canVisit={canVisit} />

      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-1">Where does the data come from?</h2>
              <p className="mb-4 text-sm text-2">Choose a source connection, then the table, dataset or file to extract.</p>
              <ConnectionPicker list={sources} value={form.sourceConnectionId} label="Source connection" onPick={(cid) => { set({ sourceConnectionId: cid, sourceStream: '' }); setPreview(null); }} />
            </div>
            {form.sourceConnectionId && (
              <Field label="Stream" htmlFor="source-stream" help="Tables, collections, datasets or files exposed by the source.">
                {streams.loading ? <div className="flex h-9 items-center"><Spinner className="size-4" /></div> : (
                  <Select id="source-stream" value={form.sourceStream} onChange={(e) => { set({ sourceStream: e.target.value }); setPreview(null); }}>
                    <option value="">Select a stream…</option>
                    {(streams.data || []).map((s) => <option key={s.name} value={s.name}>{s.name}{s.description ? ` — ${s.description}` : ''}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <ErrorBanner error={streams.error} />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <h2 className="mb-1 text-[15px] font-semibold text-1">Transform rows in flight</h2>
              <p className="mb-4 text-sm text-2">Steps run in order on every batch. Preview them against live sample rows.</p>
              <TransformEditor steps={form.transforms} columns={columns} onChange={(transforms) => set({ transforms })} />
            </div>
            <div className="min-w-0 xl:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-1">Preview</p>
                  <p className="text-xs text-2" data-testid="preview-summary">
                    {preview ? `${preview.input.rows.length} sample rows in → ${preview.output.rows.length} out${preview.filtered ? ` (${preview.filtered} filtered)` : ''}` : 'Sample of the first rows'}
                  </p>
                </div>
                <Button size="sm" icon={<RefreshCw className={clsx('size-3.5', previewing && 'animate-spin')} />} onClick={runPreview}>Run preview</Button>
              </div>
              <ErrorBanner error={previewError} />
              {preview ? <DataTable data={preview.output} testId="transform-preview" /> : previewing ? <Loading /> : null}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-1">Where should it land?</h2>
              <p className="mb-4 text-sm text-2">Pick a destination and the table, collection or file to write.</p>
              <ConnectionPicker list={dests} value={form.destConnectionId} label="Destination connection" onPick={(cid) => {
                const modes = connectorOf(cid)?.writeModes ?? ['append'];
                set({ destConnectionId: cid, writeMode: modes.includes(form.writeMode) ? form.writeMode : modes[0] });
              }} />
            </div>
            {form.destConnectionId && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Target" htmlFor="dest-target" help={destConnector?.type === 'filesystem' ? 'File name; the extension is added automatically.' : 'Existing table or collection name.'} required>
                  <Input id="dest-target" className="font-mono text-[13px]" value={form.destTarget} onChange={(e) => set({ destTarget: e.target.value })} />
                </Field>
                <Field label="Write mode" htmlFor="write-mode" help={form.writeMode === 'overwrite' ? 'Replaces the target atomically when the run succeeds.' : form.writeMode === 'upsert' ? 'Updates rows that match the key, inserts the rest.' : 'Adds rows to what is already there.'}>
                  <Select id="write-mode" value={form.writeMode} onChange={(e) => set({ writeMode: e.target.value })}>
                    {writeModes.map((m) => <option key={m}>{m}</option>)}
                  </Select>
                </Field>
                {form.writeMode === 'upsert' && (
                  <Field label="Upsert key" htmlFor="upsert-key" required>
                    <Input id="upsert-key" className="font-mono text-[13px]" list="out-cols" value={form.upsertKey} onChange={(e) => set({ upsertKey: e.target.value })} />
                    <datalist id="out-cols">{outColumns.map((c) => <option key={c} value={c} />)}</datalist>
                  </Field>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Pipeline name" htmlFor="pipeline-name" required>
                <Input id="pipeline-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Description" htmlFor="pipeline-description">
                <Textarea id="pipeline-description" className="font-sans text-sm" value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Schedule" htmlFor="schedule">
                  <Select id="schedule" value={form.scheduleIntervalSec ?? ''} onChange={(e) => set({ scheduleIntervalSec: e.target.value ? Number(e.target.value) : null })}>
                    {SCHEDULES.map((s) => <option key={s ?? 'manual'} value={s ?? ''}>{fmtInterval(s)}</option>)}
                  </Select>
                </Field>
                <Field label="Batch size" htmlFor="batch-size">
                  <Input id="batch-size" type="number" min={1} value={form.batchSize} onChange={(e) => set({ batchSize: Number(e.target.value) })} />
                </Field>
                <Field label="Retries" htmlFor="retries">
                  <Input id="retries" type="number" min={0} max={10} value={form.maxRetries} onChange={(e) => set({ maxRetries: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
            <div className="rounded-xl surface-2 p-5 text-sm">
              <p className="mb-3 font-semibold text-1">Summary</p>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
                <dt className="text-2">Extract</dt><dd className="font-mono text-xs text-1">{connections.data.find((c) => c.id === form.sourceConnectionId)?.name} / {form.sourceStream}</dd>
                <dt className="text-2">Transform</dt><dd className="text-1">{form.transforms.length ? form.transforms.map((t) => meta.transforms.types[t.type]?.label).join(' → ') : 'None'}</dd>
                <dt className="text-2">Load</dt><dd className="font-mono text-xs text-1">{connections.data.find((c) => c.id === form.destConnectionId)?.name} / {form.destTarget} ({form.writeMode})</dd>
                <dt className="text-2">Runs</dt><dd className="text-1">{fmtInterval(form.scheduleIntervalSec)}, {form.maxRetries} retries, batches of {form.batchSize}</dd>
              </dl>
            </div>
          </div>
        )}

        {error && <div className="mt-5"><ErrorBanner error={error} /></div>}

        <div className="mt-6 flex items-center justify-between border-t border-default pt-5">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0} onClick={() => go(step - 1)}>Back</Button>
          {step < 3 ? (
            <Button variant="primary" disabled={!valid[step]} onClick={() => go(step + 1)}>Continue <ArrowRight className="size-4" /></Button>
          ) : (
            <div className="flex gap-2">
              <Button loading={saving === 'save'} disabled={!valid[3] || !!saving} onClick={() => save(false)}>{editing ? 'Save changes' : 'Create pipeline'}</Button>
              <Button variant="primary" icon={<Play className="size-4" />} loading={saving === 'run'} disabled={!valid[3] || !!saving} onClick={() => save(true)}>
                {editing ? 'Save & run' : 'Create & run'}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
