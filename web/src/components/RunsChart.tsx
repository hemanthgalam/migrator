import { useState } from 'react';
import { fmtNumber } from '../lib/format';
import type { Stats } from '../lib/types';

// Stacked daily run outcomes. Status colors come from the reserved status
// palette; the legend and tooltip carry labels so color is never the only cue.
const SERIES = [
  { key: 'succeeded', label: 'Succeeded', color: 'var(--status-good)' },
  { key: 'failed', label: 'Failed', color: 'var(--status-critical)' },
  { key: 'other', label: 'Cancelled / in flight', color: 'var(--status-neutral)' },
] as const;

export function RunsChart({ series }: { series: Stats['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { top: 8, bottom: 22, left: 28, right: 4 };
  const max = Math.max(4, ...series.map((d) => d.succeeded + d.failed + d.other));
  const niceMax = Math.ceil(max / 4) * 4;
  const plotH = H - pad.top - pad.bottom;
  const slot = (W - pad.left - pad.right) / series.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => pad.top + plotH - (v / niceMax) * plotH;
  const ticks = [0, niceMax / 2, niceMax];
  const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Runs per day for the last 14 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-3)">{t}</text>
          </g>
        ))}
        {series.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2;
          let acc = 0;
          const segs = SERIES.map((s) => ({ ...s, v: d[s.key] })).filter((s) => s.v > 0);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={pad.top} width={slot} height={plotH} fill={hover === i ? 'var(--surface-2)' : 'transparent'} />
              {segs.map((s, j) => {
                const y0 = y(acc);
                acc += s.v;
                const y1 = y(acc);
                const top = j === segs.length - 1;
                const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                return top ? (
                  <path key={s.key} fill={s.color} d={roundedTop(cx - barW / 2, y1, barW, h, Math.min(4, h))} />
                ) : (
                  <rect key={s.key} x={cx - barW / 2} y={y1 + 2} width={barW} height={Math.max(0, h - 2)} fill={s.color} />
                );
              })}
              {((series.length - 1 - i) % 2 === 0 || series.length <= 7) && (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">{fmtDay(d.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-default surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${((pad.left + slot * hover + slot / 2) / W) * 100}% - 70px), calc(100% - 150px))` }}
        >
          <p className="mb-1 font-medium text-1">{fmtDay(series[hover].day)}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-2">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
              <span className="font-medium text-1 tabular-nums">{series[hover][s.key]}</span>
            </p>
          ))}
          <p className="mt-1 border-t border-default pt-1 text-2">{fmtNumber(series[hover].rowsWritten)} rows written</p>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
