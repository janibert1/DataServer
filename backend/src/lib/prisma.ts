import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: [
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

(prisma as any).$on('error', (e: any) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

(prisma as any).$on('warn', (e: any) => {
  logger.warn('Prisma warning', { message: e.message, target: e.target });
});
