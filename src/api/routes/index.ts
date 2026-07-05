import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { organizationsRoutes } from './organizations.routes';
import { projectsRoutes } from './projects.routes';
import { queuesRoutes } from './queues.routes';
import { jobsRoutes } from './jobs.routes';
import { schedulesRoutes, cronRoutes } from './schedules.routes';
import { batchesRoutes } from './batches.routes';
import { dlqRoutes } from './dlq.routes';
import { workersRoutes } from './workers.routes';
import { permissionsRoutes } from './permissions.routes';
import { notificationsRoutes } from './notifications.routes';
import { searchRoutes } from './search.routes';

export const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/organizations', organizationsRoutes);
v1Router.use('/projects', projectsRoutes);
v1Router.use('/queues', queuesRoutes);
v1Router.use('/jobs', jobsRoutes);
v1Router.use('/schedules', schedulesRoutes);
v1Router.use('/cron', cronRoutes);
v1Router.use('/batches', batchesRoutes);
v1Router.use('/dlq', dlqRoutes);
v1Router.use('/workers', workersRoutes);
v1Router.use('/permissions', permissionsRoutes);
v1Router.use('/notifications', notificationsRoutes);
v1Router.use('/search', searchRoutes);
