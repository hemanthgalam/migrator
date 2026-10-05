import { CalendarClock, Play, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flow } from '../components/Flow';
import { Button, Card, EmptyState, ErrorBanner, Loading, PageHeader, StatusBadge, Toggle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtInterval, fmtRelative } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';
import { useLive } from '../lib/live';
import type { Connection, Pipeline, Run } from '../lib/types';

export default function Pipelines() {
  const pipelines = useApi<Pipeline[]>('/pipelines');
  const connections = useApi<Connection[]>('/connections');
  const toast = useToast();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);
  const refresh = useDebounced(pipelines.reload, 400);
  useLive((e) => { if (e.type === 'run') refresh(); });

  async function runNow(p: Pipeline) {
    setStarting(p.id);
    try {
      const run = await api.post<Run>(`/pipelines/${p.id}/runs`);
      toast({ tone: 'info', title: 'Run queued', description: p.name });
      navigate(`/runs/${run.id}`);
    } catch (e) {
      toast({ tone: 'error', title: 'Could not start run', description: (e as Error).message });
    } finally {
      setStarting(null);
    }
  }

  async function setEnabled(p: Pipeline, enabled: boolean) {
    pipelines.setData((list) => list?.map((x) => (x.id === p.id ? { ...x, enabled } : x)));
    await api.patch(`/pipelines/${p.id}`, { enabled }).catch((e) => toast({ tone: 'error', title: 'Update failed', description: e.message }));
  }

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Extract from a source, transform in flight, load into a destination. Runs execute asynchronously on the worker pool."
        actions={<Link to="/pipelines/new"><Button variant="primary" icon={<Plus className="size-4" />}>New pipeline</Button></Link>}
      />
      <ErrorBanner error={pipelines.error} />
      {!pipelines.data || !connections.data ? <Loading /> : pipelines.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Workflow className="size-5" />}
            title="Build your first pipeline"
            description="Pick a source, add transforms like filters, casts and PII masking, and choose where the data lands."
            action={<Link to="/pipelines/new"><Button variant="primary" icon={<Plus className="size-4" />}>New pipeline</Button></Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {pipelines.data.map((p) => (
            <Card key={p.id} className="p-5 transition-shadow hover:shadow-md" data-testid="pipeline-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <Link to={`/pipelines/${p.id}`} className="text-base font-semibold text-1 hover:text-brand-600">{p.name}</Link>
                    {p.lastRun && <StatusBadge status={p.lastRun.status} />}
                  </div>
                  {p.description && <p className="mt-1 text-sm text-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-2">
                    <Toggle checked={p.enabled} onChange={(v) => setEnabled(p, v)} label={`Schedule enabled for ${p.name}`} />
                    {p.enabled ? 'Enabled' : 'Paused'}
                  </label>
                  <Button size="sm" icon={<Play className="size-3.5" />} loading={starting === p.id} onClick={() => runNow(p)} aria-label={`Run ${p.name}`}>
                    Run now
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-default pt-4">
                <Flow pipeline={p} connections={connections.data!} />
                <div className="flex items-center gap-5 text-xs text-2">
                  <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />{fmtInterval(p.scheduleIntervalSec)}</span>
                  <span>{p.runCount ? `${p.successCount}/${p.runCount} succeeded` : 'Never run'}</span>
                  {p.lastRun && <span>Last run {fmtRelative(p.lastRun.queuedAt)}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
