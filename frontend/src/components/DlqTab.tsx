import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useRealtimeSubscription } from '../lib/socket';
import type { DlqEntry } from '../lib/types';

export function DlqTab({ queueId }: { queueId: string }) {
  const [entries, setEntries] = useState<DlqEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DlqEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    api.get<{ data: DlqEntry[] }>(`/v1/queues/${queueId}/dlq`).then((res) => setEntries(res.data));
  };
  useEffect(load, [queueId]);
  useRealtimeSubscription('queue', queueId, load);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    const res = await api.get<{ data: DlqEntry }>(`/v1/dlq/${id}`);
    setDetail(res.data);
  }

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      await api.post(`/v1/dlq/${id}/retry`);
      load();
      setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(id: string) {
    setBusyId(id);
    try {
      await api.post(`/v1/dlq/${id}/dismiss`);
      load();
      setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSummarize(id: string) {
    setBusyId(id);
    try {
      await api.post(`/v1/dlq/${id}/summarize`);
      const res = await api.get<{ data: DlqEntry }>(`/v1/dlq/${id}`);
      setDetail(res.data);
    } finally {
      setBusyId(null);
    }
  }

  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">Nothing in the dead letter queue. Failed jobs land here once retries are exhausted.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="border border-border-hair rounded-lg overflow-hidden">
          <button
            onClick={() => toggleExpand(entry.id)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-surface-raised transition-colors"
          >
            <div>
              <p className="mono text-sm">{entry.type}</p>
              <p className="text-xs text-signal-red mt-0.5 truncate max-w-md">{entry.failureReason}</p>
            </div>
            <span className="text-xs text-text-muted">{entry.attemptCount} attempts</span>
          </button>

          {expandedId === entry.id && detail && (
            <div className="border-t border-border-hair p-4 bg-surface-raised space-y-3">
              <div>
                <p className="text-xs text-text-muted mb-1">Payload</p>
                <pre className="mono text-xs bg-void rounded-md p-3 overflow-x-auto">{JSON.stringify(detail.payload, null, 2)}</pre>
              </div>

              {detail.aiSummaries && detail.aiSummaries.length > 0 ? (
                <div className="bg-signal-blue/10 rounded-md p-3">
                  <p className="text-xs text-signal-blue font-medium mb-1">AI diagnosis</p>
                  <p className="text-sm mb-1">{detail.aiSummaries[0].summary}</p>
                  <p className="text-xs text-text-muted">Likely cause: {detail.aiSummaries[0].likelyCause}</p>
                  <p className="text-xs text-text-muted">Suggested action: {detail.aiSummaries[0].suggestedAction}</p>
                </div>
              ) : (
                <button
                  onClick={() => handleSummarize(entry.id)}
                  disabled={busyId === entry.id}
                  className="text-xs text-signal-blue hover:underline disabled:opacity-50"
                >
                  Generate AI diagnosis
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleRetry(entry.id)}
                  disabled={busyId === entry.id}
                  className="flex-1 bg-signal-blue text-void rounded-md py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Retry with original payload
                </button>
                <button
                  onClick={() => handleDismiss(entry.id)}
                  disabled={busyId === entry.id}
                  className="flex-1 border border-border-hair rounded-md py-1.5 text-sm hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
