import { trashCleanupQueue } from './queues';
import { logger } from '../lib/logger';

/**
 * Registers all recurring (cron-based) jobs into their respective queues.
 *
 * BullMQ deduplicates repeat jobs by their `key` (jobId), so calling this
 * function multiple times on restart is safe — existing schedules are reused.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  // ── Trash cleanup — every day at 02:00 UTC ─────────────────────────────────
  await trashCleanupQueue.add(
    'trash-cleanup-scheduled',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        pattern: '0 2 * * *', // cron: 02:00 every day
        tz: 'UTC',
      },
      jobId: 'trash-cleanup-daily', // stable ID prevents duplicate schedules on restart
    }
  );

  logger.info('Scheduled jobs registered', {
    jobs: ['trash-cleanup-daily (cron: 0 2 * * * UTC)'],
  });
}
