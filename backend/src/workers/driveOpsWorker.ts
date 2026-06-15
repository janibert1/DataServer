import { Worker, Job } from 'bullmq';
import archiver from 'archiver';
import { Transform } from 'stream';
import unzipper from 'unzipper';
import mime from 'mime-types';
import crypto from 'crypto';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { s3Client, getObjectStream, buildStorageKey, deleteFromS3 } from '../lib/s3';
import { sanitizeFileName } from '../middleware/upload';
import { checkQuota, incrementUsage } from '../services/quotaService';
import { checkTotalCapacity } from '../services/storageCapacityService';
import { FileStatus } from '@prisma/client';
import { logger } from '../lib/logger';

export interface DriveOpsZipJobData {
  type: 'zip-to-drive';
  userId: string;
  fileIds: string[];
  folderIds: string[];
  name?: string;
  folderId?: string | null;
  label: string;
}

export interface DriveOpsExtractJobData {
  type: 'extract';
  userId: string;
  fileId: string;
  label: string;
}

export interface DriveOpsTrashJobData {
  type: 'trash-folder';
  userId: string;
  folderId: string;
  label: string;
}

export interface DriveOpsRestoreJobData {
  type: 'restore-folder';
  userId: string;
  folderId: string;
  label: string;
}

export type DriveOpsJobData = DriveOpsZipJobData | DriveOpsExtractJobData | DriveOpsTrashJobData | DriveOpsRestoreJobData;

