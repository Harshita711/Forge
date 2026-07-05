import { Request, Response } from 'express';
import { workersService } from '../services/workers.service';

function toDto(w: {
  id: string;
  hostname: string;
  status: string;
  capacity: number;
  activeSlots: number;
  lastHeartbeatAt: Date | null;
  startedAt: Date;
  stoppedAt: Date | null;
}) {
  return {
    id: w.id,
    hostname: w.hostname,
    status: w.status,
    capacity: w.capacity,
    activeSlots: w.activeSlots,
    lastHeartbeatAt: w.lastHeartbeatAt,
    startedAt: w.startedAt,
    stoppedAt: w.stoppedAt,
  };
}

export const workersController = {
  async list(_req: Request, res: Response) {
    const workers = await workersService.list();
    res.status(200).json({ data: workers.map(toDto), meta: {} });
  },

  async get(req: Request, res: Response) {
    const { worker, heartbeats } = await workersService.get(req.params.id);
    res.status(200).json({
      data: {
        ...toDto(worker),
        recentHeartbeats: heartbeats.map((h: { activeSlots: number; cpuPercent: number | null; memoryMb: number | null; recordedAt: Date }) => ({
          activeSlots: h.activeSlots,
          cpuPercent: h.cpuPercent,
          memoryMb: h.memoryMb,
          recordedAt: h.recordedAt,
        })),
      },
      meta: {},
    });
  },
};
