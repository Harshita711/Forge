import { Router } from 'express';
import { organizationsController } from '../controllers/organizations.controller';
import { projectsController } from '../controllers/projects.controller';
import { retryPoliciesController } from '../controllers/retryPolicies.controller';
import { rbacController } from '../controllers/rbac.controller';
import { auditLogsController } from '../controllers/auditLogs.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requirePermission } from '../middleware/auth';

export const organizationsRoutes = Router();

organizationsRoutes.use(requireAuth);

organizationsRoutes.post('/', asyncHandler(organizationsController.create));
organizationsRoutes.get('/', asyncHandler(organizationsController.list));

organizationsRoutes.get('/:id', requirePermission('org:view', 'id'), asyncHandler(organizationsController.get));
organizationsRoutes.patch('/:id', requirePermission('org:manage', 'id'), asyncHandler(organizationsController.update));

organizationsRoutes.get(
  '/:id/members',
  requirePermission('org:view', 'id'),
  asyncHandler(organizationsController.listMembers)
);
organizationsRoutes.post(
  '/:id/members',
  requirePermission('member:invite', 'id'),
  asyncHandler(organizationsController.invite)
);
organizationsRoutes.patch(
  '/:id/members/:userId',
  requirePermission('member:change_role', 'id'),
  asyncHandler(organizationsController.changeMemberRole)
);
organizationsRoutes.delete(
  '/:id/members/:userId',
  requirePermission('member:change_role', 'id'),
  asyncHandler(organizationsController.removeMember)
);

// Nested project routes (Table 61: POST/GET /v1/organizations/:id/projects)
organizationsRoutes.post(
  '/:id/projects',
  requirePermission('project:create', 'id'),
  asyncHandler(projectsController.create)
);
organizationsRoutes.get(
  '/:id/projects',
  requirePermission('project:view', 'id'),
  asyncHandler(projectsController.list)
);

// Retry policies: not tabulated as their own endpoint group in the SDS API
// section (Section 12), but queues.default_retry_policy_id and
// jobs.retry_policy_id both FK into retry_policies, and audit_logs explicitly
// tracks "retry-policy edits" — so a CRUD surface has to exist somewhere.
// Modeled here, under the owning organization, using the same queue:manage
// permission gate as the other queue-configuration endpoints.
organizationsRoutes.post(
  '/:id/retry-policies',
  requirePermission('queue:manage', 'id'),
  asyncHandler(retryPoliciesController.create)
);
organizationsRoutes.get(
  '/:id/retry-policies',
  requirePermission('queue:view', 'id'),
  asyncHandler(retryPoliciesController.list)
);
organizationsRoutes.get(
  '/:id/retry-policies/:policyId',
  requirePermission('queue:view', 'id'),
  asyncHandler(retryPoliciesController.get)
);

// Custom roles (Section 11.6, Table 61) — gated by member:change_role, same
// as coarse role changes, since defining what a role *can* do is part of the
// same privilege as assigning who *has* it.
organizationsRoutes.post(
  '/:id/roles',
  requirePermission('member:change_role', 'id'),
  asyncHandler(rbacController.createRole)
);
organizationsRoutes.get(
  '/:id/roles',
  requirePermission('member:change_role', 'id'),
  asyncHandler(rbacController.list)
);
organizationsRoutes.get(
  '/:id/roles/:roleId',
  requirePermission('member:change_role', 'id'),
  asyncHandler(rbacController.get)
);

// Audit trail (Section 4.17) — same visibility bar as org:manage, since
// seeing who changed what is itself an admin-level capability.
organizationsRoutes.get(
  '/:id/audit-logs',
  requirePermission('org:manage', 'id'),
  asyncHandler(auditLogsController.list)
);
