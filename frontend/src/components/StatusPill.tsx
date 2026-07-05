import type { JobStatus } from '../lib/types';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-signal-green/15', text: 'text-signal-green', label: 'Active' },
  online: { bg: 'bg-signal-green/15', text: 'text-signal-green', label: 'Online' },
  completed: { bg: 'bg-signal-green/15', text: 'text-signal-green', label: 'Completed' },
  paused: { bg: 'bg-signal-amber/15', text: 'text-signal-amber', label: 'Paused' },
  retrying: { bg: 'bg-signal-amber/15', text: 'text-signal-amber', label: 'Retrying' },
  draining: { bg: 'bg-signal-amber/15', text: 'text-signal-amber', label: 'Draining' },
  pending: { bg: 'bg-text-muted/15', text: 'text-text-muted', label: 'Pending' },
  scheduled: { bg: 'bg-text-muted/15', text: 'text-text-muted', label: 'Scheduled' },
  queued: { bg: 'bg-signal-blue/15', text: 'text-signal-blue', label: 'Queued' },
  claimed: { bg: 'bg-signal-blue/15', text: 'text-signal-blue', label: 'Claimed' },
  running: { bg: 'bg-signal-blue/15', text: 'text-signal-blue', label: 'Running' },
  failed: { bg: 'bg-signal-red/15', text: 'text-signal-red', label: 'Failed' },
  dead_letter: { bg: 'bg-signal-red/15', text: 'text-signal-red', label: 'Dead-lettered' },
  cancelled: { bg: 'bg-text-muted/15', text: 'text-text-muted', label: 'Cancelled' },
  offline: { bg: 'bg-signal-red/15', text: 'text-signal-red', label: 'Offline' },
  archived: { bg: 'bg-text-muted/15', text: 'text-text-muted', label: 'Archived' },
};

export function StatusPill({ status }: { status: JobStatus | string }) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-text-muted/15', text: 'text-text-muted', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  );
}

// The signature element: a tiny live waveform driven by real per-tick counts
// (queued/running/completed/failed from a queue's recent metrics_snapshots).
// Not decorative — it's the same throughput data the metrics tab charts,
// just compressed to a glance.
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 64;
  const height = 20;
  const max = Math.max(1, ...values);
  const points = values.length > 1
    ? values
        .map((v, i) => {
          const x = (i / (values.length - 1)) * width;
          const y = height - (v / max) * height;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} width={width} height={height} aria-hidden="true">
      {points ? (
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" strokeWidth="1" opacity="0.3" />
      )}
    </svg>
  );
}
