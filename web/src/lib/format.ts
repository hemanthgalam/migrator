export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));

export function fmtCompact(n: number) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtDuration(ms: number | null | undefined) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const diff = (now - new Date(iso).getTime()) / 1000;
  const future = diff < 0;
  const a = Math.abs(diff);
  let s: string;
  if (a < 5) return future ? 'in a moment' : 'just now';
  if (a < 60) s = `${Math.round(a)}s`;
  else if (a < 3600) s = `${Math.round(a / 60)}m`;
  else if (a < 86400) s = `${Math.round(a / 3600)}h`;
  else s = `${Math.round(a / 86400)}d`;
  return future ? `in ${s}` : `${s} ago`;
}

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export function runDuration(run: { startedAt: string | null; finishedAt: string | null }, now = Date.now()) {
  if (!run.startedAt) return null;
  return (run.finishedAt ? new Date(run.finishedAt).getTime() : now) - new Date(run.startedAt).getTime();
}

export function fmtInterval(sec: number | null | undefined) {
  if (!sec) return 'Manual';
  if (sec % 86400 === 0) return sec === 86400 ? 'Daily' : `Every ${sec / 86400} days`;
  if (sec % 3600 === 0) return sec === 3600 ? 'Hourly' : `Every ${sec / 3600} hours`;
  if (sec % 60 === 0) return `Every ${sec / 60} min`;
  return `Every ${sec}s`;
}
