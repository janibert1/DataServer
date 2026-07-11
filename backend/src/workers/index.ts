import { logger } from '../lib/logger';

// Queue instances (imported so they are initialised before workers start)
export { previewQueue, virusScanQueue, trashCleanupQueue, notificationQueue, zipQueue, cacheFlushQueue } from './queues';

// Worker instances
import { previewWorker } from './previewWorker';
import { virusScanWorker } from './virusScanWorker';
import { trashCleanupWorker } from './trashCleanupWorker';
import { notificationWorker } from './notificationWorker';
import { emptyTrashWorker } from './emptyTrashWorker';
import { aiSortWorker } from './aiSortWorker';
import { zipWorker } from './zipWorker';
import { driveOpsWorker } from './driveOpsWorker';
import { cacheFlushWorker } from './cacheFlushWorker';

// Re-export workers for callers that need direct access
export { previewWorker, virusScanWorker, trashCleanupWorker, notificationWorker, emptyTrashWorker, aiSortWorker, zipWorker, driveOpsWorker, cacheFlushWorker };

// Scheduled / recurring job registration
export { scheduleRecurringJobs } from './scheduledJobs';

// Job data types
export type { PreviewJobData } from './previewWorker';
export type { VirusScanJobData } from './virusScanWorker';
export type { TrashCleanupJobData } from './trashCleanupWorker';
export type { NotificationJobData } from './notificationWorker';
export type { EmptyTrashJobData } from './emptyTrashWorker';
export type { AiSortJobData } from './aiSortWorker';
export type { ZipJobData } from './zipWorker';
export type { DriveOpsJobData } from './driveOpsWorker';
export type { CacheFlushJobData } from './cacheFlushWorker';

const ALL_WORKERS = [previewWorker, virusScanWorker, trashCleanupWorker, notificationWorker, emptyTrashWorker, aiSortWorker, zipWorker, driveOpsWorker, cacheFlushWorker];

/**
 * Starts all BullMQ workers and registers recurring scheduled jobs.
 *
 * Workers begin polling their queues as soon as they are instantiated (which
 * happens on module import), so this function primarily handles scheduling and
 * logging.  Call it once during application startup.
 */
export async function startWorkers(): Promise<void> {
  const { scheduleRecurringJobs } = await import('./scheduledJobs');

  await scheduleRecurringJobs();

  // Re-queue any cached uploads that were never confirmed flushed to S3 (e.g.
  // the process crashed mid-flush) — otherwise they'd sit in the cache forever.
  const { getPendingFlushKeys } = await import('../lib/cache');
  const { cacheFlushQueue } = await import('./queues');
  const pending = await getPendingFlushKeys();
  for (const key of pending) {
    await cacheFlushQueue.add('flush', { key });
  }
  if (pending.length > 0) {
    logger.info('Re-queued pending cache flushes on startup', { count: pending.length });
  }

  logger.info('All workers started', {
    workers: ALL_WORKERS.map((w) => w.name),
  });
}

/**
 * Gracefully shuts down all BullMQ workers.
 *
 * Each worker is given time to finish its current job before closing.
 * Call this during process shutdown (SIGTERM / SIGINT).
 */
export async function stopWorkers(): Promise<void> {
  logger.info('Stopping all workers…');

  await Promise.allSettled(ALL_WORKERS.map((w) => w.close()));

  logger.info('All workers stopped');
}
