# Forge API Reference

Base URL: `http://localhost:4000` · Base path: `/v1`

## Contents

1. [Conventions](#conventions)
2. [Authentication](#authentication)
3. [Health](#health)
4. [Organizations & Members](#organizations--members)
5. [Custom Roles & Permissions](#custom-roles--permissions)
6. [Projects](#projects)
7. [Retry Policies](#retry-policies)
8. [Queues](#queues)
9. [Jobs](#jobs)
10. [Schedules (cron / delayed definitions)](#schedules-cron--delayed-definitions)
11. [Batches](#batches)
12. [Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
13. [Workers](#workers)
14. [Search & Notifications](#search--notifications)
15. [WebSocket Events](#websocket-events)

---

## Conventions

**Every response body** is one of:

```json
{ "data": ..., "meta": { } }
```
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

**Authentication:** every route requires
`Authorization: Bearer <accessToken>` **except**:
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh` (uses an httpOnly cookie instead)
- `GET /health/live`, `GET /health/ready`

**Error codes:**

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | request body/query failed schema validation |
| `UNAUTHENTICATED` | 401 | missing, expired, or invalid access token |
| `FORBIDDEN` | 403 | authenticated, but lacks the required permission |
| `NOT_FOUND` | 404 | resource doesn't exist, **or** exists in an organization the caller can't see (see below) |
| `CONFLICT` | 409 | e.g. duplicate slug, deleting a project that still has queues |
| `UNPROCESSABLE` | 422 | valid shape, invalid business state (e.g. cancelling a completed job) |
| `RATE_LIMITED` | 429 | too many requests |
| `INTERNAL_ERROR` | 500 | unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | a dependency (e.g. DB) is unreachable |

> **Tenant isolation rule:** a resource that belongs to another organization
> always returns `404 NOT_FOUND`, never `403 FORBIDDEN`. This is deliberate —
> it means a caller can never use the API's response to confirm that an ID
> exists somewhere they're not allowed to see. See
> [DECISIONS.md](./DECISIONS.md#tenant-isolation-always-404-never-403).

---

## Authentication

| Method | Path | Auth | Body | What it does |
|---|---|---|---|---|
| `POST` | `/v1/auth/register` | — | `email, password, fullName, organizationName` | Creates the user **and** their first organization (caller becomes `owner`) |
| `POST` | `/v1/auth/login` | — | `email, password` | Sets an httpOnly refresh-token cookie, returns an access token |
| `POST` | `/v1/auth/refresh` | refresh cookie | — | Rotates the refresh token. Presenting an already-used (rotated-away) token revokes the *entire* session family — see [DECISIONS.md](./DECISIONS.md#refresh-token-rotation-with-reuse-detection) |
| `POST` | `/v1/auth/logout` | bearer | — | Revokes the current session family |
| `GET` | `/v1/auth/me` | bearer | — | Current user + the organizations they belong to |
| `GET` | `/v1/auth/sessions` | bearer | — | Lists active refresh-token sessions for the current user |
| `DELETE` | `/v1/auth/sessions/:id` | bearer | — | Revokes one session (e.g. "log out that device") |

**Password rule:** 10–128 characters (enforced by request validation).

**Example — register:**
```http
POST /v1/auth/register
Content-Type: application/json

{
  "email": "demo@forge.local",
  "password": "demo-password-123",
  "fullName": "Demo User",
  "organizationName": "Demo Org"
}
```

---

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health/live` | none | Liveness probe — is the process up |
| `GET` | `/health/ready` | none | Readiness probe — also checks Postgres connectivity |

---

## Organizations & Members

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/organizations` | authenticated | Creates an org; caller becomes `owner` |
| `GET` | `/v1/organizations` | authenticated | Orgs the caller belongs to |
| `GET` | `/v1/organizations/:id` | `org:view` | |
| `PATCH` | `/v1/organizations/:id` | `org:manage` | Body: `name?` |
| `GET` | `/v1/organizations/:id/members` | `org:view` | |
| `POST` | `/v1/organizations/:id/members` | `member:invite` | Body: `email, role?` (`owner`\|`admin`\|`member`\|`viewer`, default `member`) |
| `PATCH` | `/v1/organizations/:id/members/:userId` | `member:change_role` | Body: `role?, customRoleId?` |
| `DELETE` | `/v1/organizations/:id/members/:userId` | `member:change_role` | Removes a member |
| `GET` | `/v1/organizations/:id/audit-logs` | `org:manage` | Paginated (`page`, `pageSize`, default `1`/`25`, max page size `100`) |

Built-in roles are `owner`, `admin`, `member`, `viewer`. Any org can also
define custom roles — see below.

---

## Custom Roles & Permissions

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/organizations/:id/roles` | `member:change_role` | Body: `name, permissionKeys[]` (1–50 keys) |
| `GET` | `/v1/organizations/:id/roles` | `member:change_role` | |
| `GET` | `/v1/organizations/:id/roles/:roleId` | `member:change_role` | |
| `GET` | `/v1/permissions` | authenticated | Full permission catalog, for building a role-picker UI |

**Full permission catalog:**

| Key | Grants |
|---|---|
| `org:view` | View organization details and membership |
| `org:manage` | Rename the organization, change its settings |
| `org:manage_billing` | View/change billing |
| `org:delete` | Permanently delete the organization |
| `member:invite` | Invite a new member |
| `member:change_role` | Change a member's role or remove them |
| `project:create` / `project:view` / `project:manage` | Create / view / rename-describe-delete a project |
| `queue:create` / `queue:view` / `queue:manage` / `queue:pause` / `queue:delete` | Queue lifecycle and configuration |
| `job:create` / `job:view` / `job:cancel` / `job:replay` | Job lifecycle |
| `dlq:view` / `dlq:retry` / `dlq:edit` | Dead-lettered job visibility and recovery |
| `worker:view` | View the worker fleet |

---

## Projects

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/organizations/:id/projects` | `project:create` | Body: `name, slug, description?` |
| `GET` | `/v1/organizations/:id/projects` | `project:view` | |
| `GET` | `/v1/projects/:id` | `project:view` | Tenant is resolved from the project row itself — no org ID needed in the path |
| `PATCH` | `/v1/projects/:id` | `project:manage` | Body: `name?, description?` |
| `DELETE` | `/v1/projects/:id` | `project:manage` | Blocked (`409 CONFLICT`) while the project still has queues |

`slug` must be lowercase, URL-safe, hyphen-separated (e.g. `billing-jobs`).

---

## Retry Policies

Reusable retry configurations, attachable to a queue (as the default) or an
individual job.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/organizations/:id/retry-policies` | `queue:manage` | Body below |
| `GET` | `/v1/organizations/:id/retry-policies` | `queue:view` | |
| `GET` | `/v1/organizations/:id/retry-policies/:policyId` | `queue:view` | |

```json
{
  "name": "aggressive-exponential",
  "strategy": "fixed | linear | exponential | adaptive",
  "baseDelaySeconds": 5,
  "maxDelaySeconds": 3600,
  "maxAttempts": 5,
  "jitter": true
}
```

See [DECISIONS.md](./DECISIONS.md#retry-policy-crud) for why this exists as
its own resource rather than being inline on the queue.

---

## Queues

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/projects/:id/queues` | `queue:create` | Body below |
| `GET` | `/v1/projects/:id/queues` | `queue:view` | |
| `GET` | `/v1/queues/:id` | `queue:view` | |
| `PATCH` | `/v1/queues/:id` | `queue:manage` | Partial update of the same fields |
| `POST` | `/v1/queues/:id/pause` | `queue:pause` | Stops new claims; doesn't touch jobs already running |
| `POST` | `/v1/queues/:id/resume` | `queue:pause` | |
| `GET` | `/v1/queues/:id/stats` | `queue:view` | Latest metrics snapshot; `?history=20` returns the last 20 snapshots, oldest first |
| `DELETE` | `/v1/queues/:id` | `queue:delete` | Archives the queue; blocked while jobs remain |

```json
{
  "name": "email-sends",
  "slug": "email-sends",
  "priorityWeight": 1,
  "concurrencyLimit": 10,
  "visibilityTimeoutSeconds": 30,
  "partitionCount": 1,
  "defaultRetryPolicyId": "uuid, optional"
}
```

`partitionCount` (1–64) splits a queue's job backlog into independent
lanes that workers claim from separately — see
[DECISIONS.md](./DECISIONS.md#partition-locking).

---

## Jobs

Jobs are created underneath a queue: `POST /v1/queues/:id/jobs`. There's no
separate "job type" endpoint — immediate, delayed, and dependency (DAG) jobs
all go through the same call, distinguished by which optional fields are
present.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/queues/:id/jobs` | `job:create` | Rate-limited (120/min per user+queue). Optional `Idempotency-Key` header |
| `GET` | `/v1/queues/:id/jobs` | `job:view` | Query: `status?, type?, cursor?, limit?` — cursor-paginated |
| `GET` | `/v1/jobs/:id` | `job:view` | |
| `GET` | `/v1/jobs/:id/events` | `job:view` | Full execution timeline (claimed, started, retried, completed/failed, …) |
| `POST` | `/v1/jobs/:id/cancel` | `job:cancel` | Only from `pending`/`scheduled`/`queued`/`retrying`; cascades to dependent jobs |
| `POST` | `/v1/jobs/:id/replay` | `job:replay` | Only from a terminal state; creates a **new** job row — the original is never mutated |

**Create a job:**
```json
{
  "type": "email:send",
  "payload": { "to": "user@example.com" },
  "priority": 0,
  "runAt": "2026-07-06T09:00:00Z",
  "maxAttempts": 5,
  "retryPolicyId": "uuid, optional",
  "dependsOnJobIds": ["uuid", "uuid"]
}
```

| Field | Behavior if... |
|---|---|
| `runAt` omitted | Job runs immediately (as soon as a worker claims it) |
| `runAt` in the future | Job stays `scheduled` until that time, then becomes claimable |
| `dependsOnJobIds` present | Job stays `pending` until every listed job completes successfully |

**Job lifecycle:**

```
pending → scheduled → queued → claimed → running → completed
                                              ↓
                                            failed → retrying → queued  (loop until max attempts)
                                              ↓
                                          dead_letter
```
`cancelled` is reachable from any non-terminal state via `POST /cancel`.

---

## Schedules (cron / delayed definitions)

A schedule is a template that repeatedly (cron) or eventually (delayed)
produces new job rows — it is not itself a job.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/queues/:id/schedules` | `queue:manage` | Body below |
| `GET` | `/v1/queues/:id/schedules` | `queue:view` | |
| `GET` | `/v1/schedules/:id` | `queue:view` | |
| `PATCH` | `/v1/schedules/:id` | `queue:manage` | Body: `cronExpression?, timezone?, isActive?` |
| `DELETE` | `/v1/schedules/:id` | `queue:manage` | Soft-delete: sets `isActive=false` |
| `GET` | `/v1/cron/preview?cronExpression=&timezone=&count=` | authenticated | Pure computation — returns the next N fire times, no DB write |

```json
{
  "jobType": "report:generate",
  "payloadTemplate": { "reportType": "daily" },
  "scheduleType": "cron | delayed",
  "cronExpression": "0 9 * * *",
  "timezone": "UTC",
  "runAt": "required if scheduleType=delayed"
}
```

---

## Batches

A batch submits many jobs atomically and tracks their aggregate progress.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/queues/:id/batches` | `job:create` | Rate-limited. Body: `name?, jobs[]` (1–1000), `callbackUrl?` |
| `GET` | `/v1/batches/:id` | `job:view` | Returns `completedJobs`, `failedJobs`, `totalJobs`, `status` |

---

## Dead Letter Queue (DLQ)

Jobs that exhaust their retry budget (or throw a permanent error) land here.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/v1/queues/:id/dlq` | `dlq:view` | Unresolved DLQ entries for one queue |
| `GET` | `/v1/dlq/:id` | `dlq:view` | Includes any AI failure summary generated for it |
| `POST` | `/v1/dlq/:id/retry` | `dlq:retry` (original payload) or `dlq:edit` (body: `payload` to override) | Creates a **new** job |
| `POST` | `/v1/dlq/:id/dismiss` | `dlq:edit` | Marks the entry resolved, no new job |
| `POST` | `/v1/dlq/:id/summarize` | `dlq:view` | Generates an AI failure diagnosis — uses the Anthropic API if `ANTHROPIC_API_KEY` is set, otherwise a rule-based stub. See [DECISIONS.md](./DECISIONS.md#ai-failure-summaries) |

---

## Workers

Workers are cluster infrastructure, not tenant data — these endpoints are
platform-wide rather than scoped to an organization.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/v1/workers` | `worker:view` | Fleet list with live status |
| `GET` | `/v1/workers/:id` | `worker:view` | Detail + recent heartbeat samples |

---

## Search & Notifications

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/v1/search?q=` | bearer | Searches projects/queues/jobs the caller can see; an exact job-ID match is included even across queues |
| `GET` | `/v1/notifications?unread=true` | bearer | `unread` query param is optional |
| `POST` | `/v1/notifications/:id/read` | bearer | Marks one notification read |

---

## WebSocket Events

Connect via Socket.IO to the same origin as the API, with the access token
passed as `auth: { token }`.

| Client emits | Server emits (to the joined room) |
|---|---|
| `subscribe:job` / `unsubscribe:job` (jobId) | `job:updated` |
| `subscribe:queue` / `unsubscribe:queue` (queueId) | `queue:updated` |
| `subscribe:workers` | `worker:updated`, `dlq:new` |

Every `subscribe:*` call is membership-checked server-side before the socket
is allowed to join the room — the same tenant-isolation rule that applies to
REST endpoints applies here too.

---

**See also:** [DECISIONS.md](./DECISIONS.md) for the reasoning behind
anything above marked "see DECISIONS.md", and [SETUP.md](./SETUP.md) to run
this API locally.
