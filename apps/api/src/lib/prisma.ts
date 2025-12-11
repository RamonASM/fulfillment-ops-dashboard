import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger.js';

export { Prisma };

const SLOW_QUERY_THRESHOLD_MS = 100;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

  // Log slow queries
  client.$on('query', (e) => {
    const duration = e.duration;
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow query detected', {
        query: e.query.substring(0, 200), // Truncate long queries
        params: e.params.substring(0, 100),
        duration,
        threshold: SLOW_QUERY_THRESHOLD_MS,
      });
    }
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
