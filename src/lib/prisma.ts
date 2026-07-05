import { PrismaClient } from '@prisma/client';

// Single shared Prisma client per process. All three services (API, Scheduler,
// Worker — Section 2.7) import from here so connection pooling is centralized.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
