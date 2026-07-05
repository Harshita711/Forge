/*
 * Usage:
 *   FORGE_API_URL=http://localhost:4000 FORGE_ACCESS_TOKEN=... FORGE_QUEUE_ID=... \
 *     npm run load-test -- --count 500 --concurrency 50
 *
 * Submits `count` demo:echo jobs to a queue in batches of `concurrency` at a
 * time, and reports submission latency percentiles. This exercises the same
 * POST /v1/queues/:id/jobs path a real client hits — it does not touch the
 * database directly, so it also incidentally load-tests the rate limiter
 * (Section 11.5) and the idempotency-key path if FORGE_USE_IDEMPOTENCY=1.
 */
import 'dotenv/config';

interface Args {
  count: number;
  concurrency: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? Number(args[idx + 1]) : fallback;
  };
  return { count: get('--count', 200), concurrency: get('--concurrency', 20) };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function submitOne(baseUrl: string, queueId: string, token: string, useIdempotency: boolean, i: number): Promise<number> {
  const start = Date.now();
  const res = await fetch(`${baseUrl}/v1/queues/${queueId}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(useIdempotency ? { 'Idempotency-Key': `load-test-${i}` } : {}),
    },
    body: JSON.stringify({ type: 'demo:echo', payload: { i } }),
  });
  if (!res.ok && res.status !== 429) {
    throw new Error(`Unexpected status ${res.status}: ${await res.text()}`);
  }
  return Date.now() - start;
}

async function main() {
  const { count, concurrency } = parseArgs();
  const baseUrl = process.env.FORGE_API_URL || 'http://localhost:4000';
  const token = process.env.FORGE_ACCESS_TOKEN;
  const queueId = process.env.FORGE_QUEUE_ID;
  const useIdempotency = process.env.FORGE_USE_IDEMPOTENCY === '1';

  if (!token || !queueId) {
    console.error('Set FORGE_ACCESS_TOKEN and FORGE_QUEUE_ID env vars first (log in via the API and copy a queue id).');
    process.exit(1);
  }

  console.log(`Submitting ${count} jobs to queue ${queueId} at concurrency ${concurrency}...`);
  const latencies: number[] = [];
  let rateLimited = 0;
  const startedAt = Date.now();

  for (let batchStart = 0; batchStart < count; batchStart += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, count - batchStart) }, (_, j) =>
      submitOne(baseUrl, queueId, token, useIdempotency, batchStart + j)
    );
    const results = await Promise.allSettled(batch);
    for (const r of results) {
      if (r.status === 'fulfilled') latencies.push(r.value);
      else rateLimited += 1;
    }
  }

  const totalMs = Date.now() - startedAt;
  latencies.sort((a, b) => a - b);

  console.log('\n--- Results ---');
  console.log(`Total time:        ${totalMs}ms`);
  console.log(`Successful:        ${latencies.length}/${count}`);
  console.log(`Rate-limited/err:  ${rateLimited}`);
  console.log(`Throughput:        ${(latencies.length / (totalMs / 1000)).toFixed(1)} jobs/sec`);
  console.log(`p50 latency:       ${percentile(latencies, 50)}ms`);
  console.log(`p95 latency:       ${percentile(latencies, 95)}ms`);
  console.log(`p99 latency:       ${percentile(latencies, 99)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
