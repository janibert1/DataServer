import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { deleteMultipleFromS3 } from '../lib/s3';
import { logger } from '../lib/logger';
import { createNotification } from '../services/notificationService';
import { decrementUsageTotal } from '../services/quotaService';
import { FileStatus } from '@prisma/client';

export interface EmptyTrashJobData {
  userId: string;
}

const BATCH = 5000;

async function processEmptyTrash(job: Job<EmptyTrashJobData>): Promise<void> {
  const { userId } = job.data;
  logger.info('Empty trash job started', { jobId: job.id, userId });

  // Step 1: Mark files as DELETED in DB first (removes them from UI immediately),
  // then batch-delete from S3. If interrupted and restarted, already-DELETED files
  // are skipped by the where clause, and S3 DeleteObjects is idempotent for missing keys.
  let totalBytes = BigInt(0);
  let fileCount = 0;

  while (true) {
    const batch = await prisma.file.findMany({
      where: { ownerId: userId, isTrashed: true, status: { not: FileStatus.DELETED } },
      select: { id: true, storageKey: true, size: true },
      take: BATCH,
    });

    if (batch.length === 0) break;

    // Mark as DELETED in DB first so files disappear from UI immediately
    await prisma.file.updateMany({
      where: { id: { in: batch.map((f) => f.id) } },
      data: { status: FileStatus.DELETED, deletedAt: new Date() },
    });

    // Batch-delete from S3 (up to 1000 objects per API call)
    const storageKeys = batch.map((f) => f.storageKey);
    try {
      await deleteMultipleFromS3(storageKeys);
    } catch (err) {
      logger.error('Empty trash: batch S3 delete failed', { err, count: storageKeys.length });
      // Files are already marked DELETED in DB; S3 orphans will be caught by lifecycle rules
    }

    for (const file of batch) {
      totalBytes += file.size;
    }
    fileCount += batch.length;

    await job.updateProgress(fileCount);
    logger.info('Empty trash progress', { jobId: job.id, filesDeleted: fileCount });
  }

  // Step 2: Permanently delete trashed folders
  const folderResult = await prisma.folder.updateMany({
    where: { ownerId: userId, isTrashed: true },
    data: { deletedAt: new Date() },
  });

  // Step 3: Decrement storage usage
  await decrementUsageTotal(userId, totalBytes);

  // Step 4: Create in-app notification
  const folderCount = folderResult.count;
  await createNotification({
    userId,
    type: 'TASK_COMPLETED',
    title: 'Trash emptied',
    body: `Permanently deleted ${fileCount} file${fileCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}.`,
    link: '/drive/trash',
  });

  logger.info('Empty trash job completed', {
    jobId: job.id,
    userId,
    filesDeleted: fileCount,
    foldersDeleted: folderCount,
    bytesFreed: totalBytes.toString(),
  });
}

export const emptyTrashWorker = new Worker<EmptyTrashJobData>(
  'empty-trash-queue',
  processEmptyTrash,
  {
    connection: { url: config.redis.url },
    concurrency: 1,
    lockDuration: 300000, // 5 minutes — prevents stalling on large trash operations
  }
);

emptyTrashWorker.on('completed', (job) => {
  logger.info('Empty trash job completed successfully', { jobId: job.id });
});

emptyTrashWorker.on('failed', (job, err) => {
  const userId = job?.data?.userId ?? 'unknown';
  logger.error('Empty trash job failed', {
    jobId: job?.id,
    userId,
    error: err.message,
  });

  if (userId && userId !== 'unknown') {
    createNotification({
      userId,
      type: 'TASK_COMPLETED',
      title: 'Empty trash failed',
      body: 'There was a problem emptying your trash. Please try again.',
      link: '/drive/trash',
    }).catch((notifErr) => {
      logger.error('Failed to send empty-trash failure notification', { notifErr });
    });
  }
});
