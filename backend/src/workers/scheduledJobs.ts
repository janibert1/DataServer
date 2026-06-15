import { trashCleanupQueue } from './queues';
import { prisma } from '../lib/prisma';
import { s3Client } from '../lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
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

  // ── Expired zip download cleanup — every day at 03:00 UTC ───────────────────
  try {
    const expired = await prisma.zipDownload.findMany({
      where: { expiresAt: { lt: new Date() }, storageKey: { not: null } },
      select: { id: true, storageKey: true },
    });
    for (const dl of expired) {
      if (dl.storageKey) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: dl.storageKey })).catch(() => {});
      }
      await prisma.zipDownload.delete({ where: { id: dl.id } }).catch(() => {});
    }
    if (expired.length > 0) logger.info('Cleaned up expired zip downloads', { count: expired.length });
  } catch (err) {
    logger.warn('Zip cleanup error', { err });
  }

  logger.info('Scheduled jobs registered', {
    jobs: ['trash-cleanup-daily (cron: 0 2 * * * UTC)'],
  });
}
