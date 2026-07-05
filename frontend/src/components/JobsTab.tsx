import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useRealtimeSubscription } from '../lib/socket';
import { StatusPill } from './StatusPill';
import { JobDetailDrawer } from './JobDetailDrawer';
import type { Job } from '../lib/types';

export function JobsTab({ queueId }: { queueId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('demo:echo');
  const [payload, setPayload] = useState('{}');
  const [priority, setPriority] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api
      .get<{ data: Job[] }>(`/v1/queues/${queueId}/jobs`, statusFilter ? { status: statusFilter } : undefined)
      .then((res) => setJobs(res.data));
  };

  useEffect(load, [queueId, statusFilter]);
  useRealtimeSubscription('queue', queueId, load);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payload || '{}');
    } catch {
      setFormError('Payload must be valid JSON');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/v1/queues/${queueId}/jobs`, {
        type,
        payload: parsedPayload,
        priority,
        ...(delaySeconds > 0 ? { runAt: new Date(Date.now() + delaySeconds * 1000).toISOString() } : {}),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-void border border-border-hair rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {['queued', 'running', 'retrying', 'completed', 'failed', 'dead_letter', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto bg-signal-blue text-void font-medium rounded-md px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
        >
          + Submit job
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-border-hair rounded-lg p-4 mb-4 space-y-3">
          {formError && <p className="text-sm text-signal-red">{formError}</p>}
          <div className="flex gap-2">
            <input
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="job type, e.g. demo:echo"
              className="flex-1 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
            />
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              title="priority"
              className="w-20 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
            />
            <input
              type="number"
              min={0}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              title="delay in seconds"
              className="w-28 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
              placeholder="delay (s)"
            />
          </div>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            placeholder="payload (JSON)"
            className="w-full bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
          />
          <p className="text-xs text-text-muted">
            Try <code className="mono">demo:echo</code>, <code className="mono">demo:flaky</code>,{' '}
            <code className="mono">demo:always-fail</code>, or <code className="mono">demo:permanent-fail</code> to see
            the retry/DLQ path in action.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="bg-signal-blue text-void font-medium rounded-md px-4 py-1.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Submit
          </button>
        </form>
      )}

      <div className="border border-border-hair rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Attempts</th>
              <th className="text-left px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr
                key={j.id}
                onClick={() => setSelectedJobId(j.id)}
                className="border-t border-border-hair hover:bg-surface-raised cursor-pointer transition-colors"
              >
                <td className="px-4 py-2 mono">{j.type}</td>
                <td className="px-4 py-2">
                  <StatusPill status={j.status} />
                </td>
                <td className="px-4 py-2 mono text-text-muted">
                  {j.attemptCount}/{j.maxAttempts}
                </td>
                <td className="px-4 py-2 text-text-muted">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                  No jobs match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedJobId && <JobDetailDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />}
    </div>
  );
}
