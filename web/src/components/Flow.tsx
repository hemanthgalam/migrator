import { ArrowRight } from 'lucide-react';
import type { Connection, Pipeline } from '../lib/types';
import { ConnectorIcon } from './ui';

export function FlowNode({ conn, stream, label }: { conn?: Connection; stream: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ConnectorIcon type={conn?.type || ''} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-3 uppercase">{label}</p>
        <p className="truncate text-sm font-medium text-1" title={`${conn?.name ?? 'Missing connection'} · ${stream}`}>
          {conn?.name ?? 'Missing connection'} <span className="text-3">/</span> <span className="font-mono text-[13px]">{stream}</span>
        </p>
      </div>
    </div>
  );
}

export function Flow({ pipeline, connections }: { pipeline: Pipeline; connections: Connection[] }) {
  const source = connections.find((c) => c.id === pipeline.sourceConnectionId);
  const dest = connections.find((c) => c.id === pipeline.destConnectionId);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FlowNode conn={source} stream={pipeline.sourceStream} label="Extract" />
      <ArrowRight className="size-4 shrink-0 text-3" />
      <span className="rounded-full surface-2 px-2.5 py-1 text-xs font-medium text-2">
        {pipeline.transforms.length} transform{pipeline.transforms.length === 1 ? '' : 's'}
      </span>
      <ArrowRight className="size-4 shrink-0 text-3" />
      <FlowNode conn={dest} stream={pipeline.destTarget} label="Load" />
    </div>
  );
}
