export interface User {
  id: string;
  email: string;
  fullName: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

export interface Queue {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'archived';
  priorityWeight: number;
  concurrencyLimit: number;
  visibilityTimeoutSeconds: number;
  partitionCount: number;
  defaultRetryPolicyId: string | null;
  createdAt: string;
}

export interface QueueStats {
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  throughputPerMin: number;
  avgLatencyMs: number | null;
  errorRate: number | null;
  recordedAt: string;
}

export interface StatusCounts {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
  pending: number;
  scheduled: number;
  cancelled: number;
  total: number;
}

export interface DashboardData {
  project: { id: string; name: string; slug: string };
  statusCounts: StatusCounts;
  throughput: { bucket: string; count: number }[];
  processingTime: {
    avgMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
  };
  retryStats: {
    currentlyRetrying: number;
    recoveredAfterRetry: number;
    avgAttempts: number;
  };
  dlqCount: number;
  queueCount: number;
  cluster: {
    totalWorkers: number;
    onlineCount: number;
    drainingCount: number;
    offlineCount: number;
    totalCapacity: number;
    totalActiveSlots: number;
    utilization: number;
  };
  queueBreakdown: {
    id: string;
    name: string;
    slug: string;
    status: Queue['status'];
    concurrencyLimit: number;
    counts: StatusCounts;
  }[];
  generatedAt: string;
}

export type JobStatus =
  | 'pending'
  | 'scheduled'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

export interface Job {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  priority: number;
  runAt: string;
  attemptCount: number;
  maxAttempts: number;
  workerId: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  result: unknown;
  createdAt: string;
}

export interface ExecutionEvent {
  id: string;
  eventType: string;
  attemptNumber: number;
  metadata: Record<string, unknown>;
  occurredAt: string;
  workerId: string | null;
}

export interface Worker {
  id: string;
  hostname: string;
  status: 'online' | 'draining' | 'offline';
  capacity: number;
  activeSlots: number;
  lastHeartbeatAt: string | null;
  startedAt: string;
  stoppedAt: string | null;
}

export interface DlqEntry {
  id: string;
  type: string;
  payload: unknown;
  failureReason: string;
  attemptCount: number;
  resolved: boolean;
  resolvedAction: string | null;
  retriedAsJobId: string | null;
  createdAt: string;
  aiSummaries?: {
    id: string;
    summary: string;
    likelyCause: string;
    suggestedAction: string;
    confidenceScore: number;
    generatedAt: string;
  }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  joinedAt: string | null;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
}
