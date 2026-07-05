import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { StatusPill } from '../components/StatusPill';
import type { Queue } from '../lib/types';

export function QueuesPage() {
  const { orgId, projectId } = useParams<{ orgId: string; projectId: string }>();
  const navigate = useNavigate();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [concurrencyLimit, setConcurrencyLimit] = useState(10);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<{ data: Queue[] }>(`/v1/projects/${projectId}/queues`)
      .then((res) => setQueues(res.data))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Queue }>(`/v1/projects/${projectId}/queues`, {
        name,
        slug,
        concurrencyLimit,
      });
      setQueues((prev) => [...prev, res.data]);
      setName('');
      setSlug('');
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold">Queues</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-signal-blue text-void font-medium rounded-md px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
          >
            + New queue
          </button>
        </div>
        <p className="text-sm text-text-muted mb-6">Configure concurrency, priority, retries, and watch throughput per queue.</p>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-surface border border-border-hair rounded-lg p-4 mb-6 space-y-3">
            <div className="flex gap-2">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Queue name"
                className="flex-1 bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
              />
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="slug"
                className="w-40 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Concurrency limit</label>
              <input
                type="number"
                min={1}
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
                className="w-24 bg-void border border-border-hair rounded-md px-3 py-1.5 text-sm mono focus:border-signal-blue outline-none"
              />
              <button
                type="submit"
                disabled={creating}
                className="ml-auto bg-signal-blue text-void font-medium rounded-md px-4 py-1.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="space-y-2">
            {queues.map((q) => (
              <button
                key={q.id}
                onClick={() => navigate(`/orgs/${orgId}/projects/${projectId}/queues/${q.id}`)}
                className="w-full text-left bg-surface border border-border-hair rounded-lg px-4 py-3 hover:border-signal-blue transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium mono text-sm">{q.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    concurrency {q.concurrencyLimit} · priority weight {q.priorityWeight}
                    {q.partitionCount > 1 ? ` · ${q.partitionCount} partitions` : ''}
                  </p>
                </div>
                <StatusPill status={q.status} />
              </button>
            ))}
            {queues.length === 0 && <p className="text-sm text-text-muted">No queues yet — create one above.</p>}
          </div>
        )}
      </div>
    </Layout>
  );
}
