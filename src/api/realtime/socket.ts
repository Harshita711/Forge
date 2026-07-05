import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { logger } from '../../lib/logger';
import { subscribeToEvents } from '../../lib/eventBus';
import { organizationsRepository } from '../repositories/organizations.repository';
import { jobsRepository } from '../repositories/jobs.repository';
import { queuesRepository } from '../repositories/queues.repository';

interface SocketAuthPayload {
  sub: string;
}

async function canSeeJob(jobId: string, userId: string): Promise<boolean> {
  const job = await jobsRepository.findById(jobId);
  if (!job) return false;
  const membership = await organizationsRepository.getMembership(job.queue.project.organizationId, userId);
  return !!membership;
}

async function canSeeQueue(queueId: string, userId: string): Promise<boolean> {
  const queue = await queuesRepository.findById(queueId);
  if (!queue) return false;
  const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
  return !!membership;
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173', credentials: true },
  });

  // Redis adapter (Section 3.3): required the moment there's more than one
  // API replica — without it, a client connected to replica A never sees an
  // event that only replica B received from the bus.
  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing auth token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as SocketAuthPayload;
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    logger.debug({ userId, socketId: socket.id }, 'Socket connected');

    socket.on('subscribe:job', async (jobId: string) => {
      if (await canSeeJob(jobId, userId)) socket.join(`job:${jobId}`);
    });
    socket.on('unsubscribe:job', (jobId: string) => socket.leave(`job:${jobId}`));

    socket.on('subscribe:queue', async (queueId: string) => {
      if (await canSeeQueue(queueId, userId)) socket.join(`queue:${queueId}`);
    });
    socket.on('unsubscribe:queue', (queueId: string) => socket.leave(`queue:${queueId}`));

    // Workers are platform-wide, not tenant-scoped (Section 4.11 comment) —
    // any authenticated user may subscribe, same as GET /v1/workers.
    socket.on('subscribe:workers', () => socket.join('workers'));
  });

  subscribeToEvents((event) => {
    if (event.jobId) io.to(`job:${event.jobId}`).emit('job:updated', event);
    if (event.queueId) io.to(`queue:${event.queueId}`).emit('queue:updated', event);
    if (event.workerId) io.to('workers').emit('worker:updated', event);
    if (event.type === 'dlq:new') {
      if (event.queueId) io.to(`queue:${event.queueId}`).emit('dlq:new', event);
      if (event.jobId) io.to(`job:${event.jobId}`).emit('dlq:new', event);
    }
  });

  return io;
}
