import { Request, Response, Router } from 'express';
import { notificationsRepository } from '../repositories/notifications.repository';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const notificationsController = {
  async list(req: Request, res: Response) {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationsRepository.listForUser(req.user!.sub, unreadOnly);
    res.status(200).json({
      data: notifications.map((n: { id: string; type: string; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date }) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      meta: {},
    });
  },

  async markRead(req: Request, res: Response) {
    await notificationsRepository.markRead(req.params.id, req.user!.sub);
    res.status(204).send();
  },
};

export const notificationsRoutes = Router();
notificationsRoutes.use(requireAuth);
notificationsRoutes.get('/', asyncHandler(notificationsController.list));
notificationsRoutes.post('/:id/read', asyncHandler(notificationsController.markRead));
