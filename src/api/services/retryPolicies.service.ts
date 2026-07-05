import { AppError } from '../../domain/errors';
import { CreateRetryPolicyInput } from '../../domain/schemas';
import { retryPoliciesRepository } from '../repositories/retryPolicies.repository';

export const retryPoliciesService = {
  create(organizationId: string, input: CreateRetryPolicyInput) {
    return retryPoliciesRepository.create({ organizationId, ...input });
  },

  list(organizationId: string) {
    return retryPoliciesRepository.listForOrg(organizationId);
  },

  async getInOrg(organizationId: string, id: string) {
    const policy = await retryPoliciesRepository.findByIdInOrg(organizationId, id);
    if (!policy) throw AppError.notFound();
    return policy;
  },
};