async function processZipToDrive(job: Job<DriveOpsZipJobData>): Promise<object> {
  const { userId, fileIds, folderIds, name, folderId: targetFolderId } = job.data;

  await job.updateProgress({ percent: 5, message: 'Collecting files…' });

  const entries: { storageKey: string; zipPath: string; size: bigint }[] = [];

  if (fileIds.length > 0) {
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, ownerId: userId, isTrashed: false },
      select: { name: true, storageKey: true, size: true },
    });
    for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: f.name, size: f.size });
  }

  async function recurseForZip(fid: string, prefix: string) {
    const [files, subs] = await Promise.all([
      prisma.file.findMany({
        where: { folderId: fid, ownerId: userId, isTrashed: false },
        select: { name: true, storageKey: true, size: true },
      }),
      prisma.folder.findMany({
        where: { parentId: fid, ownerId: userId, isTrashed: false, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: `${prefix}/${f.name}`, size: f.size });
    for (const sf of subs) await recurseForZip(sf.id, `${prefix}/${sf.name}`);
  }

  for (const fid of folderIds) {
    const folder = await prisma.folder.findFirst({
      where: { id: fid, ownerId: userId, isTrashed: false, deletedAt: null },
      select: { name: true },
    });
    if (folder) await recurseForZip(fid, folder.name);
  }

  if (entries.length === 0) throw new Error('No files to compress');

  const totalUncompressed = entries.reduce((s, e) => s + e.size, BigInt(0));
  if (!(await checkQuota(userId, totalUncompressed))) throw new Error('Not enough storage quota');
  if (!(await checkTotalCapacity(totalUncompressed))) throw new Error('Server storage capacity exceeded');

  let baseName = name?.trim();
  if (!baseName) {
    if (folderIds.length === 1 && fileIds.length === 0) {
      const f = await prisma.folder.findUnique({ where: { id: folderIds[0] }, select: { name: true } });
      baseName = f?.name;
    } else if (fileIds.length === 1 && folderIds.length === 0) {
      const f = await prisma.file.findUnique({ where: { id: fileIds[0] }, select: { name: true } });
      baseName = f?.name.replace(/\.[^/.]+$/, '');
    }
  }
  const zipName = sanitizeFileName(baseName || 'archive') + '.zip';
  const fileId = uuidv4();
  const storageKey = buildStorageKey(userId, fileId, zipName);

  await job.updateProgress({ percent: 10, message: `Compressing ${entries.length} file${entries.length !== 1 ? 's' : ''}…` });

  let filesAdded = 0;
  const arc = archiver('zip', { zlib: { level: 1 } });
  arc.on('entry', () => {
    filesAdded++;
    const pct = Math.min(10 + Math.round((filesAdded / entries.length) * 75), 85);
    job.updateProgress({ percent: pct, message: `Compressing ${filesAdded}/${entries.length} files…` }).catch(() => {});
  });

  const s3Upload = new Upload({
    client: s3Client,
    params: { Bucket: config.s3.bucket, Key: storageKey, Body: arc, ContentType: 'application/zip', Metadata: { uploadedBy: userId } },
  });

  for (const e of entries) {
    try { arc.append(await getObjectStream(e.storageKey) as any, { name: e.zipPath }); } catch { /* skip */ }
  }
  await arc.finalize();
  await s3Upload.done();

  const zipSize = BigInt(arc.pointer());

  await job.updateProgress({ percent: 92, message: 'Saving to your drive…' });

  const targetFolder = targetFolderId
    ? await prisma.folder.findUnique({ where: { id: targetFolderId }, select: { path: true } })
    : null;
  const folderPath = targetFolder?.path ?? '/';

  const dbFile = await prisma.file.create({
    data: {
      id: fileId, name: zipName, originalName: zipName, ownerId: userId,
      folderId: targetFolderId ?? null,
      size: zipSize, mimeType: 'application/zip', storageKey,
      status: FileStatus.ACTIVE,
      path: `${folderPath}${zipName}`, checksum: '',
    },
  });
  await incrementUsage(userId, zipSize);

  await job.updateProgress({ percent: 100, message: `Created ${zipName}` });
  return { fileId: dbFile.id, fileName: zipName, size: zipSize.toString() };
}

async function processExtract(job: Job<DriveOpsExtractJobData>): Promise<object> {
  const { userId, fileId: id } = job.data;

  await job.updateProgress({ percent: 2, message: 'Loading zip…' });

  const file = await prisma.file.findFirst({
    where: { id, ownerId: userId, isTrashed: false, status: FileStatus.ACTIVE },
    select: { storageKey: true, name: true, size: true, folderId: true },
  });
  if (!file) throw new Error('File not found');
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Not a zip file');

  const containerName = sanitizeFileName(file.name.replace(/\.zip$/i, ''));
  const targetFolderId = file.folderId;

  let containerParentPath = '/';
  let containerDepth = 1;
  if (targetFolderId) {
    const parent = await prisma.folder.findUnique({ where: { id: targetFolderId }, select: { path: true, depth: true } });
    if (parent) { containerParentPath = parent.path + '/'; containerDepth = parent.depth + 1; }
  }

  const containerFolder = await prisma.folder.create({
    data: {
      name: containerName, ownerId: userId, parentId: targetFolderId ?? null,
      path: `${containerParentPath}${containerName}`, depth: containerDepth,
    },
  }).catch(() => prisma.folder.findFirst({ where: { parentId: targetFolderId ?? null, ownerId: userId, name: containerName, isTrashed: false } }));

  if (!containerFolder) throw new Error('Could not create extraction folder');

  const pathToId = new Map<string, string>();
  pathToId.set('', containerFolder.id);

  async function ensureDir(zipPath: string): Promise<string> {
    if (!zipPath) return containerFolder!.id;
    if (pathToId.has(zipPath)) return pathToId.get(zipPath)!;
    const parts = zipPath.split('/');
    let currentPath = '';
    let parentId = containerFolder!.id;
    for (const segment of parts) {
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!pathToId.has(nextPath)) {
        const safeName = sanitizeFileName(segment);
        const parentRecord = await prisma.folder.findUnique({ where: { id: parentId }, select: { path: true, depth: true } });
        const sub = await prisma.folder.create({
          data: {
            name: safeName, ownerId: userId, parentId,
            path: `${parentRecord?.path ?? containerFolder!.path}/${safeName}`,
            depth: (parentRecord?.depth ?? containerDepth) + 1,
          },
        }).catch(() => prisma.folder.findFirst({ where: { parentId, ownerId: userId, name: safeName } }));
        if (sub) pathToId.set(nextPath, sub.id);
      }
      parentId = pathToId.get(nextPath) ?? parentId;
      currentPath = nextPath;
    }
    return parentId;
  }

  let filesCreated = 0;
  let foldersCreated = 0;
  let quotaExceeded = false;
  let bytesProcessed = BigInt(0);
  const totalBytes = file.size;

  await job.updateProgress({ percent: 5, message: 'Extracting…' });

  const zipStream = await getObjectStream(file.storageKey);
  const parser = zipStream.pipe(unzipper.Parse({ forceStream: true }));

  for await (const entry of parser as any) {
    const entryPath: string = (entry.path as string).replace(/\/$/, '');
    if (!entryPath) { entry.autodrain(); continue; }
    const parts = entryPath.split('/');
    const entryName = parts[parts.length - 1];
    if (!entryName) { entry.autodrain(); continue; }
    const parentZipPath = parts.slice(0, -1).join('/');

    if (entry.type === 'Directory') {
      await ensureDir(entryPath);
      foldersCreated++;
      entry.autodrain();
    } else {
      if (quotaExceeded) { entry.autodrain(); continue; }

      const parentId = await ensureDir(parentZipPath);
      const safeName = sanitizeFileName(entryName);
      const mimeType = (mime.lookup(safeName) as string | false) || 'application/octet-stream';
      const newFileId = uuidv4();
      const sKey = buildStorageKey(userId, newFileId, safeName);
      const parentRecord = await prisma.folder.findUnique({ where: { id: parentId }, select: { path: true } });

      const hash = crypto.createHash('sha256');
      let fileBytes = BigInt(0);
      const hasher = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk); fileBytes += BigInt(chunk.length); this.push(chunk); cb();
        },
      });
      entry.pipe(hasher);

      const entryUpload = new Upload({
        client: s3Client,
        params: { Bucket: config.s3.bucket, Key: sKey, Body: hasher, ContentType: mimeType, Metadata: { uploadedBy: userId } },
      });
      await entryUpload.done();

      const fileSize = fileBytes;
      bytesProcessed += fileSize;

      if (!(await checkQuota(userId, fileSize)) || !(await checkTotalCapacity(fileSize))) {
        await deleteFromS3(sKey);
        quotaExceeded = true;
        continue;
      }

      await prisma.file.create({
        data: {
          id: newFileId, name: safeName, originalName: safeName, ownerId: userId, folderId: parentId,
          size: fileSize, mimeType, storageKey: sKey, status: FileStatus.ACTIVE,
          path: `${parentRecord?.path ?? containerFolder!.path}/${safeName}`, checksum: hash.digest('hex'),
        },
      });
      await incrementUsage(userId, fileSize);
      filesCreated++;

      const pct = totalBytes > BigInt(0)
        ? Math.min(5 + Math.round(Number(bytesProcessed * BigInt(90)) / Number(totalBytes)), 95)
        : Math.min(5 + filesCreated, 95);
      await job.updateProgress({ percent: pct, message: `Extracted ${filesCreated} file${filesCreated !== 1 ? 's' : ''}…` }).catch(() => {});
    }
  }

  const msg = `Extracted ${filesCreated} file${filesCreated !== 1 ? 's' : ''} and ${foldersCreated} folder${foldersCreated !== 1 ? 's' : ''}${quotaExceeded ? ' (quota exceeded)' : ''}`;
  await job.updateProgress({ percent: 100, message: msg });
  return { filesCreated, foldersCreated, message: msg };
}


