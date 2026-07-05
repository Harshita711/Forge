import { Router } from 'express';
import { workersController } from '../controllers/workers.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const workersRoutes = Router();
workersRoutes.use(requireAuth);

workersRoutes.get('/', asyncHandler(workersController.list));
workersRoutes.get('/:id', asyncHandler(workersController.get));
