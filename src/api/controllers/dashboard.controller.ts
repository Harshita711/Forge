import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';

export const dashboardController = {
  async getForProject(req: Request, res: Response) {
    const data = await dashboardService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data, meta: {} });
  },
};