import { Router } from 'express';
import { dlqController } from '../controllers/dlq.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const dlqRoutes = Router();
dlqRoutes.use(requireAuth);

dlqRoutes.get('/:id', asyncHandler(dlqController.get));
dlqRoutes.post('/:id/retry', asyncHandler(dlqController.retry));
dlqRoutes.post('/:id/dismiss', asyncHandler(dlqController.dismiss));
dlqRoutes.post('/:id/summarize', asyncHandler(dlqController.summarize));
