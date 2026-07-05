import { Router } from 'express';
import { jobsController } from '../controllers/jobs.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const jobsRoutes = Router();

jobsRoutes.use(requireAuth);

jobsRoutes.get('/:id', asyncHandler(jobsController.get));
jobsRoutes.get('/:id/events', asyncHandler(jobsController.events));
jobsRoutes.post('/:id/cancel', asyncHandler(jobsController.cancel));
jobsRoutes.post('/:id/replay', asyncHandler(jobsController.replay));
