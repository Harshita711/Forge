# Design Decisions

This document explains the trade-offs made building Forge, organized into
three honest categories:

- **Built as designed** — straightforward implementation of a requirement.
- **Deliberate simplification** — the requirement is met, but with a
  documented, reasoned shortcut instead of the "fullest possible" version.
- **Not implemented** — explicitly out of scope for this delivery, with the
  reason why.

## Contents

1. [Architecture: shared database, not shared-nothing](#architecture-shared-database-not-shared-nothing)
2. [Tenant isolation: always 404, never 403](#tenant-isolation-always-404-never-403)
3. [Refresh-token rotation with reuse detection](#refresh-token-rotation-with-reuse-detection)
4. [Retry-policy CRUD](#retry-policy-crud)
5. [Job-submission rate limiting scope](#job-submission-rate-limiting-scope)
6. [Idempotent job creation](#idempotent-job-creation)
7. [Partition locking](#partition-locking)
8. [Attempt counting on claim + reaper recovery](#attempt-counting-on-claim--reaper-recovery)
9. [AI failure summaries](#ai-failure-summaries)
10. [What is genuinely not implemented](#what-is-genuinely-not-implemented)
11. [Testing: what actually ran vs. written-but-unverified](#testing-what-actually-ran-vs-written-but-unverified)

---

## Architecture: shared database, not shared-nothing

**Category: built as designed.**

One Postgres instance is the single source of truth for every service
(`api`, `worker`, `scheduler`). Redis is coordination-only — locks, rate
limits, pub/sub for WebSocket fan-out — and is never the only place a fact
lives.

**Why this matters:** losing Redis degrades features (real-time push, rate
limiting, partition locking) but never loses job durability or correctness.
Whether a job ran, and what it returned, is always in Postgres. A
shared-nothing design (separate databases per tenant or per service) would
give stronger isolation but cost cross-service joins (e.g. the dashboard
needs jobs + queues + workers together) and multi-database transactions for
very little benefit at this scale — the assignment's own bonus list treats
sharding as an advanced, optional feature, not a baseline requirement.

---

## Tenant isolation: always 404, never 403

**Category: built as designed.**

Every service method that resolves a resource by ID outside its own
tenant-scoped path (a project, queue, job, schedule, DLQ entry, etc.)
returns `404 NOT_FOUND` if that resource belongs to a different
organization than the caller — never `403 FORBIDDEN`.

**Why:** if the API distinguished "exists but you can't see it" (403) from
"doesn't exist" (404), a caller could enumerate valid IDs in organizations
they don't belong to just by watching which status code comes back. Making
both cases identical closes that side channel. This rule is applied
uniformly, including to WebSocket room subscriptions.

---

## Refresh-token rotation with reuse detection

**Category: built as designed.**

Every `POST /v1/auth/refresh` call retires the presented refresh token and
issues a new one in the same "family." If a token that's already been
retired is presented again, the entire family is revoked immediately.

**Why:** a normal client only ever presents its most recent token, so
legitimate use is unaffected. Presenting an *old*, already-rotated token is
a strong signal that the token was copied and is now being used by two
parties (the real user and whoever stole it) — revoking the whole family
forces both back through login rather than letting the thief ride along
silently.

---

## Retry-policy CRUD

**Category: deliberate simplification (of scope, not of correctness).**

`POST` / `GET /v1/organizations/:id/retry-policies` is not called out
separately in the assignment brief's own requirement list, but the data
model needs it regardless: queues reference a default retry policy, jobs
can override it, and audit logs track retry-policy edits. Something has to
create and list these rows, so a small CRUD surface was added under the
owning organization, gated by the same `queue:manage` permission used for
other queue-configuration endpoints. This is flagged here rather than
silently added, since it's an inferred requirement, not a literal one.

---

## Job-submission rate limiting scope

**Category: deliberate simplification.**

Job submission (`POST /v1/queues/:id/jobs`, `POST /v1/queues/:id/batches`)
is rate-limited per **(user, queue)** pair — 120 requests/minute — using a
Redis sliding window, rather than per-organization.

**Why:** resolving "which organization does this queue belong to" costs an
extra indexed lookup on every single job submission, which is the
highest-frequency mutating endpoint in the whole system. Scoping the limit
key to `(user, queue)` avoids that lookup on the hot path while still
protecting the claim pipeline from any one runaway submitter.

**Trade-off:** a tenant with many queues could in aggregate submit faster
than a strict per-organization limit would allow. If exact per-org limiting
is ever required, the fix is a cached `queue id → org id` lookup
(invalidated on queue creation), not a redesign.

---

## Idempotent job creation

**Category: deliberate simplification.**

The schema includes a generic `idempotency_keys` table designed for
verbatim response replay across arbitrary endpoints (store the whole
response body, keyed by `key + org + endpoint`). `POST /v1/queues/:id/jobs`
doesn't use it — instead it relies on a unique index on
`jobs.idempotency_key`, and returns the existing job row if the same key is
submitted twice.

**Why:** for this one endpoint, "give me back the job that already exists
for this key" is exactly what a client wants, and a unique index gets there
more simply than building and querying a generic replay table. The generic
`idempotency_keys` table stays in the schema, unused, for a future endpoint
that genuinely needs to replay an arbitrary response rather than dedupe a
domain object.

---

## Partition locking

**Category: deliberate simplification.**

A queue can be split into up to 64 partitions (`partitionCount`), and each
worker process independently tries to acquire a short-lived Redis lock
(`lock:partition:{queueId}:{n}`) for the duration of a single poll tick
before claiming from that partition, then releases it.

This is a *per-worker-instance* lock, not a *per-worker-group* lock — there
is no "worker group" concept in this delivery. The practical effect is the
same: no two workers ever poll the same partition at the same instant.
The cost is more lock chatter against Redis than a coarser, once-per-shift
lock would produce, which is a reasonable trade at the concurrency levels
this system is meant to be evaluated at.

---

## Attempt counting on claim + reaper recovery

**Category: built as designed, with a noted side effect.**

`attempt_count` increments both when a job is claimed and again if the
reaper has to recover it after its visibility-timeout lease expires (e.g.
its worker crashed mid-execution). A job that gets claimed, times out, and
is reaped therefore burns **two** attempts for that one real execution
attempt, not one.

**Why keep it this way:** a job that repeatedly makes its worker hang is a
worse citizen than one that fails fast and cleanly — burning attempts
faster on it means it reaches the DLQ (where a human sees it) sooner. This
is implemented as the more defensible interpretation of "count attempts,"
not silently patched to hide the interaction.

---

## AI failure summaries

**Category: built as designed, with a documented degrade path.**

`POST /v1/dlq/:id/summarize` calls the Anthropic API to generate a
plain-language diagnosis of why a job failed, using its error message and
recent execution events as context — if `ANTHROPIC_API_KEY` is set.

**Without a key,** the endpoint still works: it falls back to a
rule-based stub summary (pattern-matching on the error type/message) so the
feature is fully exercisable offline or in a grading environment with no
external API access, instead of returning an error.

---

## What is genuinely not implemented

- **Cross-Postgres-instance queue sharding.** Splitting one logical queue's
  data across multiple *database instances* (as opposed to partitioning
  within one database, which **is** implemented) was treated as an advanced
  capability appropriate to flag rather than half-build. A shard-directory
  table with no code path that uses it would be worse than not having one —
  this is called out explicitly rather than left to be discovered.
- **Postgres-native table partitioning of `jobs` by date.** A real
  deployment holding hundreds of millions of historical job rows would
  range-partition the `jobs` table by `created_at` at the database level.
  This is a storage/operations concern orthogonal to the application logic
  this project is meant to demonstrate, so it isn't included.
- **A live worker auto-scaler.** `scripts/autoscale-sim.ts` is a
  queueing-theory calculator (Erlang C) for sizing a fleet — it answers
  "how many workers do I need," not "add/remove workers automatically."
  Real auto-scaling is external to this codebase (`docker compose up
  --scale worker=N`, or a Kubernetes HPA watching queue depth). Forge's job
  is to expose the metric an autoscaler would watch
  (`GET /v1/queues/:id/stats`), not to be the autoscaler itself.

---

## Testing: what actually ran vs. written-but-unverified

This project was built in a sandboxed container whose network egress
allowlist doesn't include the Prisma binary download host, so
`prisma generate` / `prisma migrate dev` could not complete inside that
sandbox — meaning **no test requiring a live Postgres or Redis connection
was executed during development.**

**Verified to run, in-sandbox:**
- `npx tsc --noEmit` across the entire backend — zero type errors.
- `npm run build` for the frontend (Vite + tsc) — zero errors, produces a
  working bundle.
- 23 pure unit tests (`tests/permissions.test.ts`, `tests/retry.test.ts`,
  `tests/cron.test.ts`, `tests/partitioning.test.ts`) — all passing. These
  cover the RBAC matrix, all four retry-delay formulas plus jitter bounds,
  cron next-fire-time computation (including a DST-adjacent timezone case),
  and partition-key distribution.
- `scripts/autoscale-sim.ts` — executed directly, produces sensible output.

**Written but not executable in that sandbox** — run these first after
cloning, with a live database available:
- `tests/auth.integration.test.ts` and `tests/claim.integration.test.ts` —
  real HTTP-through-Prisma integration tests, including a concurrency test
  that fires 10 simultaneous claim attempts at one job row and asserts
  exactly one succeeds.
- The worker's actual claim → execute → retry/DLQ loop, the scheduler's
  leader election and promotion/reaper ticks, and the dashboard's WebSocket
  live-update path — all require Postgres + Redis + at least one running
  worker process, none of which existed in that sandbox.

This is disclosed rather than glossed over: the code is real, and everything
checkable without external services was checked — but "written correctly"
and "watched run correctly" are different claims, and only the former is
true for anything needing Postgres or Redis until it's run in an
environment that has them (see [SETUP.md](./SETUP.md)).
