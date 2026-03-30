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

  // Step 1: Fetch all trashed files and delete from S3 in parallel batches
  let cursor: string | undefined;
  let totalBytes = BigInt(0);
  let fileCount = 0;

  while (true) {
    const files = await prisma.file.findMany({
      where: { ownerId: userId, isTrashed: true },
      select: { id: true, storageKey: true, size: true },
      take: BATCH,
      ...(cursor ? { skip: 1, where: { ownerId: userId, isTrashed: true, id: { gt: cursor } } } : {}),
    });

    if (files.length === 0) break;

    // Delete from S3 in parallel (with concurrency limit)
    await Promise.all(
      files.map(async (file) => {
        try {
          await deleteFromS3(file.storageKey);
        } catch (err) {
          logger.error('Empty trash: failed to delete from S3', { err, storageKey: file.storageKey });
        }
        totalBytes += file.size;
        fileCount++;
      })
    );

    cursor = files[files.length - 1].id;

    // Update progress
    job.progress(fileCount);
  }

  // Step 2: Batch DB updates — mark files as DELETED
  let dbDeleted = 0;
  cursor = undefined;

  while (true) {
    const files = await prisma.file.findMany({
      where: { ownerId: userId, isTrashed: true },
      select: { id: true },
      take: BATCH,
      ...(cursor ? { skip: 1, where: { ownerId: userId, isTrashed: true, id: { gt: cursor } } } : {}),
    });

    if (files.length === 0) break;

    await prisma.file.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { status: FileStatus.DELETED, deletedAt: new Date() },
    });

    dbDeleted += files.length;
    cursor = files[files.length - 1].id;
  }

  // Step 3: Permanently delete trashed folders
  const folderResult = await prisma.folder.updateMany({
    where: { ownerId: userId, isTrashed: true },
    data: { deletedAt: new Date() },
  });

  // Step 4: Decrement storage usage
  await decrementUsageTotal(userId, totalBytes);

  // Step 5: Create in-app notification
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
    concurrency: 1, // Only one empty-trash job per user should run at a time
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

  // Notify user of failure
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
