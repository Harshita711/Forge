import { Permission } from './permissions';

export const PERMISSION_CATALOG: { key: Permission; description: string }[] = [
  { key: 'org:view', description: 'View organization details and membership list' },
  { key: 'org:manage', description: 'Rename the organization and change its settings' },
  { key: 'org:manage_billing', description: 'View and change billing/plan details' },
  { key: 'org:delete', description: 'Permanently delete the organization' },
  { key: 'member:invite', description: 'Invite a new member to the organization' },
  { key: 'member:change_role', description: "Change a member's role or remove them" },
  { key: 'project:create', description: 'Create a new project' },
  { key: 'project:view', description: 'View project details' },
  { key: 'project:manage', description: 'Rename, describe, or delete a project' },
  { key: 'queue:create', description: 'Create a new queue within a project' },
  { key: 'queue:view', description: 'View queue configuration and stats' },
  { key: 'queue:manage', description: 'Change queue configuration (concurrency, retry policy, partitions)' },
  { key: 'queue:pause', description: 'Pause or resume a queue' },
  { key: 'queue:delete', description: 'Archive a queue' },
  { key: 'job:create', description: 'Submit new jobs to a queue' },
  { key: 'job:view', description: 'View job details and execution history' },
  { key: 'job:cancel', description: 'Cancel a pending or queued job' },
  { key: 'job:replay', description: 'Replay a terminal job as a new job' },
  { key: 'dlq:view', description: 'View dead-lettered jobs' },
  { key: 'dlq:retry', description: 'Retry a dead-lettered job with its original payload' },
  { key: 'dlq:edit', description: 'Retry a dead-lettered job with an edited payload, or dismiss it' },
  { key: 'worker:view', description: 'View the worker fleet and heartbeat history' },
];

export const ALL_PERMISSION_KEYS: Permission[] = PERMISSION_CATALOG.map((p) => p.key);
