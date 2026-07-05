import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';

export function OrganizationsPage() {
  const { organizations, refreshOrganizations } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: { id: string } }>('/v1/organizations', { name });
      await refreshOrganizations();
      navigate(`/orgs/${res.data.id}/projects`);
    } finally {
      setCreating(false);
      setName('');
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold mb-1">Organizations</h1>
        <p className="text-sm text-text-muted mb-6">Pick an organization to manage its projects and queues.</p>

        <div className="space-y-2 mb-8">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => navigate(`/orgs/${org.id}/projects`)}
              className="w-full text-left bg-surface border border-border-hair rounded-lg px-4 py-3 hover:border-signal-blue transition-colors flex items-center justify-between"
            >
              <span className="font-medium">{org.name}</span>
              <span className="mono text-xs text-text-muted">{org.slug}</span>
            </button>
          ))}
          {organizations.length === 0 && <p className="text-sm text-text-muted">No organizations yet — create one below.</p>}
        </div>

        <form onSubmit={handleCreate} className="bg-surface border border-border-hair rounded-lg p-4 flex gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New organization name"
            className="flex-1 bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
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
