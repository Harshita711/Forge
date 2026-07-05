import { Router } from 'express';
import { jobBatchesController } from '../controllers/jobBatches.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const batchesRoutes = Router();
batchesRoutes.use(requireAuth);

batchesRoutes.get('/:id', asyncHandler(jobBatchesController.get));
