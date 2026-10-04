import { Download, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { Flow } from '../components/Flow';
import { RunsTable } from '../components/RunsTable';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBanner, Loading, Modal, PageHeader, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtInterval } from '../lib/format';
import { useApi } from '../lib/hooks';
import { upsertRun, useLive } from '../lib/live';
import { useMeta } from '../lib/meta';
import type { Connection, Pipeline, Preview, Run, TransformStep } from '../lib/types';

export function describeStep(step: TransformStep): string {
  const s = step as Record<string, any>;
  switch (step.type) {
    case 'select': return `Keep ${[].concat(s.fields).join(', ')}`;
    case 'drop': return `Drop ${[].concat(s.fields).join(', ')}`;
    case 'rename': return Object.entries(s.mapping || {}).map(([a, b]) => `${a} → ${b}`).join(', ');
    case 'filter': return `${s.field} ${s.op}${['exists', 'notExists'].includes(s.op) ? '' : ` ${s.value}`}`;
    case 'cast': return `${s.field} as ${s.to}`;
    case 'format': return `${s.fn}(${s.field})`;
    case 'derive': return `${s.field} = "${s.template}"`;
    case 'default': return `${s.field} ← ${s.value ?? 'null'} when empty`;
    case 'mask': return `${s.strategy} ${s.field}`;
    case 'dedupe': return `unique by ${[].concat(s.keys).join(', ')}`;
    default: return '';
  }
}

export default function PipelineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const pipeline = useApi<Pipeline>(`/pipelines/${id}`);
  const connections = useApi<Connection[]>('/connections');
  const runs = useApi<Run[]>(`/runs?pipelineId=${id}&limit=25`);
  const [output, setOutput] = useState<Preview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useLive((e) => { if (e.type === 'run' && e.data.pipelineId === id) runs.setData((list) => upsertRun(list, e.data)); });

  if (pipeline.error) return <ErrorBanner error={pipeline.error} />;
  const p = pipeline.data;
  if (!p || !connections.data) return <Loading />;
  const dest = connections.data.find((c) => c.id === p.destConnectionId);
  const fileOutput = dest?.type === 'filesystem' ? `${p.destTarget}${/\.(csv|jsonl)$/.test(p.destTarget) ? '' : `.${dest.config.format || 'csv'}`}` : null;

  async function runNow() {
    setBusy(true);
    try {
      const run = await api.post<Run>(`/pipelines/${id}/runs`);
      toast({ tone: 'info', title: 'Run queued', description: p!.name });
      navigate(`/runs/${run.id}`);
    } catch (e) {
      toast({ tone: 'error', title: 'Could not start run', description: (e as Error).message });
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.del(`/pipelines/${id}`);
      toast({ tone: 'success', title: 'Pipeline deleted' });
      navigate('/pipelines');
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: (e as Error).message });
    }
  }

  async function loadOutput() {
    try {
      setOutput(await api.get<Preview>(`/connections/${dest!.id}/preview?stream=${encodeURIComponent(fileOutput!)}&limit=50`));
    } catch (e) {
      toast({ tone: 'error', title: 'No output yet', description: (e as Error).message });
    }
  }

  const destMeta = meta.connectors.find((c) => c.type === dest?.type);

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/pipelines" className="hover:text-brand-600">Pipelines</Link> / {p.name}</>}
        title={p.name}
        description={p.description || undefined}
        actions={<>
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>
          <Link to={`/pipelines/${id}/edit`}><Button icon={<Pencil className="size-4" />}>Edit</Button></Link>
          <Button variant="primary" icon={<Play className="size-4" />} loading={busy} onClick={runNow}>Run now</Button>
        </>}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Data flow" />
          <div className="p-5">
            <Flow pipeline={p} connections={connections.data} />
            <ol className="mt-5 space-y-2" data-testid="transform-steps">
              {p.transforms.length === 0 && <li className="text-sm text-3">No transforms: rows are loaded as extracted.</li>}
              {p.transforms.map((t, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2 text-sm">
                  <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
                  <span className="font-medium text-1">{meta.transforms.types[t.type]?.label ?? t.type}</span>
                  <span className="truncate font-mono text-xs text-2">{describeStep(t)}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
        <Card>
          <CardHeader title="Configuration" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
            <dt className="text-2">Schedule</dt><dd className="text-1">{fmtInterval(p.scheduleIntervalSec)}{p.scheduleIntervalSec && !p.enabled ? ' (paused)' : ''}</dd>
            <dt className="text-2">Write mode</dt><dd><Badge tone="brand">{p.writeMode}</Badge>{p.upsertKey && <span className="ml-1 font-mono text-xs text-2">on {p.upsertKey}</span>}</dd>
            <dt className="text-2">Batch size</dt><dd className="text-1 tabular-nums">{p.batchSize.toLocaleString()}</dd>
            <dt className="text-2">Retries</dt><dd className="text-1">{p.maxRetries} with backoff</dd>
            <dt className="text-2">Destination</dt><dd className="text-1">{destMeta?.label}</dd>
          </dl>
          {fileOutput && (
            <div className="flex gap-2 border-t border-default px-5 py-4">
              <Button size="sm" onClick={loadOutput}>Preview output</Button>
              <a href={`/api/connections/${dest!.id}/files/${encodeURIComponent(fileOutput)}`}><Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>Download</Button></a>
            </div>
          )}
        </Card>
      </div>

      {output && (
        <Card className="mt-6">
          <CardHeader title="Output preview" description={`First ${output.rows.length} rows of ${fileOutput}`} />
          <div className="p-5"><DataTable data={output} testId="output-preview" /></div>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Run history" />
        {!runs.data ? <Loading /> : runs.data.length === 0 ? (
          <EmptyState icon={<Play className="size-5" />} title="No runs yet" description="Runs are queued and executed by background workers." action={<Button variant="primary" onClick={runNow}>Run now</Button>} />
        ) : <RunsTable runs={runs.data} showPipeline={false} />}
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete pipeline?"
        description={`"${p.name}" and its run history will be removed. Active runs are cancelled.`}
        footer={<>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button variant="danger" onClick={remove}>Delete pipeline</Button>
        </>}
      >
        <p className="text-sm text-2">Output already written to the destination is not touched.</p>
      </Modal>
    </>
  );
}
