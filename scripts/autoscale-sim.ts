/*
 * Usage: npm run autoscale-sim -- --arrivalRate 40 --avgServiceMs 800 --targetLatencyMs 2000
 *
 * A queueing-theory sanity check, not a live integration: models Forge's
 * claim-and-execute loop as an M/M/c queue (Poisson arrivals, c parallel
 * servers = total worker capacity across the fleet) and reports the minimum
 * worker capacity needed to keep expected wait time under a target latency.
 * This is the kind of back-of-envelope math that should inform a real
 * HorizontalPodAutoscaler target, not a replacement for one — Forge itself
 * doesn't ship a live autoscaler; workers are scaled externally by
 * `docker compose up --scale worker=N` or a Kubernetes HPA watching queue
 * depth (Section 17.2/17.4).
 */

interface Args {
  arrivalRate: number; // jobs/sec arriving
  avgServiceMs: number; // avg time to execute one job
  targetLatencyMs: number; // max acceptable expected wait time
  maxCapacityToTry: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? Number(args[idx + 1]) : fallback;
  };
  return {
    arrivalRate: get('--arrivalRate', 20),
    avgServiceMs: get('--avgServiceMs', 500),
    targetLatencyMs: get('--targetLatencyMs', 2000),
    maxCapacityToTry: get('--maxCapacity', 200),
  };
}

// Erlang C formula for expected wait time in an M/M/c queue.
function erlangCWaitMs(arrivalRate: number, serviceRate: number, servers: number): number {
  const a = arrivalRate / serviceRate; // offered load (Erlangs)
  if (a >= servers) return Infinity; // unstable — arrivals outpace total service capacity

  let sum = 0;
  for (let k = 0; k < servers; k += 1) {
    sum += a ** k / factorial(k);
  }
  const lastTerm = a ** servers / (factorial(servers) * (1 - a / servers));
  const erlangC = lastTerm / (sum + lastTerm);

  const avgWaitSeconds = erlangC / (servers * serviceRate - arrivalRate);
  return avgWaitSeconds * 1000;
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function main() {
  const { arrivalRate, avgServiceMs, targetLatencyMs, maxCapacityToTry } = parseArgs();
  const serviceRate = 1000 / avgServiceMs; // jobs/sec one server can do

  console.log(`Arrival rate:        ${arrivalRate} jobs/sec`);
  console.log(`Avg service time:    ${avgServiceMs}ms/job (${serviceRate.toFixed(2)} jobs/sec/worker)`);
  console.log(`Target expected wait: <${targetLatencyMs}ms\n`);
  console.log('capacity | expected wait (ms) | utilization');
  console.log('---------|--------------------|--------------');

  let recommended: number | null = null;
  for (let c = Math.ceil(arrivalRate / serviceRate) + 1; c <= maxCapacityToTry; c += 1) {
    const wait = erlangCWaitMs(arrivalRate, serviceRate, c);
    const utilization = arrivalRate / (c * serviceRate);
    if (c <= Math.ceil(arrivalRate / serviceRate) + 10 || (recommended === null && wait <= targetLatencyMs)) {
      console.log(`${String(c).padEnd(8)} | ${wait === Infinity ? 'unstable' : wait.toFixed(0).padEnd(18)} | ${(utilization * 100).toFixed(0)}%`);
    }
    if (recommended === null && wait <= targetLatencyMs) {
      recommended = c;
      break;
    }
  }

  if (recommended) {
    console.log(`\nRecommended total worker capacity (sum of every worker's WORKER_CAPACITY): ${recommended}`);
    console.log(`e.g. ${Math.ceil(recommended / 5)} worker replicas at WORKER_CAPACITY=5`);
  } else {
    console.log(`\nNo capacity under ${maxCapacityToTry} servers meets the target — arrival rate may exceed sustainable throughput.`);
  }
}

main();
