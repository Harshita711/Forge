import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { StatusPill } from '../components/StatusPill';
import { OverviewTab } from '../components/OverviewTab';
import { JobsTab } from '../components/JobsTab';
import { SchedulesTab } from '../components/SchedulesTab';
import { DlqTab } from '../components/DlqTab';
import type { Queue } from '../lib/types';

const TABS = ['Overview', 'Jobs', 'Schedules', 'DLQ'] as const;
type Tab = (typeof TABS)[number];

export function QueueDetailPage() {
  const { queueId } = useParams<{ queueId: string }>();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');

  useEffect(() => {
    if (!queueId) return;
    api.get<{ data: Queue }>(`/v1/queues/${queueId}`).then((res) => setQueue(res.data));
  }, [queueId]);

  if (!queue || !queueId) {
    return (
      <Layout>
        <p className="text-sm text-text-muted">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold mono">{queue.name}</h1>
          <StatusPill status={queue.status} />
        </div>
        <p className="text-sm text-text-muted mb-6 mono">{queue.slug}</p>

        <div className="flex gap-1 border-b border-border-hair mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                tab === t ? 'border-signal-blue text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && <OverviewTab queue={queue} onQueueUpdated={setQueue} />}
        {tab === 'Jobs' && <JobsTab queueId={queueId} />}
        {tab === 'Schedules' && <SchedulesTab queueId={queueId} />}
        {tab === 'DLQ' && <DlqTab queueId={queueId} />}
      </div>
    </Layout>
  );
}
