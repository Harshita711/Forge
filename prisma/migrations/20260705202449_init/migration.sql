-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "custom_role_id" UUID,
    "invited_at" TIMESTAMPTZ,
    "joined_at" TIMESTAMPTZ,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority_weight" INTEGER NOT NULL DEFAULT 1,
    "concurrency_limit" INTEGER NOT NULL DEFAULT 10,
    "visibility_timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "partition_count" INTEGER NOT NULL DEFAULT 1,
    "default_retry_policy_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retry_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "base_delay_seconds" INTEGER NOT NULL DEFAULT 5,
    "max_delay_seconds" INTEGER NOT NULL DEFAULT 3600,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "jitter" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "retry_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue_id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload_template" JSONB NOT NULL,
    "schedule_type" TEXT NOT NULL,
    "cron_expression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "run_at" TIMESTAMPTZ,
    "next_run_at" TIMESTAMPTZ NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scheduled_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partition_key" SMALLINT,
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL,
    "retry_policy_id" UUID,
    "worker_id" UUID,
    "claimed_at" TIMESTAMPTZ,
    "lease_until" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "result" JSONB,
    "last_error" TEXT,
    "idempotency_key" TEXT,
    "batch_id" UUID,
    "parent_job_id" UUID,
    "scheduled_definition_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "depends_on_job_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue_id" UUID NOT NULL,
    "name" TEXT,
    "total_jobs" INTEGER NOT NULL,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "failed_jobs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "callback_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "job_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hostname" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "capacity" SMALLINT NOT NULL DEFAULT 5,
    "active_slots" SMALLINT NOT NULL DEFAULT 0,
    "queue_assignments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" TEXT,
    "last_heartbeat_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopped_at" TIMESTAMPTZ,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" UUID NOT NULL,
    "active_slots" SMALLINT NOT NULL,
    "cpu_percent" DOUBLE PRECISION,
    "memory_mb" DOUBLE PRECISION,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_events" (
    "id" BIGSERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "worker_id" UUID,
    "event_type" TEXT NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "original_job_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "failure_reason" TEXT NOT NULL,
    "attempt_count" SMALLINT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" UUID,
    "resolved_action" TEXT,
    "retried_as_job_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" TEXT,
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key","organization_id","endpoint")
);

-- CreateTable
CREATE TABLE "metrics_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "running_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "throughput_per_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_latency_ms" DOUBLE PRECISION,
    "error_rate" DOUBLE PRECISION,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_failure_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dead_letter_queue_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "likely_cause" TEXT NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_failure_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_triggers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "trigger_event_type" TEXT NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "target_queue_id" UUID NOT NULL,
    "payload_template" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "queues_project_id_status_idx" ON "queues"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "queues_project_id_slug_key" ON "queues"("project_id", "slug");

-- CreateIndex
CREATE INDEX "idx_scheduled_definitions_next_run_at_active" ON "scheduled_definitions"("next_run_at");

-- CreateIndex
CREATE INDEX "idx_jobs_claim_queue" ON "jobs"("queue_id", "status", "priority", "run_at");

-- CreateIndex
CREATE INDEX "idx_jobs_reaper_scan" ON "jobs"("status", "lease_until");

-- CreateIndex
CREATE INDEX "idx_jobs_batch_id" ON "jobs"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_jobs_queue_idempotency_key" ON "jobs"("queue_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "job_dependencies_depends_on_job_id_idx" ON "job_dependencies"("depends_on_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_dependencies_job_id_depends_on_job_id_key" ON "job_dependencies"("job_id", "depends_on_job_id");

-- CreateIndex
CREATE INDEX "idx_workers_reaper_stale_scan" ON "workers"("status", "last_heartbeat_at");

-- CreateIndex
CREATE INDEX "idx_worker_heartbeats_latest" ON "worker_heartbeats"("worker_id", "recorded_at");

-- CreateIndex
CREATE INDEX "idx_execution_events_job_timeline" ON "execution_events"("job_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_execution_events_recent_by_type" ON "execution_events"("event_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_queue_original_job_id_key" ON "dead_letter_queue"("original_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_queue_retried_as_job_id_key" ON "dead_letter_queue"("retried_as_job_id");

-- CreateIndex
CREATE INDEX "dead_letter_queue_queue_id_resolved_idx" ON "dead_letter_queue"("queue_id", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "metrics_snapshots_scope_type_scope_id_recorded_at_idx" ON "metrics_snapshots"("scope_type", "scope_id", "recorded_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "ai_failure_summaries_dead_letter_queue_id_generated_at_idx" ON "ai_failure_summaries"("dead_letter_queue_id", "generated_at");

-- CreateIndex
CREATE INDEX "event_triggers_project_id_trigger_event_type_is_active_idx" ON "event_triggers"("project_id", "trigger_event_type", "is_active");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_default_retry_policy_id_fkey" FOREIGN KEY ("default_retry_policy_id") REFERENCES "retry_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retry_policies" ADD CONSTRAINT "retry_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_definitions" ADD CONSTRAINT "scheduled_definitions_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_definitions" ADD CONSTRAINT "scheduled_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retry_policy_id_fkey" FOREIGN KEY ("retry_policy_id") REFERENCES "retry_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "job_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_parent_job_id_fkey" FOREIGN KEY ("parent_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_scheduled_definition_id_fkey" FOREIGN KEY ("scheduled_definition_id") REFERENCES "scheduled_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_depends_on_job_id_fkey" FOREIGN KEY ("depends_on_job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_batches" ADD CONSTRAINT "job_batches_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_heartbeats" ADD CONSTRAINT "worker_heartbeats_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_original_job_id_fkey" FOREIGN KEY ("original_job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_retried_as_job_id_fkey" FOREIGN KEY ("retried_as_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_failure_summaries" ADD CONSTRAINT "ai_failure_summaries_dead_letter_queue_id_fkey" FOREIGN KEY ("dead_letter_queue_id") REFERENCES "dead_letter_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_triggers" ADD CONSTRAINT "event_triggers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_triggers" ADD CONSTRAINT "event_triggers_target_queue_id_fkey" FOREIGN KEY ("target_queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
