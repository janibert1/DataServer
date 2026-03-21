import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { deleteFromS3 } from '../lib/s3';
import { logger } from '../lib/logger';

export interface TrashCleanupJobData {
  // Scheduled job — no payload required, but the type must exist for the Worker generic.
  triggeredAt?: string;
}

const BATCH_SIZE = 50;
const TRASH_RETENTION_DAYS = 30;

async function purgeExpiredTrashedFiles(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  // Process in batches to avoid loading thousands of records into memory at once.
  while (true) {
    const files = await prisma.file.findMany({
      where: {
        status: 'TRASHED',
        trashedAt: { lt: cutoff },
      },
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        size: true,
        ownerId: true,
      },
      take: BATCH_SIZE,
    });

    if (files.length === 0) break;

    for (const file of files) {
      try {
        // Delete primary object from S3
        await deleteFromS3(file.storageKey);

        // Delete thumbnail if one was generated
        if (file.thumbnailKey) {
          await deleteFromS3(file.thumbnailKey).catch((err: Error) => {
            logger.warn('Trash cleanup: failed to delete thumbnail', {
              fileId: file.id,
              thumbnailKey: file.thumbnailKey,
              error: err.message,
            });
          });
        }

        // Remove DB record and adjust owner's storage usage atomically
        await prisma.$transaction([
          prisma.file.delete({ where: { id: file.id } }),
          prisma.user.update({
            where: { id: file.ownerId },
            data: {
              storageUsedBytes: {
                decrement: file.size,
              },
            },
          }),
        ]);

        totalDeleted++;
        logger.debug('Trash cleanup: file permanently deleted', {
          fileId: file.id,
          storageKey: file.storageKey,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Trash cleanup: failed to delete file', {
          fileId: file.id,
          error: message,
        });
        // Continue with next file; don't let one failure abort the batch.
      }
    }

    // If we got a full batch there may be more; loop again.
    if (files.length < BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function expireStalePasswordResets(): Promise<number> {
  // Hard-delete PasswordReset tokens that are past their expiry and have not been used.
  const result = await prisma.passwordReset.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      usedAt: null,
    },
  });
  return result.count;
}

async function expireStaleInvitations(): Promise<number> {
  // Set PENDING invitations to EXPIRED when their expiresAt has passed.
  const result = await prisma.invitation.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

async function processTrashCleanupJob(job: Job<TrashCleanupJobData>): Promise<void> {
  logger.info('Trash cleanup job started', { jobId: job.id });

  const [deletedFiles, expiredResets, expiredInvitations] = await Promise.all([
    purgeExpiredTrashedFiles(),
    expireStalePasswordResets(),
    expireStaleInvitations(),
  ]);

  logger.info('Trash cleanup job completed', {
    jobId: job.id,
    deletedFiles,
    expiredPasswordResets: expiredResets,
    expiredInvitations,
  });
}

export const trashCleanupWorker = new Worker<TrashCleanupJobData>(
  'trash-cleanup-queue',
  processTrashCleanupJob,
  {
    connection: { url: config.redis.url },
    concurrency: 1, // Only one cleanup job should run at a time
  }
);

trashCleanupWorker.on('completed', (job) => {
  logger.info('Trash cleanup job completed successfully', { jobId: job.id });
});

trashCleanupWorker.on('failed', (job, err) => {
  logger.error('Trash cleanup job failed', {
    jobId: job?.id,
    error: err.message,
  });
});
