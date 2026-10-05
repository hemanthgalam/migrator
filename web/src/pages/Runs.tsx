import clsx from 'clsx';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import { RunsTable } from '../components/RunsTable';
import { Card, EmptyState, Loading, PageHeader } from '../components/ui';
import { useApi } from '../lib/hooks';
import { upsertRun, useLive } from '../lib/live';
import type { Run } from '../lib/types';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'running,queued,retrying', label: 'Active' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Runs() {
  const [filter, setFilter] = useState('');
  const runs = useApi<Run[]>(`/runs?limit=100${filter ? `&status=${filter}` : ''}`);
  useLive((e) => {
    if (e.type === 'run') runs.setData((list) => upsertRun(list, e.data, (r) => !filter || filter.split(',').includes(r.status)));
  });

  return (
    <>
      <PageHeader title="Runs" description="Every pipeline execution, live. Runs are queued, picked up by workers, and retried with backoff on failure." />
      <div className="mb-4 inline-flex rounded-lg border border-default surface p-0.5" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={clsx('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', filter === f.key ? 'bg-brand-600 text-white shadow-sm' : 'text-2 hover:text-[var(--text-1)]')}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card>
        {!runs.data ? <Loading /> : runs.data.length === 0 ? (
          <EmptyState icon={<Activity className="size-5" />} title="No runs match" description="Runs appear here as soon as they are queued." />
        ) : <RunsTable runs={runs.data} />}
      </Card>
    </>
  );
}