async function processTrashFolder(job: Job<DriveOpsTrashJobData>): Promise<object> {
  const { userId, folderId } = job.data;

  await job.updateProgress({ percent: 5, message: 'Collecting folders\u2026' });

  // Single recursive CTE — one DB round-trip instead of N sequential queries
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM "Folder"
      WHERE id = ${folderId} AND "ownerId" = ${userId} AND "isTrashed" = false AND "deletedAt" IS NULL
      UNION ALL
      SELECT f.id FROM "Folder" f
      INNER JOIN descendants d ON f."parentId" = d.id
      WHERE f."isTrashed" = false AND f."deletedAt" IS NULL
    )
    SELECT id FROM descendants
  `;

  const allFolderIds = rows.map((r) => r.id);
  if (allFolderIds.length === 0) throw new Error('Folder not found or already trashed');

  await job.updateProgress({ percent: 20, message: `Moving ${allFolderIds.length} folder${allFolderIds.length !== 1 ? 's' : ''} to trash\u2026` });

  const now = new Date();
  const BATCH = 500;

  for (let i = 0; i < allFolderIds.length; i += BATCH) {
    const batch = allFolderIds.slice(i, i + BATCH);
    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: batch }, ownerId: userId },
        data: { isTrashed: true, trashedAt: now },
      }),
      prisma.file.updateMany({
        where: { folderId: { in: batch }, ownerId: userId, isTrashed: false },
        data: { isTrashed: true, trashedAt: now },
      }),
    ]);
    const pct = Math.min(20 + Math.round(((i + batch.length) / allFolderIds.length) * 75), 95);
    await job.updateProgress({
      percent: pct,
      message: `Moving items to trash\u2026 (${Math.min(i + batch.length, allFolderIds.length)}/${allFolderIds.length} folders)`,
    });
  }

  await job.updateProgress({ percent: 100, message: 'Moved to trash' });
  return { folderCount: allFolderIds.length };
}

async function processRestoreFolder(job: Job<DriveOpsRestoreJobData>): Promise<object> {
  const { userId, folderId } = job.data;

  await job.updateProgress({ percent: 5, message: 'Collecting folders\u2026' });

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM "Folder"
      WHERE id = ${folderId} AND "ownerId" = ${userId} AND "isTrashed" = true
      UNION ALL
      SELECT f.id FROM "Folder" f
      INNER JOIN descendants d ON f."parentId" = d.id
      WHERE f."isTrashed" = true
    )
    SELECT id FROM descendants
  `;

  const allFolderIds = rows.map((r) => r.id);
  if (allFolderIds.length === 0) throw new Error('Folder not found in trash');

  await job.updateProgress({ percent: 20, message: `Restoring ${allFolderIds.length} folder${allFolderIds.length !== 1 ? 's' : ''}\u2026` });

  const BATCH = 500;

  for (let i = 0; i < allFolderIds.length; i += BATCH) {
    const batch = allFolderIds.slice(i, i + BATCH);
    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: batch }, ownerId: userId },
        data: { isTrashed: false, trashedAt: null },
      }),
      prisma.file.updateMany({
        where: { folderId: { in: batch }, ownerId: userId, isTrashed: true },
        data: { isTrashed: false, trashedAt: null },
      }),
    ]);
    const pct = Math.min(20 + Math.round(((i + batch.length) / allFolderIds.length) * 75), 95);
    await job.updateProgress({
      percent: pct,
      message: `Restoring\u2026 (${Math.min(i + batch.length, allFolderIds.length)}/${allFolderIds.length} folders)`,
    });
  }

  await job.updateProgress({ percent: 100, message: 'Restored' });
  return { folderCount: allFolderIds.length };
}

async function processDriveOp(job: Job<DriveOpsJobData>): Promise<object> {
  if (job.data.type === 'zip-to-drive') return processZipToDrive(job as Job<DriveOpsZipJobData>);
  if (job.data.type === 'trash-folder') return processTrashFolder(job as Job<DriveOpsTrashJobData>);
  if (job.data.type === 'restore-folder') return processRestoreFolder(job as Job<DriveOpsRestoreJobData>);
  return processExtract(job as Job<DriveOpsExtractJobData>);
}

export const driveOpsWorker = new Worker<DriveOpsJobData>('drive-ops-queue', processDriveOp, {
  connection: { url: config.redis.url },
  concurrency: 3,
  lockDuration: 1800000,
});

driveOpsWorker.on('failed', (job, err) => {
  logger.error('DriveOps job failed', { jobId: job?.id, type: job?.data?.type, err: err.message });
});
