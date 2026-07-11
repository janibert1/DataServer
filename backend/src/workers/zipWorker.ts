import { Worker, Job } from 'bullmq';
import archiver from 'archiver';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { s3Client } from '../lib/s3';
import { getObjectStreamWithCache as getObjectStream } from '../lib/cache';
import { Upload } from '@aws-sdk/lib-storage';
import { logger } from '../lib/logger';
import { createNotification } from '../services/notificationService';

export interface ZipJobData {
  downloadId: string;
  userId: string;
}

async function collectEntries(
  userId: string,
  fileIds: string[],
  folderIds: string[],
): Promise<{ storageKey: string; zipPath: string }[]> {
  const entries: { storageKey: string; zipPath: string }[] = [];

  if (fileIds.length > 0) {
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, ownerId: userId, isTrashed: false },
      select: { name: true, storageKey: true },
    });
    for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: f.name });
  }

  async function recurse(folderId: string, prefix: string) {
    const [files, subs] = await Promise.all([
      prisma.file.findMany({
        where: { folderId, ownerId: userId, isTrashed: false },
        select: { name: true, storageKey: true },
      }),
      prisma.folder.findMany({
        where: { parentId: folderId, ownerId: userId, isTrashed: false, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: `${prefix}/${f.name}` });
    for (const sf of subs) await recurse(sf.id, `${prefix}/${sf.name}`);
  }

  for (const folderId of folderIds) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId, isTrashed: false, deletedAt: null },
      select: { name: true },
    });
    if (folder) await recurse(folderId, folder.name);
  }

  return entries;
}

async function processZip(job: Job<ZipJobData>): Promise<void> {
  const { downloadId, userId } = job.data;

  const download = await prisma.zipDownload.findUnique({
    where: { id: downloadId },
    select: { fileIds: true, folderIds: true, name: true },
  });
  if (!download) throw new Error(`ZipDownload ${downloadId} not found`);

  await prisma.zipDownload.update({ where: { id: downloadId }, data: { status: 'PROCESSING' } });

  const entries = await collectEntries(userId, download.fileIds, download.folderIds);
  if (entries.length === 0) {
    await prisma.zipDownload.update({ where: { id: downloadId }, data: { status: 'FAILED', errorMessage: 'No files found' } });
    return;
  }

  const storageKey = `downloads/${userId}/${downloadId}.zip`;

  // Stream the archive straight into a multipart S3 upload (same pattern as
  // driveOpsWorker's zip-to-drive) instead of writing to a temp file and then
  // re-uploading it with a plain PutObjectCommand + a precomputed ContentLength.
  // That older approach broke under load: the AWS SDK v3 retries a failed
  // PutObjectCommand by resending the *same* fs.ReadStream, which has already
  // been partially/fully drained by the first attempt, so the retry sends
  // fewer bytes than the ContentLength header promised -- surfacing as
  // "You did not provide the number of bytes specified by the Content-Length
  // HTTP header." Upload (lib-storage) buffers each part before sending, so a
  // retry re-sends a real buffer instead of a drained stream.
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('warning', (err) => logger.warn('Zip archiver warning', { downloadId, err }));

  const s3Upload = new Upload({
    client: s3Client,
    params: { Bucket: config.s3.bucket, Key: storageKey, Body: archive, ContentType: 'application/zip' },
  });

  // Process in batches: fetch BATCH_SIZE S3 streams in parallel, append sequentially
  const BATCH_SIZE = 20;
  let processed = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((e) => getObjectStream(e.storageKey)),
    );

    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        // Attach error listener to prevent unhandled 'error' events on the stream
        r.value.on('error', () => {});
        archive.append(r.value, { name: batch[j].zipPath });
      } else {
        logger.warn('Skipping file in zip', { storageKey: batch[j].storageKey });
      }
    }

    processed += batch.length;

    // Yield to event loop so archiver can drain between batches
    await new Promise<void>((res) => setImmediate(res));

    // Update progress every 200 files
    if (processed % 200 === 0 || processed >= entries.length) {
      await prisma.zipDownload.update({
        where: { id: downloadId },
        data: { fileCount: processed },
      }).catch(() => {});
      logger.info('Zip progress', { downloadId, processed, total: entries.length });
    }
  }

  await archive.finalize();
  await s3Upload.done();

  const zipSize = BigInt(archive.pointer());

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await prisma.zipDownload.update({
    where: { id: downloadId },
    data: {
      status: 'READY',
      storageKey,
      sizeBytes: zipSize,
      expiresAt,
      fileCount: entries.length,
    },
  });

  await createNotification({
    userId,
    type: 'TASK_COMPLETED',
    title: 'Download ready',
    body: `"${download.name}" is ready to download (${entries.length} files).`,
    link: '/drive/downloads',
  });

  logger.info('Zip ready', { downloadId, fileCount: entries.length, storageKey, sizeBytes: zipSize.toString() });
}

export const zipWorker = new Worker<ZipJobData>('zip-queue', processZip, {
  connection: { url: config.redis.url },
  concurrency: 2,
  lockDuration: 600000,
});

zipWorker.on('failed', async (job, err) => {
  logger.error('Zip job failed', { downloadId: job?.data?.downloadId, err: err.message });
  if (job?.data?.downloadId) {
    await prisma.zipDownload.update({
      where: { id: job.data.downloadId },
      data: { status: 'FAILED', errorMessage: err.message.slice(0, 500) },
    }).catch(() => {});
  }
});
