import { Activity, ArrowRight, CheckCircle2, Clock, Rows3, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RunProgress, RunsTable } from '../components/RunsTable';
import { RunsChart } from '../components/RunsChart';
import { Button, Card, CardHeader, EmptyState, Loading, PageHeader, StatusBadge } from '../components/ui';
import { fmtCompact, fmtDuration, fmtNumber } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';
import { upsertRun, useLive } from '../lib/live';
import type { Run, Stats } from '../lib/types';

function Kpi({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-2">{label}</p>
        <span className="text-3">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-1 tabular-nums" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-3">{sub}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const stats = useApi<Stats>('/stats');
  const recent = useApi<Run[]>('/runs?limit=8');
  const active = useApi<Run[]>('/runs?status=running,queued,retrying&limit=20');
  const [, setTick] = useState(0);
  const refreshStats = useDebounced(stats.reload, 600);
  const isActive = (r: Run) => ['running', 'queued', 'retrying'].includes(r.status);

  useLive((e) => {
    if (e.type !== 'run') return;
    recent.setData((list) => upsertRun(list, e.data).slice(0, 8));
    active.setData((list) => upsertRun(list, e.data, isActive));
    setTick((t) => t + 1);
    refreshStats();
  });

  const s = stats.data;
  if (!s) return <Loading />;

  return (
    <>
      <PageHeader title="Overview" description={`Pipeline health across the last ${s.windowDays} days.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Runs" value={fmtNumber(s.runs)} sub={`${s.running} running · ${s.queued} queued`} icon={<Activity className="size-4" />} />
        <Kpi label="Success rate" value={s.successRate == null ? '—' : `${(s.successRate * 100).toFixed(1)}%`} sub={`${s.succeeded} succeeded · ${s.failed} failed`} icon={<CheckCircle2 className="size-4" />} />
        <Kpi label="Rows loaded" value={fmtCompact(s.rowsWritten)} sub={`${fmtNumber(s.rowsWritten)} rows written`} icon={<Rows3 className="size-4" />} />
        <Kpi label="Avg duration" value={fmtDuration(s.avgDurationMs)} sub={`${s.pipelines} pipelines · ${s.scheduledPipelines} scheduled`} icon={<Clock className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Run outcomes" description="Daily runs by final status" />
          <div className="p-5"><RunsChart series={s.series} /></div>
        </Card>
        <Card>
          <CardHeader title="Live queue" description={`${s.queue.active} of ${s.queue.concurrency} workers busy`} />
          <div className="divide-y divide-[var(--border)]" data-testid="live-queue">
            {(active.data || []).length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-3">No runs in flight. Start one from a pipeline.</p>
            ) : (
              (active.data || []).slice(0, 6).map((run) => (
                <Link key={run.id} to={`/runs/${run.id}`} className="block px-5 py-3.5 hover:bg-[var(--surface-2)]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-1">{run.pipelineName}</span>
                    <StatusBadge status={run.status} />
                  </div>
                  <RunProgress run={run} />
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent runs" actions={<Link to="/runs"><Button variant="ghost" size="sm">View all <ArrowRight className="size-4" /></Button></Link>} />
        {recent.loading ? <Loading /> : (recent.data || []).length === 0 ? (
          <EmptyState
            icon={<Workflow className="size-5" />}
            title="No runs yet"
            description="Pipelines extract, transform and load your data in the background. Create one and run it to see results here."
            action={<Link to="/pipelines"><Button variant="primary">Go to pipelines</Button></Link>}
          />
        ) : <RunsTable runs={recent.data!} />}
      </Card>
    </>
  );
}
