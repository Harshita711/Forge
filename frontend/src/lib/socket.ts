import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

type RealtimeHandler = () => void;

// Subscribes to a room for the lifetime of the component and re-runs the
// callback on every relevant realtime event Forge's event bus emits.
export function useRealtimeSubscription(
  kind: 'job' | 'queue' | 'workers',
  id: string | undefined,
  onEvent: RealtimeHandler
): void {
  useEffect(() => {
    if (kind !== 'workers' && !id) return;
    const s = getSocket();
    connectSocket();

    const handler = () => onEvent();
    const eventNames =
      kind === 'job'
        ? ['job:updated', 'dlq:new']
        : kind === 'queue'
          ? ['queue:updated', 'dlq:new']
          : ['worker:updated', 'dlq:new'];

    for (const eventName of eventNames) {
      s.on(eventName, handler);
    }

    if (kind === 'workers') {
      s.emit('subscribe:workers');
    } else {
      s.emit(`subscribe:${kind}`, id);
    }

    return () => {
      for (const eventName of eventNames) {
        s.off(eventName, handler);
      }
      if (kind === 'workers') {
        s.emit('unsubscribe:workers');
      } else {
        s.emit(`unsubscribe:${kind}`, id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
}

// Subscribe to multiple queue rooms — used by the project dashboard to stay live.
export function useMultiQueueSubscription(queueIds: string[], onEvent: RealtimeHandler): void {
  useEffect(() => {
    if (queueIds.length === 0) return;
    const s = getSocket();
    connectSocket();

    const handler = () => onEvent();
    s.on('queue:updated', handler);
    s.on('dlq:new', handler);

    for (const queueId of queueIds) {
      s.emit('subscribe:queue', queueId);
    }

    return () => {
      s.off('queue:updated', handler);
      s.off('dlq:new', handler);
      for (const queueId of queueIds) {
        s.emit('unsubscribe:queue', queueId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueIds.join(',')]);
}
