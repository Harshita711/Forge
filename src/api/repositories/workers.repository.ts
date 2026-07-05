import { prisma } from '../../lib/prisma';
import { publishEvent } from '../../lib/eventBus';

export const workersRepository = {
  async registerOnStart(hostname: string, capacity: number) {
    const worker = await prisma.worker.create({ data: { hostname, capacity, status: 'online', startedAt: new Date() } });
    await publishEvent({ type: 'worker:updated', workerId: worker.id, payload: { status: 'online', hostname, capacity } });
    return worker;
  },

  async setStatus(id: string, status: 'online' | 'draining' | 'offline') {
    const worker = await prisma.worker.update({
      where: { id },
      data: { status, ...(status === 'offline' ? { stoppedAt: new Date() } : {}) },
    });
    await publishEvent({ type: 'worker:updated', workerId: id, payload: { status } });
    return worker;
  },

  async heartbeat(id: string, activeSlots: number) {
    const worker = await prisma.worker.update({ where: { id }, data: { lastHeartbeatAt: new Date(), activeSlots } });
    await publishEvent({ type: 'worker:updated', workerId: id, payload: { activeSlots, status: worker.status } });
    return worker;
  },

  recordHeartbeatSample(workerId: string, activeSlots: number) {
    return prisma.workerHeartbeat.create({ data: { workerId, activeSlots } });
  },

  findById(id: string) {
    return prisma.worker.findUnique({ where: { id } });
  },

  listForOrg() {
    // Phase 0/1 scope has no direct worker->organization FK (workers are
    // cluster-wide infrastructure, not tenant data) — the dashboard's
    // "workers" view is a platform-operator view, gated by worker:view on
    // whichever organization the caller is a member of, per Table 64.
    return prisma.worker.findMany({ orderBy: { startedAt: 'desc' } });
  },

  heartbeatHistory(workerId: string, limit = 100) {
    return prisma.workerHeartbeat.findMany({
      where: { workerId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  },

  findStale(timeoutMs: number) {
    return prisma.worker.findMany({
      where: { status: 'online', lastHeartbeatAt: { lt: new Date(Date.now() - timeoutMs) } },
    });
  },

  markOffline(ids: string[]) {
    return prisma.worker.updateMany({ where: { id: { in: ids } }, data: { status: 'offline' } });
  },
};