# Setup Guide — Forge

Forge is three backend services (`api`, `worker`, `scheduler`) sharing one
Postgres database and one Redis instance, plus a React dashboard.

**Requirements:** Node 20+, Postgres 16, Redis 7 (local, Docker, or managed).
`binaries.prisma.sh` must be reachable for the first `prisma generate` /
`prisma migrate` — a normal one-time download on any machine with standard
internet access.

\---

## Option A — Docker Compose (recommended, full stack)

```bash
cp .env.example .env
# Fill in JWT\_ACCESS\_SECRET, e.g.: openssl rand -hex 32
# ANTHROPIC\_API\_KEY is optional — without it, POST /v1/dlq/:id/summarize
# falls back to a rule-based stub summary instead of a real AI one.
```

No `prisma/migrations/` folder is committed, so the compose `migrate`
service runs `prisma db push --skip-generate --accept-data-loss` (schema-to-
database sync) instead of `prisma migrate deploy`. No manual migration step
is needed — it just works on first boot:

```bash
docker compose up --build
```

|Service|URL|
|-|-|
|API|http://localhost:4000|
|Dashboard (nginx-served frontend build)|http://localhost:8081|
|Postgres (host-mapped)|localhost:5433|
|Redis (host-mapped)|localhost:6380|

> Note: the frontend container publishes to host port \*\*8081\*\* (see
> `docker-compose.yml`), not 8080 — check this if you've seen 8080 mentioned
> elsewhere in older notes for this project.

Seed demo data (an account plus three differently-configured queues and
sample jobs):

```bash
docker compose exec api npm run prisma:seed
# login: demo@forge.local / demo-password-123
```

Scale the worker fleet to exercise the atomic claim query and partition
locks under real concurrency:

```bash
docker compose up --scale worker=3
```

Run 2+ scheduler replicas to see leader election in practice — only one
becomes leader; watch its logs for "Acquired scheduler leadership":

```bash
docker compose up --scale scheduler=2
```

\---

## Option B — Run each service directly (no Docker)

```bash
npm install
cp .env.example .env
# fill in DATABASE\_URL, REDIS\_URL, JWT\_ACCESS\_SECRET

npx prisma migrate dev --name init   # creates + applies the migration, generates the client
npm run prisma:seed

npm run dev             # API        — http://localhost:4000
npm run dev:worker      # Worker     — run in a second terminal
npm run dev:scheduler   # Scheduler  — run in a third terminal
```

Frontend, separately:

```bash
cd frontend
npm install
npm run dev              # Dashboard — http://localhost:5173
```

\---

## Environment variables

All variables live in `.env` (see `.env.example` for the authoritative,
commented list). Summary by service:

|Variable|Used by|Notes|
|-|-|-|
|`DATABASE\_URL`|api, worker, scheduler|Postgres connection string|
|`REDIS\_URL`|api, worker, scheduler|coordination layer — locks, rate limiting, pub/sub|
|`JWT\_ACCESS\_SECRET`|api|**required, no default**|
|`JWT\_ACCESS\_TTL`|api|default `15m`|
|`REFRESH\_TOKEN\_TTL`|api|default `7d`|
|`PORT`|api|default `4000`|
|`CORS\_ALLOWED\_ORIGIN`|api|default `http://localhost:5173` (dev); set to the dashboard origin in prod|
|`LOG\_LEVEL`|api|default `info`|
|`NODE\_ENV`|api|`development` / `production`|
|`ANTHROPIC\_API\_KEY`|api|optional — enables real AI DLQ failure summaries; omit to use the rule-based stub|
|`WORKER\_CAPACITY`|worker|concurrent jobs per worker process, default `5`|
|`POLL\_INTERVAL\_MS`|worker|default `1000`|
|`HEARTBEAT\_INTERVAL\_MS`|worker|default `10000`|
|`VISIBILITY\_TIMEOUT\_SECONDS`|worker|lease duration before a claimed job is considered stalled, default `30`|
|`SHUTDOWN\_GRACE\_PERIOD\_MS`|worker|default `30000`|
|`SCHEDULER\_TICK\_MS`|scheduler|cron/delayed-promotion tick, default `500`|
|`REAPER\_TICK\_MS`|scheduler|stalled-job recovery tick, default `5000`|
|`METRICS\_TICK\_MS`|scheduler|metrics snapshot tick, default `30000`|
|`WORKER\_TIMEOUT\_MS`|scheduler|how long before a worker is marked dead, default `30000`|

\---

## Tests

```bash
npm test                          # everything; integration tests auto-skip if no DATABASE\_URL is set
npm run test:unit                 # 23 unit tests, no DB needed — fastest inner loop
npm run test:integration:setup    # spins up postgres+redis via compose, waits, syncs schema
npm run test:integration:ci       # setup + run the auth/claim integration suite in one command
```

`tests/\*.integration.test.ts` use `describe.skipIf(!hasDb)`, so `npm test`
alone never fails on a machine with no database configured — it silently
skips those two files. Use `test:integration:ci` to actually prove the
atomic-claim and auth-flow behavior against a real Postgres.

\---

## Load testing / capacity planning

```bash
# Log in via the API, grab an access token and a queue id, then:
FORGE\_ACCESS\_TOKEN=... FORGE\_QUEUE\_ID=... npm run load-test -- --count 1000 --concurrency 50

# Back-of-envelope worker fleet sizing (Erlang C), no live system required:
npm run autoscale-sim -- --arrivalRate 40 --avgServiceMs 800 --targetLatencyMs 2000
```

\---

## Demo job handlers

The worker ships four handlers purely to exercise the system end-to-end
without any external dependency:

|Type|Behavior|
|-|-|
|`demo:echo`|always succeeds, returns its payload|
|`demo:flaky`|fails twice, succeeds on the third attempt — watch retries|
|`demo:always-fail`|always throws a transient error — watch it reach the DLQ|
|`demo:permanent-fail`|throws `PermanentError` — skips retries, dead-letters immediately|

\---

## Related docs

* [`API.md`](./API.md) — every endpoint, permission required, notes on non-obvious behavior
* [`DECISIONS.md`](./DECISIONS.md) — every trade-off, deliberate gap, and what was verified to run vs. written-but-unexecuted
* `docs/Architecture diagram.png` — system diagram, service responsibilities
* `docs/ER Diagram.png` — full schema, normalization, cascade rules

