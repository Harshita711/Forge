import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

interface ScheduledDefinition {
  id: string;
  jobType: string;
  scheduleType: 'cron' | 'delayed';
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  isActive: boolean;
}

export function SchedulesTab({ queueId }: { queueId: string }) {
  const [defs, setDefs] = useState<ScheduledDefinition[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [jobType, setJobType] = useState('demo:echo');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [preview, setPreview] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.get<{ data: ScheduledDefinition[] }>(`/v1/queues/${queueId}/schedules`).then((res) => setDefs(res.data));
  };
  useEffect(load, [queueId]);

  useEffect(() => {
    if (!showForm || !cronExpression) return;
    const handle = setTimeout(() => {
      api
        .get<{ data: { occurrences: string[] } }>('/v1/cron/preview', { cronExpression, timezone, count: 3 })
        .then((res) => {
          setPreview(res.data.occurrences);
          setError(null);
        })
        .catch(() => setError('Invalid cron expression'));
    }, 300);
    return () => clearTimeout(handle);
  }, [showForm, cronExpression, timezone]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/v1/queues/${queueId}/schedules`, {
        jobType,
        scheduleType: 'cron',
        cronExpression,
        timezone,
        payloadTemplate: {},
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-signal-blue text-void font-medium rounded-md px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
        >
          + New schedule
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-border-hair rounded-lg p-4 mb-4 space-y-3">
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <div className="flex gap-2">
            <input
              required
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              placeholder="job type"
              className="flex-1 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
            />
            <input
              required
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="* * * * *"
              className="w-40 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
            />
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="IANA timezone"
              className="w-40 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
            />
          </div>
          {preview.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Next occurrences</p>
              <ul className="text-xs mono text-text-muted space-y-0.5">
                {preview.map((p) => (
                  <li key={p}>{new Date(p).toLocaleString()}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="bg-signal-blue text-void font-medium rounded-md px-4 py-1.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Create schedule
          </button>
        </form>
      )}

      <div className="border border-border-hair rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Job type</th>
              <th className="text-left px-4 py-2 font-medium">Cron</th>
              <th className="text-left px-4 py-2 font-medium">Next run</th>
              <th className="text-left px-4 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d) => (
              <tr key={d.id} className="border-t border-border-hair">
                <td className="px-4 py-2 mono">{d.jobType}</td>
                <td className="px-4 py-2 mono text-text-muted">{d.cronExpression ?? '—'}</td>
                <td className="px-4 py-2 text-text-muted">{new Date(d.nextRunAt).toLocaleString()}</td>
                <td className="px-4 py-2">{d.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {defs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                  No schedules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
