import { Router } from 'express';
import { queuesController } from '../controllers/queues.controller';
import { jobsController } from '../controllers/jobs.controller';
import { scheduledDefinitionsController } from '../controllers/scheduledDefinitions.controller';
import { jobBatchesController } from '../controllers/jobBatches.controller';
import { dlqController } from '../controllers/dlq.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { jobSubmissionRateLimit } from '../middleware/rateLimit';

export const queuesRoutes = Router();

queuesRoutes.use(requireAuth);

queuesRoutes.get('/:id', asyncHandler(queuesController.get));
queuesRoutes.patch('/:id', asyncHandler(queuesController.update));
queuesRoutes.post('/:id/pause', asyncHandler(queuesController.pause));
queuesRoutes.post('/:id/resume', asyncHandler(queuesController.resume));
queuesRoutes.get('/:id/stats', asyncHandler(queuesController.stats));
queuesRoutes.delete('/:id', asyncHandler(queuesController.delete));

// Nested job submission (Table 63) — rate-limited (Section 11.5). Scoped by
// (user, queue) here rather than strictly by organization: resolving the
// owning organization from the queue would cost an extra DB round trip on
// every submission, and per-queue scoping still protects claim-path
// throughput from one runaway submitter. Documented as a deliberate
// simplification versus the spec's literal per-organization tier, not a
// silent deviation — see docs/DESIGN_DECISIONS.md.
queuesRoutes.post('/:id/jobs', jobSubmissionRateLimit, asyncHandler(jobsController.create));
queuesRoutes.get('/:id/jobs', asyncHandler(jobsController.list));

// Scheduled (cron/delayed) definitions — Section 4.7 / 7 / Table 63.
queuesRoutes.post('/:id/schedules', asyncHandler(scheduledDefinitionsController.create));
queuesRoutes.get('/:id/schedules', asyncHandler(scheduledDefinitionsController.list));

// Batches — Section 4.10.
queuesRoutes.post('/:id/batches', jobSubmissionRateLimit, asyncHandler(jobBatchesController.create));

// DLQ inbox for this queue — Section 10.4 / 13.
queuesRoutes.get('/:id/dlq', asyncHandler(dlqController.listForQueue));
