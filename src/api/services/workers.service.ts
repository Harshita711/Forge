import { AppError } from '../../domain/errors';
import { workersRepository } from '../repositories/workers.repository';

export const workersService = {
  list() {
    return workersRepository.listForOrg();
  },

  async get(id: string) {
    const worker = await workersRepository.findById(id);
    if (!worker) throw AppError.notFound();
    const heartbeats = await workersRepository.heartbeatHistory(id, 50);
    return { worker, heartbeats };
  },
};
