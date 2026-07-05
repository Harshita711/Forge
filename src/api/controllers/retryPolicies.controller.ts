import { Request, Response } from 'express';
import { CreateRetryPolicySchema } from '../../domain/schemas';
import { retryPoliciesService } from '../services/retryPolicies.service';

function toDto(p: {
  id: string;
  name: string;
  strategy: string;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  maxAttempts: number;
  jitter: boolean;
}) {
  return {
    id: p.id,
    name: p.name,
    strategy: p.strategy,
    baseDelaySeconds: p.baseDelaySeconds,
    maxDelaySeconds: p.maxDelaySeconds,
    maxAttempts: p.maxAttempts,
    jitter: p.jitter,
  };
}

export const retryPoliciesController = {
  async create(req: Request, res: Response) {
    const input = CreateRetryPolicySchema.parse(req.body);
    const policy = await retryPoliciesService.create(req.params.id, input);
    res.status(201).json({ data: toDto(policy), meta: {} });
  },

  async list(req: Request, res: Response) {
    const policies = await retryPoliciesService.list(req.params.id);
    res.status(200).json({ data: policies.map(toDto), meta: {} });
  },

  async get(req: Request, res: Response) {
    const policy = await retryPoliciesService.getInOrg(req.params.id, req.params.policyId);
    res.status(200).json({ data: toDto(policy), meta: {} });
  },
};
