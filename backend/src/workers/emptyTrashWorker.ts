import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { deleteFromS3 } from '../lib/s3';
import { logger } from '../lib/logger';
import { createNotification } from '../services/notificationService';
import { decrementUsageTotal } from '../services/quotaService';
import { FileStatus } from '@prisma/client';

export interface EmptyTrashJobData {
  userId: string;
}

const BATCH = 500;

async function processEmptyTrash(job: Job<EmptyTrashJobData>): Promise<void> {
  const { userId } = job.data;
  logger.info('Empty trash job started', { jobId: job.id, userId });

  // Step 1: Fetch and delete S3 objects in batches
  let totalBytes = BigInt(0);
  let fileCount = 0;

  while (true) {
    const batch = await prisma.file.findMany({
      where: { ownerId: userId, isTrashed: true, status: { not: FileStatus.DELETED } },
      select: { id: true, storageKey: true, size: true },
      take: BATCH,
    });

    if (batch.length === 0) break;

    // Delete from S3 with controlled concurrency (10 at a time)
    for (let i = 0; i < batch.length; i += 10) {
      const chunk = batch.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (file) => {
          try {
            await deleteFromS3(file.storageKey);
          } catch (err) {
            logger.error('Empty trash: failed to delete from S3', { err, storageKey: file.storageKey });
          }
          totalBytes += file.size;
        })
      );
    }

    fileCount += batch.length;

    // Delete these specific files from DB
    await prisma.file.updateMany({
      where: { id: { in: batch.map((f) => f.id) } },
      data: { status: FileStatus.DELETED, deletedAt: new Date() },
    });

    await job.updateProgress(fileCount);
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
    });
  }
});
