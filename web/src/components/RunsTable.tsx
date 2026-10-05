import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtDuration, fmtNumber, fmtRelative, runDuration } from '../lib/format';
import { useNow } from '../lib/hooks';
import type { Run } from '../lib/types';
import { Badge, Progress, StatusBadge, Table, Td, Th } from './ui';

export function runProgress(run: Run) {
  if (run.status === 'succeeded') return 1;
  if (!run.rowsTotal) return null;
  return run.rowsRead / run.rowsTotal;
}

export function RunProgress({ run }: { run: Run }) {
  const p = runProgress(run);
  const active = run.status === 'running';
  return (
    <div className="min-w-32">
      <Progress value={p} active={active} tone={run.status === 'failed' ? 'bad' : run.status === 'succeeded' ? 'good' : 'brand'} />
      <p className="mt-1 text-xs text-3 tabular-nums">
        {fmtNumber(run.rowsRead)}{run.rowsTotal ? ` / ${fmtNumber(run.rowsTotal)}` : ''} rows
        {p != null && active ? ` · ${Math.floor(p * 100)}%` : ''}
      </p>
    </div>
  );
}

export function RunsTable({ runs, showPipeline = true }: { runs: Run[]; showPipeline?: boolean }) {
  const now = useNow();
  const navigate = useNavigate();
  return (
    <Table>
      <thead>
        <tr>
          <Th>Status</Th>
          {showPipeline && <Th>Pipeline</Th>}
          <Th>Progress</Th>
          <Th className="text-right">Written</Th>
          <Th>Trigger</Th>
          <Th>Started</Th>
          <Th>Duration</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} data-testid="run-row" data-run-id={run.id} className="cursor-pointer transition-colors hover:bg-[var(--surface-2)]" onClick={() => navigate(`/runs/${run.id}`)}>
            <Td>
              <div className="flex items-center gap-2">
                <StatusBadge status={run.status} />
                {run.attempt > 1 && <span className="text-xs text-3">try {run.attempt}/{run.maxAttempts}</span>}
              </div>
            </Td>
            {showPipeline && (
              <Td>
                <Link to={`/pipelines/${run.pipelineId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-1 hover:text-brand-600">{run.pipelineName}</Link>
              </Td>
            )}
            <Td><RunProgress run={run} /></Td>
            <Td className="text-right tabular-nums">{fmtNumber(run.rowsWritten)}</Td>
            <Td><Badge>{run.trigger}</Badge></Td>
            <Td className="text-2 whitespace-nowrap">{run.startedAt ? fmtRelative(run.startedAt, now) : run.status === 'retrying' ? `retry ${fmtRelative(run.nextAttemptAt, now)}` : '—'}</Td>
            <Td className="text-2 tabular-nums">{fmtDuration(runDuration(run, now))}</Td>
            <Td className="text-right"><ArrowRight className="inline size-4 text-3" /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
