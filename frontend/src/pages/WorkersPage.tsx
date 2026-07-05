import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useRealtimeSubscription } from '../lib/socket';
import { Layout } from '../components/Layout';
import { StatusPill } from '../components/StatusPill';
import type { Worker } from '../lib/types';

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);

  const load = () => {
    api.get<{ data: Worker[] }>('/v1/workers').then((res) => setWorkers(res.data));
  };
  useEffect(load, []);
  useRealtimeSubscription('workers', undefined, load);

  return (
    <Layout>
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold mb-1">Workers</h1>
        <p className="text-sm text-text-muted mb-6">Live worker fleet, updated over the websocket feed as heartbeats arrive.</p>

        <div className="border border-border-hair rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Hostname</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Slots</th>
                <th className="text-left px-4 py-2 font-medium">Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-t border-border-hair">
                  <td className="px-4 py-2 mono">{w.hostname}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={w.status} />
                  </td>
                  <td className="px-4 py-2 mono text-text-muted">
                    {w.activeSlots} / {w.capacity}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {w.lastHeartbeatAt ? new Date(w.lastHeartbeatAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                    No workers have registered yet — start one with <code className="mono">npm run dev:worker</code>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
