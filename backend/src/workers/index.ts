import { logger } from '../lib/logger';

// Queue instances (imported so they are initialised before workers start)
export { previewQueue, virusScanQueue, trashCleanupQueue, notificationQueue } from './queues';

// Worker instances
import { previewWorker } from './previewWorker';
import { virusScanWorker } from './virusScanWorker';
import { trashCleanupWorker } from './trashCleanupWorker';
import { notificationWorker } from './notificationWorker';

// Re-export workers for callers that need direct access
export { previewWorker, virusScanWorker, trashCleanupWorker, notificationWorker };

// Scheduled / recurring job registration
export { scheduleRecurringJobs } from './scheduledJobs';

// Job data types
export type { PreviewJobData } from './previewWorker';
export type { VirusScanJobData } from './virusScanWorker';
export type { TrashCleanupJobData } from './trashCleanupWorker';
export type { NotificationJobData } from './notificationWorker';

const ALL_WORKERS = [previewWorker, virusScanWorker, trashCleanupWorker, notificationWorker];

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
