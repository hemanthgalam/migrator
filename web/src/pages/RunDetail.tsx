import clsx from 'clsx';
import { AlertTriangle, RotateCw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { runProgress } from '../components/RunsTable';
import { Badge, Button, Card, CardHeader, ErrorBanner, Loading, PageHeader, Progress, StatusBadge, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, fmtDuration, fmtNumber, fmtRelative, runDuration } from '../lib/format';
import { useApi, useNow } from '../lib/hooks';
import { useLive } from '../lib/live';
import type { LogEntry, Run } from '../lib/types';

const LEVEL: Record<LogEntry['level'], string> = {
  info: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
  success: 'text-emerald-400',
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-3">{label}</p>
      <p className="mt-1 text-lg font-semibold text-1 tabular-nums">{value}</p>
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(500);
  const run = useApi<Run>(`/runs/${id}`);
  const logs = useApi<LogEntry[]>(`/runs/${id}/logs`);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useLive((e) => {
    if (e.type === 'run' && e.data.id === id) run.setData(e.data);
    if (e.type === 'log' && e.data.runId === id) {
      logs.setData((list) => (list && !list.some((l) => l.id === e.data.id) ? [...list, e.data] : list));
    }
  });

  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.data, follow]);

  if (run.error) return <ErrorBanner error={run.error} />;
  const r = run.data;
  if (!r) return <Loading />;
  const p = runProgress(r);
  const isActive = ['queued', 'retrying', 'running'].includes(r.status);

  async function cancel() {
    setBusy(true);
    try { run.setData(await api.post<Run>(`/runs/${id}/cancel`)); } catch (e) { toast({ tone: 'error', title: 'Cancel failed', description: (e as Error).message }); }
    setBusy(false);
  }

  async function retry() {
    setBusy(true);
    try {
      const next = await api.post<Run>(`/runs/${id}/retry`);
      toast({ tone: 'info', title: 'Retry queued' });
      navigate(`/runs/${next.id}`);
    } catch (e) {
      toast({ tone: 'error', title: 'Retry failed', description: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/runs" className="hover:text-brand-600">Runs</Link> / <span className="font-mono">{r.id}</span></>}
        title={<span className="flex flex-wrap items-center gap-3"><Link to={`/pipelines/${r.pipelineId}`} className="hover:text-brand-600">{r.pipelineName}</Link><StatusBadge status={r.status} /></span>}
        description={`Triggered ${r.trigger} · queued ${fmtDateTime(r.queuedAt)}`}
        actions={<>
          {isActive && <Button variant="danger" icon={<Square className="size-3.5" />} loading={busy} onClick={cancel}>Cancel run</Button>}
          {(r.status === 'failed' || r.status === 'cancelled') && <Button variant="primary" icon={<RotateCw className="size-4" />} loading={busy} onClick={retry}>Retry</Button>}
        </>}
      />

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-1">
            {r.status === 'retrying' ? `Waiting to retry ${fmtRelative(r.nextAttemptAt, now)}` : r.status === 'queued' ? 'Waiting for a free worker' : r.status === 'running' ? 'Processing' : 'Finished'}
          </span>
          <span className="text-2 tabular-nums" data-testid="run-percent">{p == null ? '' : `${Math.floor(p * 100)}%`}</span>
        </div>
        <Progress value={p} active={r.status === 'running'} tone={r.status === 'failed' ? 'bad' : r.status === 'succeeded' ? 'good' : 'brand'} />
        <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rows read" value={<span data-testid="rows-read">{fmtNumber(r.rowsRead)}</span>} />
          <Stat label="Filtered out" value={fmtNumber(r.rowsFiltered)} />
          <Stat label="Rows written" value={<span data-testid="rows-written">{fmtNumber(r.rowsWritten)}</span>} />
          <Stat label="Batches" value={fmtNumber(r.batches)} />
          <Stat label="Attempt" value={<span data-testid="run-attempt">{r.attempt} / {r.maxAttempts}</span>} />
          <Stat label="Duration" value={fmtDuration(runDuration(r, now))} />
        </div>
      </Card>

      {r.error && (
        <div className={clsx('mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm', r.status === 'retrying'
          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200')} data-testid="run-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{r.status === 'retrying' ? 'Attempt failed, retry scheduled' : 'Run failed'}</p>
            <p className="mt-0.5 font-mono text-xs">{r.error}</p>
          </div>
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Logs"
          description="Streamed live from the worker"
          actions={<label className="flex items-center gap-2 text-xs text-2"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-brand-600" />Follow</label>}
        />
        <div ref={logRef} className="max-h-[28rem] overflow-auto bg-[#0b1020] px-5 py-4 font-mono text-xs leading-6" data-testid="run-logs">
          {(logs.data || []).map((l) => (
            <div key={l.id} className="flex gap-3">
              <span className="shrink-0 text-slate-500">{new Date(l.ts).toLocaleTimeString('en-US', { hour12: false })}</span>
              <span className={clsx('w-14 shrink-0 uppercase', LEVEL[l.level])}>{l.level}</span>
              <span className="break-all text-slate-200">{l.message}</span>
            </div>
          ))}
          {isActive && <div className="mt-1 h-4 w-2 animate-pulse bg-slate-400" />}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-3">
        <Badge>started {fmtDateTime(r.startedAt)}</Badge>
        <Badge>finished {fmtDateTime(r.finishedAt)}</Badge>
      </div>
    </>
  );
}
