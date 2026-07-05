import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusPill } from '../components/StatusPill';
import { useDashboard } from '../lib/queries';
import { useMultiQueueSubscription } from '../lib/socket';

export function DashboardPage() {
  const { orgId, projectId } = useParams<{ orgId: string; projectId: string }>();
  const { data, isLoading, refetch } = useDashboard(projectId);

  const queueIds = data?.queueBreakdown.map((q) => q.id) ?? [];
  useMultiQueueSubscription(queueIds, () => {
    void refetch();
  });

  if (isLoading || !data || !projectId || !orgId) {
    return (
      <Layout>
        <p className="text-sm text-text-muted">Loading dashboard…</p>
      </Layout>
    );
  }

  const { statusCounts, throughput, processingTime, retryStats, dlqCount, queueCount, cluster, queueBreakdown } = data;

  return (
    <Layout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold">{data.project.name}</h1>
          <p className="text-xs text-text-muted mono">updated {new Date(data.generatedAt).toLocaleTimeString()}</p>
        </div>
        <p className="text-sm text-text-muted mb-6">Live project metrics — aggregated directly from the database.</p>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total jobs" value={statusCounts.total} />
          <MetricCard label="Queued" value={statusCounts.queued} />
          <MetricCard label="Running" value={statusCounts.running} color="text-signal-blue" />
          <MetricCard label="Completed" value={statusCounts.completed} color="text-signal-green" />
          <MetricCard label="Failed (DLQ)" value={statusCounts.failed} color="text-signal-red" />
          <MetricCard label="Retrying" value={statusCounts.retrying} color="text-signal-amber" />
          <MetricCard label="DLQ entries" value={dlqCount} color="text-signal-red" />
          <MetricCard label="Queues" value={queueCount} />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-surface border border-border-hair rounded-lg p-4">
            <p className="text-xs text-text-muted mb-2">Processing time (60m)</p>
            <p className="mono text-sm">avg {formatMs(processingTime.avgMs)}</p>
            <p className="mono text-xs text-text-muted mt-1">
              p50 {formatMs(processingTime.p50Ms)} · p95 {formatMs(processingTime.p95Ms)} · n={processingTime.sampleCount}
            </p>
          </div>
          <div className="bg-surface border border-border-hair rounded-lg p-4">
            <p className="text-xs text-text-muted mb-2">Retry activity</p>
            <p className="mono text-sm">{retryStats.currentlyRetrying} retrying now</p>
            <p className="mono text-xs text-text-muted mt-1">
              {retryStats.recoveredAfterRetry} recovered · avg {retryStats.avgAttempts.toFixed(1)} attempts
            </p>
          </div>
          <div className="bg-surface border border-border-hair rounded-lg p-4">
            <p className="text-xs text-text-muted mb-2">Worker cluster</p>
            <p className="mono text-sm">
              {cluster.onlineCount} online · {cluster.utilization > 0 ? `${Math.round(cluster.utilization * 100)}% utilized` : 'idle'}
            </p>
            <p className="mono text-xs text-text-muted mt-1">
              {cluster.totalActiveSlots}/{cluster.totalCapacity} slots · {cluster.offlineCount} offline
            </p>
          </div>
        </div>

        {throughput.length > 0 && (
          <div className="bg-surface border border-border-hair rounded-lg p-4 mb-8">
            <p className="text-xs text-text-muted mb-3">Completed jobs per minute (last 30m)</p>
            <div className="flex items-end gap-1 h-16">
              {throughput.map((point) => (
                <div
                  key={point.bucket}
                  className="flex-1 bg-signal-blue/70 rounded-sm min-w-[2px]"
                  style={{ height: `${Math.max(4, (point.count / Math.max(...throughput.map((p) => p.count), 1)) * 100)}%` }}
                  title={`${new Date(point.bucket).toLocaleTimeString()}: ${point.count}`}
                />
              ))}
            </div>
          </div>
        )}

        <h2 className="text-sm font-medium mb-3">Queues</h2>
        <div className="border border-border-hair rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Queue</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Queued</th>
                <th className="text-right px-4 py-2 font-medium">Running</th>
                <th className="text-right px-4 py-2 font-medium">Failed</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {queueBreakdown.map((q) => (
                <tr key={q.id} className="border-t border-border-hair hover:bg-surface-raised">
                  <td className="px-4 py-2">
                    <Link
                      to={`/orgs/${orgId}/projects/${projectId}/queues/${q.id}`}
                      className="mono text-signal-blue hover:underline"
                    >
                      {q.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={q.status} />
                  </td>
                  <td className="px-4 py-2 mono text-right">{q.counts.queued}</td>
                  <td className="px-4 py-2 mono text-right">{q.counts.running}</td>
                  <td className="px-4 py-2 mono text-right text-signal-red">{q.counts.failed}</td>
                  <td className="px-4 py-2 mono text-right text-text-muted">{q.counts.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex gap-3">
          <Link to={`/orgs/${orgId}/projects/${projectId}/queues`} className="text-sm text-signal-blue hover:underline">
            Manage queues →
          </Link>
          <button onClick={() => refetch()} className="text-sm text-text-muted hover:text-text-primary">
            Refresh now
          </button>
        </div>
      </div>
    </Layout>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface border border-border-hair rounded-lg p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mono text-2xl mt-1 ${color ?? ''}`}>{value}</p>
    </div>
  );
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
