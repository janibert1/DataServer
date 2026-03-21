import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { ensureBucketExists } from './lib/s3';
import { config } from './config';
import { logger } from './lib/logger';
import { startWorkers, stopWorkers } from './workers';

async function main() {
  logger.info('Starting DataServer backend...', { env: config.nodeEnv, port: config.port });

  // Connect to Redis
  await redis.ping();
  logger.info('Redis connected');

  // Test database connection
  await prisma.$connect();
  logger.info('Database connected');

  // Ensure S3 bucket exists
  await ensureBucketExists();

  // Start background workers
  await startWorkers();
  logger.info('Background workers started');

  // Create and start Express app
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`DataServer listening on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await stopWorkers();
      await prisma.$disconnect();
      await redis.quit();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Force shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
