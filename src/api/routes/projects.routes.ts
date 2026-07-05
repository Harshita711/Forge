import { Router } from 'express';
import { projectsController } from '../controllers/projects.controller';
import { queuesController } from '../controllers/queues.controller';
import { dashboardController } from '../controllers/dashboard.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const projectsRoutes = Router();

projectsRoutes.use(requireAuth);

// No organization in the path — the service resolves it from the project row
// and re-checks membership itself (Section 14.1), same effect as requirePermission
// but the permission check happens inside the service since the org isn't known
// until after the first lookup.
projectsRoutes.get('/:id', asyncHandler(projectsController.get));
projectsRoutes.patch('/:id', asyncHandler(projectsController.update));
projectsRoutes.delete('/:id', asyncHandler(projectsController.delete));

// Nested queue creation/listing (Table 62). Permission (queue:create /
// queue:view) is enforced inside projectsService.getForUser's caller chain
// via the same membership lookup used for project reads/writes.
projectsRoutes.post('/:id/queues', asyncHandler(queuesController.create));
projectsRoutes.get('/:id/queues', asyncHandler(queuesController.list));

// Live-aggregated project dashboard (Section 13) — see dashboard.service.ts.
projectsRoutes.get('/:id/dashboard', asyncHandler(dashboardController.getForProject));