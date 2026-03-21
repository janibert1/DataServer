import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { uploadToS3, getObjectStream } from '../lib/s3';
import { logger } from '../lib/logger';

export interface PreviewJobData {
  fileId: string;
}

async function processPreviewJob(job: Job<PreviewJobData>): Promise<void> {
  const { fileId } = job.data;

  logger.info('Preview job started', { jobId: job.id, fileId });

  // Fetch file record from DB
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      mimeType: true,
      storageKey: true,
      thumbnailKey: true,
      status: true,
    },
  });

  if (!file) {
    logger.warn('Preview job: file not found, skipping', { fileId });
    return;
  }

  try {
    // Only generate thumbnails for images
    if (file.mimeType.startsWith('image/')) {
      let sharp: typeof import('sharp') | null = null;

      try {
        // Dynamic import so the worker degrades gracefully if sharp is absent
        sharp = (await import('sharp')).default;
      } catch {
        logger.warn('Preview job: sharp is not installed, skipping thumbnail generation', {
          fileId,
        });
      }

      if (sharp) {
        const thumbnailKey = `thumbnails/${fileId}.webp`;

        // Stream the original file from S3
        const sourceStream = await getObjectStream(file.storageKey);

        // Resize to 400 px wide, preserve aspect ratio, output as WebP
        const transformer = sharp().resize({ width: 400, withoutEnlargement: true }).webp();

        // Collect the transformed output into a Buffer
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          sourceStream.pipe(transformer);
          transformer.on('data', (chunk: Buffer) => chunks.push(chunk));
          transformer.on('end', resolve);
          transformer.on('error', reject);
          sourceStream.on('error', reject);
        });

        const thumbnailBuffer = Buffer.concat(chunks);

        // Upload thumbnail to S3
        await uploadToS3(thumbnailKey, thumbnailBuffer, 'image/webp');

        // Persist the thumbnail key in the DB
        await prisma.file.update({
          where: { id: fileId },
          data: {
            thumbnailKey,
            status: 'ACTIVE',
          },
        });

        logger.info('Preview job: thumbnail generated and uploaded', { fileId, thumbnailKey });
        return;
      }
    }

    // Non-image files (or sharp unavailable): just mark as ACTIVE
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'ACTIVE' },
    });

    logger.info('Preview job: file marked ACTIVE (no thumbnail)', { fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Preview job failed', { fileId, error: message });

    // Mark file as PROCESSING so an operator can investigate;
    // using UPLOADING signals it is not ready and avoids a non-existent enum value.
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'PROCESSING' },
    }).catch((dbErr) => {
      logger.error('Preview job: failed to update file status after error', {
        fileId,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    });

    throw error; // Re-throw so BullMQ records the job as failed
  }
}

export const previewWorker = new Worker<PreviewJobData>(
  'preview-queue',
  processPreviewJob,
  {
    connection: { url: config.redis.url },
    concurrency: 3,
  }
);

previewWorker.on('completed', (job) => {
  logger.info('Preview job completed', { jobId: job.id, fileId: job.data.fileId });
});

previewWorker.on('failed', (job, err) => {
  logger.error('Preview job failed permanently', {
    jobId: job?.id,
    fileId: job?.data.fileId,
    error: err.message,
  });
});
