# Forge — Distributed Job Scheduling Platform

A production-inspired distributed job scheduler: multi-tenant queues with
configurable priority/concurrency/retry policies, immediate/delayed/
scheduled(cron)/batch job submission, an atomic-claim worker fleet with
heartbeats and graceful shutdown, full retry/DLQ handling, a leader-elected
scheduler, RBAC (coarse + custom roles), rate limiting, distributed locking,
queue partitioning, workflow (DAG) dependencies, real-time WebSocket updates,
AI-generated failure summaries, and a React dashboard — built against the
attached Forge Software Design Specification (SDS) v1.0.

## What's here

| Area | Status |
|---|---|
| Auth (JWT + rotating refresh, reuse detection) | ✅ implemented |
| Organizations / Projects / coarse RBAC | ✅ implemented |
| Custom RBAC roles | ✅ implemented |
| Queues (priority, concurrency, pause/resume, partitioning) | ✅ implemented |
| Jobs — immediate / delayed / scheduled(cron) / batch | ✅ implemented |
| Atomic claim query (`FOR UPDATE SKIP LOCKED`) | ✅ implemented |
| Worker (poll, heartbeat, lease extension, graceful shutdown) | ✅ implemented |
| Retry policies (fixed/linear/exponential/adaptive + jitter) | ✅ implemented |
| Dead Letter Queue + reaper (crash recovery) | ✅ implemented |
| Scheduler (leader election, cron promotion, metrics) | ✅ implemented |
| Workflow dependencies (DAG, cycle prevention, cascade cancel) | ✅ implemented |
| Rate limiting (Redis sliding window) | ✅ implemented |
| Distributed locking (leader election + partition locks) | ✅ implemented |
| Queue sharding across partitions (single DB) | ✅ implemented |
| Cross-Postgres-instance sharding (Section 11.3) | ⛔ not implemented — see docs/DESIGN_DECISIONS.md |
| WebSocket live updates | ✅ implemented |
| AI-generated failure summaries | ✅ implemented (Anthropic API, degrades to a rule-based stub without a key) |
| React dashboard | ✅ implemented |
| Automated tests | ✅ 23 unit tests passing; integration tests written, need a live DB to run — see below |

See `docs/DESIGN_DECISIONS.md` for the honest, detailed account of every
simplification and gap, and exactly what was and wasn't executable inside
the sandbox this was built in.

## Repository layout

```
src/
  domain/        pure logic shared by all 3 backend services: Zod schemas,
                 errors, RBAC matrix, retry-delay formulas, cron helpers,
                 partition-key hashing
  lib/           Prisma client, Pino logger, Redis client, distributed lock,
                 rate limiter, realtime event bus
  api/           the HTTP service — middleware, repositories, services,
                 controllers, routes, Socket.IO wiring
  worker/        poll loop, handler registry, execute/retry/DLQ logic,
                 graceful shutdown
  scheduler/     leader election, promotion tick, reaper tick, metrics tick
prisma/
  schema.prisma  all 22 tables (Section 4)
  seed.ts        demo account + 3 differently-configured queues + sample jobs
frontend/        React + Vite + TS + Tailwind v4 dashboard
tests/           unit tests (no DB) + integration tests (need DATABASE_URL)
scripts/         load-test.ts, autoscale-sim.ts
docs/            ARCHITECTURE.md, ER_DIAGRAM.md, API.md, DESIGN_DECISIONS.md
```

## Setup

Requires Node 20+, and a reachable Postgres 16 + Redis 7 (local, Docker, or
managed). `binaries.prisma.sh` must be reachable for the first
`prisma generate`/`migrate` — a normal one-time download on any machine
with standard internet access.

### Option A — Docker Compose (recommended, full stack)

```bash
cp .env.example .env
# fill in JWT_ACCESS_SECRET (e.g. `openssl rand -hex 32`); ANTHROPIC_API_KEY is optional
```

This repo doesn't ship a `prisma/migrations/` folder, so the compose
`migrate` service uses `prisma db push` (schema-to-database sync) instead of
`prisma migrate deploy` — no one-time manual step needed, it just works on
`docker compose up --build`:

```bash
docker compose up --build
# API:       http://localhost:4000
# Dashboard: http://localhost:8080
```

Then seed some demo data:

```bash
docker compose exec api npm run prisma:seed
# demo@forge.local / demo-password-123
```

Scale the worker fleet to see the claim query and partition locks handle
real concurrency:

```bash
docker compose up --scale worker=3
```

Run 2+ scheduler replicas to see leader election in practice — only one
becomes leader; watch its logs for "Acquired scheduler leadership":

```bash
docker compose up --scale scheduler=2
```

### Option B — Run each service directly

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET

npx prisma migrate dev --name init   # creates the migration, applies it, generates the client
npm run prisma:seed

npm run dev             # API        — http://localhost:4000
npm run dev:worker      # Worker (in a second terminal)
npm run dev:scheduler   # Scheduler (in a third terminal)

cd frontend
npm install
npm run dev              # Dashboard — http://localhost:5173
```

### Tests

```bash
npm test                    # everything; integration tests auto-skip if no DATABASE_URL is set
npm run test:unit           # unit suite only (23 tests, no DB needed) — fastest inner-loop feedback
npm run test:integration:setup   # spins up postgres+redis, waits for them, syncs schema
npm run test:integration:ci      # setup + run the auth/claim integration suite in one command
```

The integration suite (`tests/*.integration.test.ts`) uses
`describe.skipIf(!hasDb)`, so `npm test` alone never fails on a machine with
no database configured — it just silently skips those two files. Use
`test:integration:ci` when you specifically want to prove the atomic-claim
and auth-flow behavior against a real Postgres, e.g. before a submission or
in CI.

### Load testing / capacity planning

```bash
# Log in via the API, grab an access token and a queue id, then:
FORGE_ACCESS_TOKEN=... FORGE_QUEUE_ID=... npm run load-test -- --count 1000 --concurrency 50

# Back-of-envelope worker fleet sizing (Erlang C), no live system required:
npm run autoscale-sim -- --arrivalRate 40 --avgServiceMs 800 --targetLatencyMs 2000
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system diagram, service
  responsibilities, data-flow sequence diagram
- [`docs/ER_DIAGRAM.md`](docs/ER_DIAGRAM.md) — full schema, normalization,
  cascade rules, index rationale
- [`docs/API.md`](docs/API.md) — every endpoint, permission required, and
  notes on non-obvious behavior
- [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — every trade-off,
  every deliberate gap, and exactly what was verified to run vs. written but
  unexecuted in this sandbox

## Demo job types

The worker ships four handlers purely for exercising the system end-to-end
without any external dependency:

- `demo:echo` — always succeeds, returns its payload
- `demo:flaky` — fails twice, succeeds on the third attempt (watch retries)
- `demo:always-fail` — always throws a transient error (watch it reach the DLQ)
- `demo:permanent-fail` — throws `PermanentError` (skips retries, dead-letters immediately)
