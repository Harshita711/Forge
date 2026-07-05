import argon2 from 'argon2';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../domain/errors';
import { RegisterInput, LoginInput } from '../../domain/schemas';
import { usersRepository } from '../repositories/users.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { refreshTokensRepository } from '../repositories/refreshTokens.repository';
import { signAccessToken } from '../middleware/auth';

// Argon2id, OWASP-recommended baseline parameters (Section 14.3, Table 72).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const REFRESH_TOKEN_TTL_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string, familyId: string, ctx: { userAgent?: string; ip?: string }) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await refreshTokensRepository.create({
    userId,
    tokenHash: hashToken(rawToken),
    familyId,
    expiresAt,
    userAgent: ctx.userAgent ?? null,
    ipAddress: ctx.ip ?? null,
  });
  return { rawToken, expiresAt };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await usersRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('An account with this email already exists');
    }
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    const user = await usersRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
    });
    const organization = await organizationsRepository.createWithOwner(input.organizationName, user.id);
    return { user, organization };
  },

  async login(input: LoginInput, ctx: { userAgent?: string; ip?: string }) {
    const user = await usersRepository.findByEmail(input.email);
    if (!user || !user.isActive) {
      throw AppError.unauthenticated('Invalid email or password');
    }
    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw AppError.unauthenticated('Invalid email or password');
    }
    await usersRepository.touchLastLogin(user.id);

    const orgs = await organizationsRepository.listForUser(user.id);
    const accessToken = signAccessToken({ sub: user.id, orgIds: orgs.map((o: { id: string }) => o.id) });
    const familyId = uuidv4();
    const { rawToken, expiresAt } = await issueRefreshToken(user.id, familyId, ctx);

    return { user, accessToken, refreshToken: rawToken, refreshTokenExpiresAt: expiresAt };
  },

  // Refresh-rotation-with-reuse-detection (Figure 14.1). Every call retires the
  // presented token and issues a new one in the same family; a token presented
  // twice signals theft and revokes the whole family.
  async refresh(presentedToken: string, ctx: { userAgent?: string; ip?: string }) {
    const row = await refreshTokensRepository.findByTokenHash(hashToken(presentedToken));
    if (!row || row.expiresAt < new Date()) {
      throw AppError.unauthenticated('Refresh token invalid or expired');
    }
    if (row.revoked) {
      await refreshTokensRepository.revokeFamily(row.familyId);
      throw AppError.unauthenticated('Refresh token reuse detected — session terminated');
    }
    await refreshTokensRepository.revokeById(row.id);

    const user = await usersRepository.findById(row.userId);
    if (!user || !user.isActive) {
      throw AppError.unauthenticated();
    }
    const orgs = await organizationsRepository.listForUser(user.id);
    const accessToken = signAccessToken({ sub: user.id, orgIds: orgs.map((o: { id: string }) => o.id) });
    const { rawToken, expiresAt } = await issueRefreshToken(user.id, row.familyId, ctx);

    return { accessToken, refreshToken: rawToken, refreshTokenExpiresAt: expiresAt };
  },

  async logout(presentedToken: string) {
    const row = await refreshTokensRepository.findByTokenHash(hashToken(presentedToken));
    if (row) {
      await refreshTokensRepository.revokeFamily(row.familyId);
    }
  },

  async me(userId: string) {
    const user = await usersRepository.findById(userId);
    if (!user) throw AppError.unauthenticated();
    const orgs = await organizationsRepository.listForUser(userId);
    return { user, organizations: orgs };
  },

  listSessions(userId: string) {
    return refreshTokensRepository.listActiveForUser(userId);
  },

  async revokeSession(userId: string, sessionId: string) {
    const sessions = await refreshTokensRepository.listActiveForUser(userId);
    const owned = sessions.find((s: { id: string }) => s.id === sessionId);
    if (!owned) {
      // Not distinguishing "not yours" from "doesn't exist" (Section 14.1 pattern).
      throw AppError.notFound('Session not found');
    }
    await refreshTokensRepository.revokeById(sessionId);
  },
};
