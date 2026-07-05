/*
 * Usage:
 *   npm run test:integration:setup
 *
 * Polls the Postgres and Redis TCP ports (as pointed to by DATABASE_URL /
 * REDIS_URL) until both accept connections, or exits non-zero after
 * TIMEOUT_MS. Integration tests assume a live database; `docker compose up`
 * returns as soon as containers start, not once Postgres has finished
 * initializing, so without this wait step `prisma migrate deploy` can race
 * a Postgres that isn't accepting connections yet (especially on cold pulls
 * in CI). Deliberately dependency-free — just a raw TCP connect check — so
 * this can run before `npm install` of anything Postgres/Redis-specific.
 */
import 'dotenv/config';
import net from 'node:net';

const TIMEOUT_MS = 30_000;
const RETRY_MS = 500;

function parseHostPort(url: string, fallbackPort: number): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || 'localhost', port: Number(parsed.port) || fallbackPort };
  } catch {
    return { host: 'localhost', port: fallbackPort };
  }
}

function waitForPort(host: string, port: number, label: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve();
      });

      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${label} at ${host}:${port}`));
          return;
        }
        setTimeout(attempt, RETRY_MS);
      });
    };

    attempt();
  });
}

async function main() {
  const pg = parseHostPort(process.env.DATABASE_URL ?? '', 5432);
  const redis = parseHostPort(process.env.REDIS_URL ?? '', 6379);

  console.log(`Waiting for Postgres at ${pg.host}:${pg.port}...`);
  await waitForPort(pg.host, pg.port, 'Postgres');
  console.log('Postgres is accepting connections.');

  console.log(`Waiting for Redis at ${redis.host}:${redis.port}...`);
  await waitForPort(redis.host, redis.port, 'Redis');
  console.log('Redis is accepting connections.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
