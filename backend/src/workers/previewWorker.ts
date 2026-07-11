import { Worker, Job } from 'bullmq';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { uploadToS3 } from '../lib/s3';
import { getObjectStreamWithCache as getObjectStream } from '../lib/cache';
import { logger } from '../lib/logger';

export interface PreviewJobData {
  fileId: string;
}

// Remuxes any video into a standard ISO-BMFF MP4 container (moov-before-mdat,
// i.e. "faststart") for the *preview* stream. Two real-world containers cause
// silent, errorless playback failure in Chromium even when the codec inside
// is one Chrome fully supports: (1) the moov atom trailing at EOF instead of
// up front, and (2) QuickTime's own ftyp brand ("qt  ") -- Chromium's demuxer
// won't reliably read either even though Safari/AVFoundation handles both
// fine. `-c copy` is a pure container rewrite (no re-encode), so this is fast
// and lossless for the already-compatible-codec case; incompatible codecs
// (e.g. HEVC, ProRes) aren't fixed by this and will still fail to play --
// that's a separate, unaddressed problem.
async function remuxVideoPreview(fileId: string, storageKey: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const srcPath = path.join(tmpDir, `preview-src-${fileId}`);
  const outPath = path.join(tmpDir, `preview-out-${fileId}.mp4`);

  try {
    const sourceStream = await getObjectStream(storageKey);
    await pipeline(sourceStream, fs.createWriteStream(srcPath));

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', srcPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-f', 'mp4',
        outPath,
      ]);
      let stderr = '';
      ff.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      });
    });

    const previewKey = `previews/${fileId}.mp4`;
    await uploadToS3(previewKey, fs.createReadStream(outPath), 'video/mp4');
    return previewKey;
  } finally {
    await fs.promises.rm(srcPath, { force: true });
    await fs.promises.rm(outPath, { force: true });
  }
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

    if (file.mimeType.startsWith('video/')) {
      const previewKey = await remuxVideoPreview(fileId, file.storageKey);

      await prisma.file.update({
        where: { id: fileId },
        data: {
          previewKey,
          status: 'ACTIVE',
        },
      });

      logger.info('Preview job: video remuxed to MP4 and uploaded', { fileId, previewKey });
      return;
    }

    // Other file types: just mark as ACTIVE
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'ACTIVE' },
    });

    logger.info('Preview job: file marked ACTIVE (no thumbnail)', { fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Preview job failed', { fileId, error: message });

    // The file itself is already fully uploaded and ACTIVE by the time this
    // job runs (the upload route sets that before enqueueing) -- a thumbnail
    // failure (e.g. an unsupported codec like HEIC without libheif) should
    // never downgrade a working file's status. Previously this set status to
    // PROCESSING unconditionally, which meant any file whose thumbnail job
    // failed permanently (after BullMQ exhausts retries) was left looking
    // stuck/uploading forever, even though the file was perfectly usable.
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'ACTIVE' },
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
    // Caps thumbnail generation at ~5/sec regardless of how many jobs are
    // queued -- protects live traffic from a large backfill (or a bulk
    // upload) saturating CPU/S3 with image-processing work.
    limiter: { max: 5, duration: 1000 },
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
