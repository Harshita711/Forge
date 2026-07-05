import { Request, Response } from 'express';
import { LoginSchema, RegisterSchema } from '../../domain/schemas';
import { authService } from '../services/auth.service';
import { AppError } from '../../domain/errors';

const REFRESH_COOKIE = 'forge_refresh_token';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/v1/auth',
  });
}

function toUserDto(user: { id: string; email: string; fullName: string }) {
  return { id: user.id, email: user.email, fullName: user.fullName };
}

export const authController = {
  async register(req: Request, res: Response) {
    const input = RegisterSchema.parse(req.body);
    const { user, organization } = await authService.register(input);
    res.status(201).json({
      data: { user: toUserDto(user), organization: { id: organization.id, name: organization.name, slug: organization.slug } },
      meta: {},
    });
  },

  async login(req: Request, res: Response) {
    const input = LoginSchema.parse(req.body);
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await authService.login(input, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ data: { accessToken, user: toUserDto(user) }, meta: {} });
  },

  async refresh(req: Request, res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw AppError.unauthenticated('No refresh token presented');
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(presented, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ data: { accessToken }, meta: {} });
  },

  async logout(req: Request, res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) await authService.logout(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
    res.status(204).send();
  },

  async me(req: Request, res: Response) {
    const { user, organizations } = await authService.me(req.user!.sub);
    res.status(200).json({
      data: {
        user: toUserDto(user),
        organizations: organizations.map((o: { id: string; name: string; slug: string }) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
        })),
      },
      meta: {},
    });
  },

  async sessions(req: Request, res: Response) {
    const sessions = await authService.listSessions(req.user!.sub);
    res.status(200).json({
      data: sessions.map(
        (s: { id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date; expiresAt: Date }) => ({
          id: s.id,
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })
      ),
      meta: {},
    });
  },

  async revokeSession(req: Request, res: Response) {
    await authService.revokeSession(req.user!.sub, req.params.id);
    res.status(204).send();
  },
};
