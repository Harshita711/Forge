import { Router } from 'express';
import { scheduledDefinitionsController } from '../controllers/scheduledDefinitions.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const schedulesRoutes = Router();
schedulesRoutes.use(requireAuth);

schedulesRoutes.get('/:id', asyncHandler(scheduledDefinitionsController.get));
schedulesRoutes.patch('/:id', asyncHandler(scheduledDefinitionsController.update));
schedulesRoutes.delete('/:id', asyncHandler(scheduledDefinitionsController.delete));

export const cronRoutes = Router();
cronRoutes.use(requireAuth);
cronRoutes.get('/preview', asyncHandler(scheduledDefinitionsController.preview));
