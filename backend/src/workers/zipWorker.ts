import { Worker, Job } from 'bullmq';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
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
  const tmpPath = path.join('/tmp', `zip-${downloadId}.zip`);

  // Stream the archive to a local temp file first (reliable: we just await
  // the destination file's own 'close' event, no dependency on how a
  // third-party SDK consumes a piped stream), THEN upload that finished file
  // via Upload (lib-storage) rather than a raw PutObjectCommand.
  //
  // History: the original version used this same temp-file step but then
  // uploaded with a plain PutObjectCommand + a precomputed ContentLength and
  // an fs.ReadStream body -- broke under load because the AWS SDK v3 retries
  // a failed PUT by resending that *same* stream, already drained by the
  // first attempt, so the retry sends fewer bytes than promised ("You did
  // not provide the number of bytes specified by the Content-Length header").
  // A follow-up attempt piped the archiver stream directly into Upload with
  // no temp file at all, to dodge that bug -- but that hung indefinitely
  // after the last file was appended (confirmed live: "Zip progress 3/3"
  // logged, then nothing, job stuck in PROCESSING forever). Keeping the
  // temp-file step avoids that hang, while using Upload (not raw
  // PutObjectCommand) for the actual S3 push still fixes the retry bug --
  // Upload buffers parts before sending, so a retry resends a real buffer,
  // not a drained stream.
  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(tmpPath);
      const archive = archiver('zip', { zlib: { level: 1 } });

      archive.on('error', reject);
      output.on('close', resolve);
      output.on('error', reject);
      archive.pipe(output);

      // Process in batches: fetch BATCH_SIZE S3 streams in parallel, append sequentially
      const BATCH_SIZE = 20;

      async function run(): Promise<void> {
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
      }

      run().catch(reject);
    });

    const stat = fs.statSync(tmpPath);
    const s3Upload = new Upload({
      client: s3Client,
      params: {
        Bucket: config.s3.bucket,
        Key: storageKey,
        Body: fs.createReadStream(tmpPath),
        ContentType: 'application/zip',
      },
    });
    await s3Upload.done();

    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await prisma.zipDownload.update({
      where: { id: downloadId },
      data: {
        status: 'READY',
        storageKey,
        sizeBytes: BigInt(stat.size),
        expiresAt,
        fileCount: entries.length,
        errorMessage: null,
      },
    });

    await createNotification({
      userId,
      type: 'TASK_COMPLETED',
      title: 'Download ready',
      body: `"${download.name}" is ready to download (${entries.length} files).`,
      link: '/drive/downloads',
    });

    logger.info('Zip ready', { downloadId, fileCount: entries.length, storageKey, sizeBytes: stat.size });
  } finally {
    fs.unlink(tmpPath, () => {});
  }
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
