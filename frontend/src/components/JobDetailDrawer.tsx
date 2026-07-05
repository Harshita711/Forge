import { useEffect } from 'react';
import { StatusPill } from './StatusPill';
import { useCancelJobMutation, useJob, useJobEvents, useReplayJobMutation } from '../lib/queries';
import { useRealtimeSubscription } from '../lib/socket';

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  queued: 'Queued',
  claimed: 'Claimed by worker',
  started: 'Started executing',
  retry: 'Retry scheduled',
  completed: 'Completed',
  failed: 'Failed',
  recovered: 'Recovered from crashed worker',
  cancelled: 'Cancelled',
  dead_lettered: 'Dead-lettered',
};

export function JobDetailDrawer({
  jobId,
  queueId,
  projectId,
  onClose,
  onReplay,
}: {
  jobId: string;
  queueId?: string;
  projectId?: string;
  onClose: () => void;
  onReplay?: (newJobId: string) => void;
}) {
  const { data: job, refetch: refetchJob } = useJob(jobId);
  const { data: events = [], refetch: refetchEvents } = useJobEvents(jobId);
  const cancelMutation = useCancelJobMutation(jobId, queueId, projectId);
  const replayMutation = useReplayJobMutation(jobId, queueId, projectId);

  useRealtimeSubscription('job', jobId, () => {
    void refetchJob();
    void refetchEvents();
  });

  // When replay completes on the original job's websocket channel, switch to the new job.
  useEffect(() => {
    const s = document.querySelector('[data-job-drawer]');
    void s;
  }, []);

  async function handleCancel() {
    await cancelMutation.mutateAsync();
    await refetchJob();
    await refetchEvents();
  }

  async function handleReplay() {
    const newJob = await replayMutation.mutateAsync();
    onReplay?.(newJob.id);
  }

  const busy = cancelMutation.isPending || replayMutation.isPending;
  const cancellable = job && ['pending', 'scheduled', 'queued', 'retrying'].includes(job.status);
  const replayable = job && ['completed', 'failed', 'dead_letter', 'cancelled'].includes(job.status);

  return (
    <div className="fixed inset-0 z-30 flex justify-end" data-job-drawer>
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md bg-surface border-l border-border-hair h-full overflow-y-auto p-6">
        {!job ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="mono text-xs text-text-muted">{job.id}</p>
                <h2 className="text-lg font-semibold mt-0.5">{job.type}</h2>
              </div>
              <StatusPill status={job.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <p className="text-xs text-text-muted">Attempts</p>
                <p className="mono">
                  {job.attemptCount} / {job.maxAttempts}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Priority</p>
                <p className="mono">{job.priority}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Run at</p>
                <p className="mono">{new Date(job.runAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Worker</p>
                <p className="mono truncate">{job.workerId ?? '—'}</p>
              </div>
            </div>

            {job.lastError && (
              <div className="mb-4">
                <p className="text-xs text-text-muted mb-1">Last error</p>
                <p className="text-sm bg-signal-red/10 text-signal-red rounded-md px-3 py-2 mono break-words">{job.lastError}</p>
              </div>
            )}

            <div className="flex gap-2 mb-6">
              {cancellable && (
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  className="flex-1 border border-border-hair rounded-md py-1.5 text-sm hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              {replayable && (
                <button
                  onClick={handleReplay}
                  disabled={busy}
                  className="flex-1 bg-signal-blue text-void rounded-md py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Replay as new job
                </button>
              )}
            </div>

            <h3 className="text-sm font-medium mb-2">Execution timeline</h3>
            <ol className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className="mono text-xs text-text-muted w-16 shrink-0 pt-0.5">
                    {new Date(ev.occurredAt).toLocaleTimeString()}
                  </span>
                  <div>
                    <p>{EVENT_LABELS[ev.eventType] ?? ev.eventType}</p>
                    {ev.eventType === 'retry' && typeof ev.metadata.delaySeconds === 'number' && (
                      <p className="text-xs text-text-muted">retrying in {Math.round(ev.metadata.delaySeconds)}s</p>
                    )}
                    {ev.eventType === 'dead_lettered' && typeof ev.metadata.reason === 'string' && (
                      <p className="text-xs text-signal-red mono">{ev.metadata.reason}</p>
                    )}
                    {ev.eventType === 'created' && typeof ev.metadata.replayedFrom === 'string' && (
                      <p className="text-xs text-text-muted">replayed from {String(ev.metadata.replayedFrom)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
