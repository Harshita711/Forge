import { z } from 'zod';

// These schemas are the single source of truth for both runtime validation and
// (in a later phase) OpenAPI generation via zod-to-openapi (Section 12.11) —
// one schema per endpoint, so the documented and enforced contracts cannot drift.

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  fullName: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const ChangeMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});
export type ChangeMemberRoleInput = z.infer<typeof ChangeMemberRoleSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be URL-safe, lowercase, hyphen-separated'),
  description: z.string().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// ── Retry policies (Section 4.6, 10.1) ──────────────────────────────────────
export const CreateRetryPolicySchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z.enum(['fixed', 'linear', 'exponential', 'adaptive']),
  baseDelaySeconds: z.number().int().min(0).default(5),
  maxDelaySeconds: z.number().int().min(1).default(3600),
  maxAttempts: z.number().int().min(1).max(50).default(5),
  jitter: z.boolean().default(true),
});
export type CreateRetryPolicyInput = z.infer<typeof CreateRetryPolicySchema>;

// ── Queues (Section 4.5) ─────────────────────────────────────────────────────
export const CreateQueueSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be URL-safe, lowercase, hyphen-separated'),
  priorityWeight: z.number().int().min(1).default(1),
  concurrencyLimit: z.number().int().min(1).default(10),
  visibilityTimeoutSeconds: z.number().int().min(1).default(30),
  partitionCount: z.number().int().min(1).max(64).default(1),
  defaultRetryPolicyId: z.string().uuid().optional(),
});
export type CreateQueueInput = z.infer<typeof CreateQueueSchema>;

export const UpdateQueueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  concurrencyLimit: z.number().int().min(1).optional(),
  priorityWeight: z.number().int().min(1).optional(),
  visibilityTimeoutSeconds: z.number().int().min(1).optional(),
  partitionCount: z.number().int().min(1).max(64).optional(),
  defaultRetryPolicyId: z.string().uuid().nullable().optional(),
});
export type UpdateQueueInput = z.infer<typeof UpdateQueueSchema>;

export const JobQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type JobQuery = z.infer<typeof JobQuerySchema>;

// ── Jobs (Section 4.8) ───────────────────────────────────────────────────────
// Phase 1 scope: immediate (runAt omitted/now) and delayed (runAt in the
// future) jobs only. Scheduled (cron) and batch creation are exposed via
// their own endpoints backed by scheduled_definitions / job_batches (Phase 3).
export const CreateJobSchema = z.object({
  type: z.string().min(1).max(200),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(-32768).max(32767).default(0),
  runAt: z.string().datetime().optional(), // omit for immediate; future ISO datetime for delayed
  maxAttempts: z.number().int().min(1).max(50).optional(),
  retryPolicyId: z.string().uuid().optional(),
  dependsOnJobIds: z.array(z.string().uuid()).max(50).optional(), // Section 11.1 DAG edges
});
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const CreateScheduledDefinitionSchema = z
  .object({
    jobType: z.string().min(1).max(200),
    payloadTemplate: z.record(z.unknown()).default({}),
    scheduleType: z.enum(['cron', 'delayed']),
    cronExpression: z.string().optional(),
    timezone: z.string().default('UTC'),
    runAt: z.string().datetime().optional(),
  })
  .refine((v) => (v.scheduleType === 'cron' ? !!v.cronExpression : !!v.runAt), {
    message: 'cronExpression is required for schedule_type=cron; runAt is required for schedule_type=delayed',
  });
export type CreateScheduledDefinitionInput = z.infer<typeof CreateScheduledDefinitionSchema>;

export const UpdateScheduledDefinitionSchema = z.object({
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateScheduledDefinitionInput = z.infer<typeof UpdateScheduledDefinitionSchema>;

export const CronPreviewQuerySchema = z.object({
  cronExpression: z.string(),
  timezone: z.string().default('UTC'),
  count: z.coerce.number().int().min(1).max(20).default(5),
});

export const CreateBatchSchema = z.object({
  name: z.string().max(200).optional(),
  jobs: z
    .array(
      z.object({
        type: z.string().min(1).max(200),
        payload: z.record(z.unknown()).default({}),
        priority: z.number().int().min(-32768).max(32767).default(0),
      })
    )
    .min(1)
    .max(1000),
  callbackUrl: z.string().url().optional(),
});
export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;

export const DlqRetrySchema = z.object({
  payload: z.record(z.unknown()).optional(), // presence requires dlq:edit, checked in service
});

// ── Custom roles (Section 4.15-4.16, 11.6) ──────────────────────────────────
export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(200),
  permissionKeys: z.array(z.string()).min(1).max(50),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
