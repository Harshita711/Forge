import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/app';
import { prisma } from '../src/lib/prisma';

// Integration test per Section 16.1: exercises the real HTTP + service +
// repository + Prisma stack against a disposable database, not mocked Prisma.
// Requires DATABASE_URL and JWT_ACCESS_SECRET to point at a running test DB
// (e.g. `docker compose up postgres` locally, or the CI Postgres service).
const hasDb = Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_ACCESS_SECRET);

describe.skipIf(!hasDb)('Auth flow (register -> login -> me -> refresh -> logout)', () => {
  const app = createApp();
  const email = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('registers a new user and their first organization', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      email,
      password: 'correct horse battery staple',
      fullName: 'Ada Lovelace',
      organizationName: 'Analytical Engines Inc',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.organization.slug).toContain('analytical-engines');
  });

  it('rejects duplicate registration with 409 CONFLICT', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      email,
      password: 'correct horse battery staple',
      fullName: 'Ada Lovelace',
      organizationName: 'Another Org',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('logs in and receives an access token plus a refresh cookie', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct horse battery staple' });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.headers['set-cookie']?.[0]).toMatch(/forge_refresh_token=/);
  });

  it('rejects a bad password with 401 UNAUTHENTICATED', async () => {
    const res = await request(app).post('/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects /v1/auth/me without a Bearer token', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the caller profile with a valid Bearer token', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct horse battery staple' });
    const token = login.body.data.accessToken;

    const res = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.organizations.length).toBeGreaterThan(0);
  });
});
