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
import { isRawImageMimeType } from '../lib/mimeResolve';

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

// Camera RAW formats (NEF/CR2/ARW/DNG/...) aren't image formats libvips can
// decode at all -- full RAW demosaicing needs a dedicated decoder (LibRaw)
// and is overkill for a thumbnail/preview anyway. Every mainstream camera
// already embeds a full-size-or-close JPEG preview in the RAW file for
// exactly this purpose (it's what the camera's own LCD and every RAW-aware
// photo app use for fast previews) -- exiftool -b extracts it directly, no
// demosaic needed. Tries the biggest tag first, falls back down.
async function extractRawEmbeddedPreview(sourceBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const srcPath = path.join(tmpDir, `raw-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.writeFile(srcPath, sourceBuffer);
  try {
    for (const tag of ['-JpgFromRaw', '-PreviewImage', '-ThumbnailImage']) {
      const extracted = await new Promise<Buffer | null>((resolve) => {
        const chunks: Buffer[] = [];
        const proc = spawn('exiftool', ['-b', tag, srcPath]);
        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        proc.on('error', () => resolve(null));
        proc.on('close', (code) => {
          const out = Buffer.concat(chunks);
          // A real embedded JPEG is at minimum several KB -- guards against
          // exiftool's empty-but-zero-exit-code output when a tag is absent.
          resolve(code === 0 && out.length > 1000 ? out : null);
        });
      });
      if (extracted) return extracted;
    }
    throw new Error('No embedded preview image found in RAW file');
  } finally {
    await fs.promises.rm(srcPath, { force: true });
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
        const previewKey = `previews/${fileId}.webp`;

        // Read the original into memory once and derive both sizes from the
        // same buffer -- simpler and more robust than juggling two stream
        // pipes off one source, and these are already S3-object-sized reads
        // elsewhere in this worker (video remux does the same).
        const sourceStream = await getObjectStream(file.storageKey);
        const sourceChunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          sourceStream.on('data', (chunk: Buffer) => sourceChunks.push(chunk));
          sourceStream.on('end', resolve);
          sourceStream.on('error', reject);
        });
        let sourceBuffer: Buffer = Buffer.concat(sourceChunks);

        // Camera RAW: libvips has no decoder for these at all -- swap in the
        // embedded JPEG preview the camera already generated, then the rest
        // of this pipeline (thumbnail + preview resize/webp) runs unchanged
        // against that instead of the undecodable raw sensor data.
        if (isRawImageMimeType(file.mimeType)) {
          sourceBuffer = await extractRawEmbeddedPreview(sourceBuffer);
        }

        // Small thumbnail: grid/list views. 400px wide WebP.
        // withMetadata() matters here: sharp strips embedded ICC color
        // profiles by default on any resize/format-conversion pipeline --
        // without it, a wide-gamut source (Display P3/Adobe RGB, common on
        // phone and DSLR photos) gets reinterpreted as plain sRGB on
        // display, which is exactly what "colors don't look right"
        // live-reported as. Keeping the original profile fixes that.
        const thumbnailBuffer = await sharp(sourceBuffer)
          .resize({ width: 400, withoutEnlargement: true })
          .withMetadata()
          .webp()
          .toBuffer();
        await uploadToS3(thumbnailKey, thumbnailBuffer, 'image/webp');

        // Full-size preview: the file-preview modal. Previously the modal's
        // previewKey ?? thumbnailKey ?? storageKey fallback always fell
        // through to the 400px thumbnail for every image (previewKey was
        // never populated) -- so the "preview" was permanently blurry
        // regardless of the source photo's real resolution. 2000px is large
        // enough to look sharp on any phone/desktop viewport while staying
        // far smaller than a multi-megapixel DSLR original.
        const previewBuffer = await sharp(sourceBuffer)
          .resize({ width: 2000, withoutEnlargement: true })
          .withMetadata()
          .webp({ quality: 85 })
          .toBuffer();
        await uploadToS3(previewKey, previewBuffer, 'image/webp');

        // Persist both keys in the DB
        await prisma.file.update({
          where: { id: fileId },
          data: {
            thumbnailKey,
            previewKey,
            status: 'ACTIVE',
          },
        });

        logger.info('Preview job: thumbnail + preview generated and uploaded', { fileId, thumbnailKey, previewKey });
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
