import { Sparkline } from './StatusPill';
import { usePauseQueueMutation, useQueueStats, useQueueStatsHistory } from '../lib/queries';
import { useRealtimeSubscription } from '../lib/socket';
import type { Queue } from '../lib/types';

export function OverviewTab({
  queue,
  projectId,
  onQueueUpdated,
}: {
  queue: Queue;
  projectId?: string;
  onQueueUpdated: (q: Queue) => void;
}) {
  const { data: live, refetch: refetchLive } = useQueueStats(queue.id);
  const { data: history = [], refetch: refetchHistory } = useQueueStatsHistory(queue.id, 20);
  const pauseMutation = usePauseQueueMutation(queue.id, projectId);

  useRealtimeSubscription('queue', queue.id, () => {
    void refetchLive();
    void refetchHistory();
  });

  async function handleToggle() {
    const action = queue.status === 'active' ? 'pause' : 'resume';
    const updated = await pauseMutation.mutateAsync(action);
    onQueueUpdated(updated);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-signal-blue">
          <Sparkline values={history.map((h) => h.completedCount)} />
          <span className="text-xs text-text-muted">throughput, last {history.length} ticks</span>
        </div>
        <button
          onClick={handleToggle}
          disabled={pauseMutation.isPending || queue.status === 'archived'}
          className="border border-border-hair rounded-md px-4 py-1.5 text-sm hover:border-signal-blue transition-colors disabled:opacity-50"
        >
          {queue.status === 'active' ? 'Pause queue' : 'Resume queue'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Queued" value={live?.queuedCount ?? 0} />
        <Stat label="Running" value={live?.runningCount ?? 0} color="text-signal-blue" />
        <Stat label="Completed (1m)" value={live?.completedCount ?? 0} color="text-signal-green" />
        <Stat label="Failed (1m)" value={live?.failedCount ?? 0} color="text-signal-red" />
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <Config label="Concurrency limit" value={queue.concurrencyLimit} />
        <Config label="Priority weight" value={queue.priorityWeight} />
        <Config label="Visibility timeout" value={`${queue.visibilityTimeoutSeconds}s`} />
      </div>

      {live?.errorRate !== undefined && live?.errorRate !== null && live.errorRate > 0.2 && (
        <p className="mt-6 text-sm bg-signal-amber/10 text-signal-amber rounded-md px-3 py-2">
          Error rate is {Math.round((live.errorRate ?? 0) * 100)}% over the last minute — check the DLQ tab.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface border border-border-hair rounded-lg p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mono text-2xl mt-1 ${color ?? ''}`}>{value}</p>
    </div>
  );
}

function Config({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mono text-sm mt-0.5">{value}</p>
    </div>
  );
}
