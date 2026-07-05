import { Router } from 'express';
import { rbacController } from '../controllers/rbac.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const permissionsRoutes = Router();
permissionsRoutes.use(requireAuth);
permissionsRoutes.get('/', asyncHandler(rbacController.listPermissionCatalog));
