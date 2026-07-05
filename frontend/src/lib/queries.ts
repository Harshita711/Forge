import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { DashboardData, DlqEntry, Job, Queue, QueueStats, Worker } from './types';

export const queryKeys = {
  dashboard: (projectId: string) => ['dashboard', projectId] as const,
  queues: (projectId: string) => ['queues', projectId] as const,
  queue: (queueId: string) => ['queue', queueId] as const,
  queueStats: (queueId: string) => ['queueStats', queueId] as const,
  queueStatsHistory: (queueId: string) => ['queueStatsHistory', queueId] as const,
  jobs: (queueId: string, status?: string) => ['jobs', queueId, status ?? ''] as const,
  job: (jobId: string) => ['job', jobId] as const,
  jobEvents: (jobId: string) => ['jobEvents', jobId] as const,
  dlq: (queueId: string) => ['dlq', queueId] as const,
  workers: () => ['workers'] as const,
};

export function useDashboard(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard(projectId ?? ''),
    queryFn: () => api.get<{ data: DashboardData }>(`/v1/projects/${projectId}/dashboard`).then((r) => r.data),
    enabled: !!projectId,
  });
}

export function useQueues(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.queues(projectId ?? ''),
    queryFn: () => api.get<{ data: Queue[] }>(`/v1/projects/${projectId}/queues`).then((r) => r.data),
    enabled: !!projectId,
  });
}

export function useQueue(queueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.queue(queueId ?? ''),
    queryFn: () => api.get<{ data: Queue }>(`/v1/queues/${queueId}`).then((r) => r.data),
    enabled: !!queueId,
  });
}

export function useQueueStats(queueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.queueStats(queueId ?? ''),
    queryFn: () => api.get<{ data: QueueStats }>(`/v1/queues/${queueId}/stats`).then((r) => r.data),
    enabled: !!queueId,
  });
}

export function useQueueStatsHistory(queueId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: queryKeys.queueStatsHistory(queueId ?? ''),
    queryFn: () =>
      api.get<{ data: QueueStats[] }>(`/v1/queues/${queueId}/stats`, { history: limit }).then((r) => r.data),
    enabled: !!queueId,
  });
}

export function useJobs(queueId: string | undefined, statusFilter = '') {
  return useQuery({
    queryKey: queryKeys.jobs(queueId ?? '', statusFilter),
    queryFn: () =>
      api
        .get<{ data: Job[] }>(`/v1/queues/${queueId}/jobs`, statusFilter ? { status: statusFilter } : undefined)
        .then((r) => r.data),
    enabled: !!queueId,
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ''),
    queryFn: () => api.get<{ data: Job }>(`/v1/jobs/${jobId}`).then((r) => r.data),
    enabled: !!jobId,
  });
}

export function useJobEvents(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobEvents(jobId ?? ''),
    queryFn: () => api.get<{ data: import('./types').ExecutionEvent[] }>(`/v1/jobs/${jobId}/events`).then((r) => r.data),
    enabled: !!jobId,
  });
}

export function useDlq(queueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dlq(queueId ?? ''),
    queryFn: () => api.get<{ data: DlqEntry[] }>(`/v1/queues/${queueId}/dlq`).then((r) => r.data),
    enabled: !!queueId,
  });
}

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers(),
    queryFn: () => api.get<{ data: Worker[] }>('/v1/workers').then((r) => r.data),
  });
}

export function useInvalidateQueries() {
  const queryClient = useQueryClient();
  return {
    dashboard: (projectId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(projectId) }),
    queues: (projectId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.queues(projectId) }),
    queue: (queueId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.queue(queueId) }),
    queueStats: (queueId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStats(queueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStatsHistory(queueId) });
    },
    jobs: (queueId: string) => queryClient.invalidateQueries({ queryKey: ['jobs', queueId] }),
    job: (jobId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.job(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobEvents(jobId) });
    },
    dlq: (queueId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.dlq(queueId) }),
    workers: () => queryClient.invalidateQueries({ queryKey: queryKeys.workers() }),
  };
}

export function usePauseQueueMutation(queueId: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (action: 'pause' | 'resume') => api.post<{ data: Queue }>(`/v1/queues/${queueId}/${action}`).then((r) => r.data),
    onSuccess: () => {
      invalidate.queue(queueId);
      invalidate.queueStats(queueId);
      if (projectId) {
        invalidate.dashboard(projectId);
        invalidate.queues(projectId);
      }
    },
  });
}

export function useCreateJobMutation(queueId: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (body: unknown) => api.post(`/v1/queues/${queueId}/jobs`, body),
    onSuccess: () => {
      invalidate.jobs(queueId);
      invalidate.queueStats(queueId);
      if (projectId) invalidate.dashboard(projectId);
    },
  });
}

export function useCancelJobMutation(jobId: string, queueId?: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: () => api.post(`/v1/jobs/${jobId}/cancel`),
    onSuccess: () => {
      invalidate.job(jobId);
      if (queueId) {
        invalidate.jobs(queueId);
        invalidate.queueStats(queueId);
      }
      if (projectId) invalidate.dashboard(projectId);
    },
  });
}

export function useReplayJobMutation(jobId: string, queueId?: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: () => api.post<{ data: Job }>(`/v1/jobs/${jobId}/replay`).then((r) => r.data),
    onSuccess: (newJob) => {
      invalidate.job(jobId);
      invalidate.job(newJob.id);
      if (queueId) {
        invalidate.jobs(queueId);
        invalidate.queueStats(queueId);
      }
      if (projectId) invalidate.dashboard(projectId);
    },
  });
}

export function useDlqRetryMutation(queueId: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (dlqId: string) => api.post(`/v1/dlq/${dlqId}/retry`),
    onSuccess: () => {
      invalidate.dlq(queueId);
      invalidate.jobs(queueId);
      invalidate.queueStats(queueId);
      if (projectId) invalidate.dashboard(projectId);
    },
  });
}

export function useDlqDismissMutation(queueId: string, projectId?: string) {
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (dlqId: string) => api.post(`/v1/dlq/${dlqId}/dismiss`),
    onSuccess: () => {
      invalidate.dlq(queueId);
      if (projectId) invalidate.dashboard(projectId);
    },
  });
}
