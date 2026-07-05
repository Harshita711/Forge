import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import type { Project } from '../lib/types';

export function ProjectsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api
      .get<{ data: Project[] }>(`/v1/organizations/${orgId}/projects`)
      .then((res) => setProjects(res.data))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Project }>(`/v1/organizations/${orgId}/projects`, { name, slug });
      setProjects((prev) => [...prev, res.data]);
      setName('');
      setSlug('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold mb-1">Projects</h1>
        <p className="text-sm text-text-muted mb-6">Each project owns its own set of queues.</p>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="space-y-2 mb-8">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/orgs/${orgId}/projects/${p.id}/queues`)}
                className="w-full text-left bg-surface border border-border-hair rounded-lg px-4 py-3 hover:border-signal-blue transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="text-xs text-text-muted mt-0.5">{p.description}</p>}
                </div>
                <span className="mono text-xs text-text-muted">{p.slug}</span>
              </button>
            ))}
            {projects.length === 0 && <p className="text-sm text-text-muted">No projects yet — create one below.</p>}
          </div>
        )}

        <form onSubmit={handleCreate} className="bg-surface border border-border-hair rounded-lg p-4 flex gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
          />
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="slug"
            className="w-40 bg-void border border-border-hair rounded-md px-3 py-2 text-sm mono focus:border-signal-blue outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-signal-blue text-void font-medium rounded-md px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </div>
    </Layout>
  );
}
