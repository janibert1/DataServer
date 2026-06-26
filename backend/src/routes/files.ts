import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import path from 'path';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { uploadMiddleware, sanitizeFileName } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../lib/prisma';
import { uploadToS3, getSignedDownloadUrl, deleteFromS3, buildStorageKey, getObjectStream } from '../lib/s3';
import { s3Client } from '../lib/s3';
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import express from 'express';
import archiver from 'archiver';
import { driveOpsQueue } from '../workers/queues';
import type { DriveOpsZipJobData, DriveOpsExtractJobData } from '../workers/driveOpsWorker';
import { PassThrough, Transform } from 'stream';
import unzipper from 'unzipper';
import { Upload } from '@aws-sdk/lib-storage';
import mime from 'mime-types';
import { auditFromRequest } from '../services/auditService';
import { checkFileAccess, getEffectivePermission } from '../services/sharingService';
import { checkQuota, incrementUsage, decrementUsage } from '../services/quotaService';
import { checkTotalCapacity } from '../services/storageCapacityService';
import { AuditAction, FileStatus, SharePermission } from '@prisma/client';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { emptyTrashQueue, aiSortQueue, zipQueue } from '../workers/queues';

async function isAiSortActive(userId: string): Promise<boolean> {
  const jobs = await aiSortQueue.getJobs(['active', 'waiting', 'delayed']);
  return jobs.some((j) => j.data.userId === userId);
}

async function isEmptyTrashActive(userId: string): Promise<boolean> {
  const jobs = await emptyTrashQueue.getJobs(['active', 'waiting', 'delayed']);
  return jobs.some((j) => j.data.userId === userId);
}

export const filesRouter = Router();

filesRouter.use(requireAuth, requireVerifiedEmail);

// ─── List files ──────────────────────────────────────────────

filesRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { search, folderId, sortBy = 'updatedAt', sortDir = 'desc', page = '1', limit = '500' } = req.query as any;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    ownerId: user.id,
    isTrashed: false,
    isBackup: false,
    status: { in: [FileStatus.ACTIVE, FileStatus.PROCESSING] },
  };

  if (folderId) {
    where.folderId = folderId;
  } else if (!search) {
    where.folderId = null; // Root view: only show files not inside any folder
  }
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const validSort = ['name', 'size', 'createdAt', 'updatedAt', 'mimeType'];
  const sortField = validSort.includes(sortBy) ? sortBy : 'updatedAt';
  const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';

  const [files, total] = await Promise.all([
    prisma.file.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip,
      take: limitNum,
      select: {
        id: true, name: true, mimeType: true, size: true,
        thumbnailKey: true, status: true, folderId: true,
        path: true, downloadCount: true, createdAt: true, updatedAt: true,
        starredBy: { where: { userId: user.id }, select: { id: true } },
      },
    }),
    prisma.file.count({ where }),
  ]);

  res.json({
    files: files.map((f) => ({ ...f, size: f.size.toString(), isStarred: f.starredBy.length > 0 })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── Recent files ────────────────────────────────────────────

filesRouter.get('/recent', async (req: Request, res: Response) => {
  const user = req.user as any;
  const files = await prisma.file.findMany({
    where: { ownerId: user.id, isTrashed: false, status: FileStatus.ACTIVE },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true, name: true, mimeType: true, size: true,
      thumbnailKey: true, folderId: true, path: true, updatedAt: true,
    },
  });
  res.json({ files: files.map((f) => ({ ...f, size: f.size.toString() })) });
});

// ─── Starred files ───────────────────────────────────────────

filesRouter.get('/starred', async (req: Request, res: Response) => {
  const user = req.user as any;
  const starredFiles = await prisma.starredItem.findMany({
    where: { userId: user.id, fileId: { not: null } },
    include: {
      file: {
        select: {
          id: true, name: true, mimeType: true, size: true,
          thumbnailKey: true, folderId: true, path: true, updatedAt: true, isTrashed: true, status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const files = starredFiles
    .filter((s) => s.file && !s.file.isTrashed && s.file.status !== FileStatus.DELETED)
    .map((s) => ({ ...s.file!, size: s.file!.size.toString(), isStarred: true }));

  res.json({ files });
});

// ─── Trash ───────────────────────────────────────────────────

filesRouter.get('/trash', async (req: Request, res: Response) => {
  const user = req.user as any;
  const limit = 500;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const skip = (page - 1) * limit;

  const [files, total] = await Promise.all([
    prisma.file.findMany({
      where: { ownerId: user.id, isTrashed: true, status: { not: FileStatus.DELETED }, OR: [{ folderId: null }, { folder: { isTrashed: false } }] },
      orderBy: { trashedAt: 'desc' },
      select: {
        id: true, name: true, mimeType: true, size: true, trashedAt: true, path: true,
      },
      take: limit,
      skip,
    }),
    prisma.file.count({
      where: { ownerId: user.id, isTrashed: true, status: { not: FileStatus.DELETED }, OR: [{ folderId: null }, { folder: { isTrashed: false } }] },
    }),
  ]);

  res.json({
    files: files.map((f) => ({ ...f, size: f.size.toString() })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── Empty trash ─────────────────────────────────────────────

filesRouter.post('/empty-trash', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    // Check for active/waiting/delayed jobs
    const activeJobs = await emptyTrashQueue.getJobs(['active', 'waiting', 'delayed']);
    const activeJob = activeJobs.find((j) => j.data.userId === user.id);
    if (activeJob) {
      res.status(409).json({ error: 'Empty trash operation already in progress.' });
      return;
    }

    // Remove stale terminal jobs (failed or completed) — BullMQ won't enqueue a new
    // job when one with the same jobId still exists in either state, so subsequent
    // empty-trash calls would silently return the old job and never run.
    const terminalJobs = await emptyTrashQueue.getJobs(['failed', 'completed']);
    for (const j of terminalJobs) {
      if (j.data.userId === user.id) await j.remove();
    }

    // Quick existence check instead of full COUNT (fast even with 200k+ items)
    const anyTrashed = await prisma.file.findFirst({
      where: { ownerId: user.id, isTrashed: true, status: { not: FileStatus.DELETED } },
      select: { id: true },
    });
    const anyTrashedFolder = !anyTrashed ? await prisma.folder.findFirst({
      where: { ownerId: user.id, isTrashed: true },
      select: { id: true },
    }) : null;

    if (!anyTrashed && !anyTrashedFolder) {
      res.json({ message: 'Trash is already empty.', count: 0 });
      return;
    }

    const job = await emptyTrashQueue.add('empty-trash', { userId: user.id }, {
      jobId: `empty-trash-${user.id}`,
    });

    await auditFromRequest(req, AuditAction.FILE_DELETED, {
      details: { emptyTrash: true, jobId: job.id },
    });

    res.json({
      message: 'Emptying trash in the background. You will be notified when done.',
      jobId: job.id,
      status: 'processing',
    });
  } catch (err) {
    logger.error('Empty trash route error', { err });
    res.status(500).json({ error: 'Failed to start empty trash operation.' });
  }
});

// Check status of an empty-trash job
filesRouter.get('/empty-trash/status', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const jobs = await emptyTrashQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed']);
    const job = jobs.find((j) => j.data.userId === user.id);

    if (!job) {
      res.json({ status: 'idle' });
      return;
    }

    const state = await job.getState();
    res.json({
      status: state === 'failed' ? 'failed' : state === 'completed' ? 'completed' : 'processing',
      progress: job.progress,
      jobId: job.id,
    });
  } catch (err) {
    logger.error('Empty trash status error', { err });
    res.json({ status: 'idle' });
  }
});

// ─── Upload file ─────────────────────────────────────────────

filesRouter.post(
  '/upload',
  uploadRateLimiter,
  uploadMiddleware.array('files', 20),
  async (req: Request, res: Response) => {
    const user = req.user as any;
    if (await isAiSortActive(user.id)) {
      res.status(409).json({ error: 'AI sort is in progress. Wait for it to finish before uploading.' });
      return;
    }
    const uploadedFiles = req.files as Express.Multer.File[];

    if (!uploadedFiles || uploadedFiles.length === 0) {
      res.status(400).json({ error: 'No files provided.' });
      return;
    }

    const { folderId } = req.body;

    // Verify folder ownership
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, isTrashed: false },
      });
      if (!folder) {
        res.status(404).json({ error: 'Folder not found.' });
        return;
      }

      const permission = folder.ownerId === user.id
        ? SharePermission.OWNER
        : await getEffectivePermission(user.id, folderId);

      if (!permission || !['CONTRIBUTOR', 'EDITOR', 'OWNER'].includes(permission)) {
        res.status(403).json({ error: 'Insufficient permissions to upload here.' });
        return;
      }
    }

    const results = [];
    const errors = [];

    for (const file of uploadedFiles) {
      try {
        const totalSize = BigInt(file.size);
        const hasQuota = await checkQuota(user.id, totalSize);
        if (!hasQuota) {
          errors.push({ filename: file.originalname, error: 'Storage quota exceeded.' });
          continue;
        }
        const hasCapacity = await checkTotalCapacity(totalSize);
        if (!hasCapacity) {
          errors.push({ filename: file.originalname, error: 'Server storage capacity exceeded.' });
          continue;
        }

        const fileId = uuidv4();
        const safeName = sanitizeFileName(file.originalname);
        const storageKey = buildStorageKey(user.id, fileId, safeName);
        const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

        // Get folder path for display
        let folderPath = '/';
        if (folderId) {
          const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { path: true } });
          const p = folder?.path ?? '/';
          folderPath = p.endsWith('/') ? p : p + '/';
        }

        const dbFile = await prisma.file.create({
          data: {
            id: fileId,
            name: safeName,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: totalSize,
            storageKey,
            checksum,
            ownerId: user.id,
            folderId: folderId ?? null,
            path: `${folderPath}${safeName}`,
            status: FileStatus.UPLOADING,
          },
        });

        await uploadToS3(storageKey, file.buffer, file.mimetype, {
          originalName: file.originalname,
          uploadedBy: user.id,
          checksum,
        });

        await prisma.file.update({
          where: { id: dbFile.id },
          data: { status: FileStatus.ACTIVE },
        });

        await incrementUsage(user.id, totalSize);

        await auditFromRequest(req, AuditAction.FILE_UPLOADED, {
          entityType: 'File',
          entityId: dbFile.id,
          details: { name: safeName, size: file.size, folderId },
        });

        results.push({
          id: dbFile.id,
          name: safeName,
          size: file.size,
          mimeType: file.mimetype,
          checksum,
          folderId: folderId ?? null,
          status: FileStatus.ACTIVE,
        });
      } catch (error) {
        logger.error('File upload error', { error, filename: file.originalname });
        errors.push({ filename: file.originalname, error: 'Upload failed.' });
      }
    }

    res.json({ files: results, errors });
  }
);

// ─── Get file ────────────────────────────────────────────────

filesRouter.get('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: {
      id: true, name: true, mimeType: true, size: true,
      status: true, ownerId: true, folderId: true, path: true,
      downloadCount: true, createdAt: true, updatedAt: true,
      thumbnailKey: true, previewKey: true, checksum: true,
      isVirusScanned: true, isFlagged: true, description: true, tags: true,
      starredBy: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!file || file.status === FileStatus.DELETED) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  const canAccess = await checkFileAccess(user.id, id, SharePermission.VIEWER);
  if (!canAccess) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  res.json({ file: { ...file, size: file.size.toString(), isStarred: file.starredBy.length > 0 } });
});

// ─── Download file ───────────────────────────────────────────

filesRouter.get('/:id/download', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: { id: true, name: true, storageKey: true, status: true, ownerId: true, folderId: true, mimeType: true },
  });

  if (!file || file.status === FileStatus.DELETED) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  const canAccess = await checkFileAccess(user.id, id, SharePermission.DOWNLOADER);
  if (!canAccess) {
    res.status(403).json({ error: 'Download access denied.' });
    return;
  }

  const signedUrl = await getSignedDownloadUrl(file.storageKey, 300);

  await prisma.file.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
  await auditFromRequest(req, AuditAction.FILE_DOWNLOADED, {
    entityType: 'File',
    entityId: id,
    details: { name: file.name },
  });

  res.json({ downloadUrl: signedUrl, filename: file.name, mimeType: file.mimeType });
});

// ─── Preview file ────────────────────────────────────────────

filesRouter.get('/:id/preview', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: { storageKey: true, thumbnailKey: true, previewKey: true, status: true, ownerId: true, folderId: true, mimeType: true },
  });

  if (!file || file.status === FileStatus.DELETED) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  const canAccess = await checkFileAccess(user.id, id, SharePermission.VIEWER);
  if (!canAccess) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const key = file.previewKey ?? file.thumbnailKey ?? file.storageKey;
  const url = await getSignedDownloadUrl(key, 300);

  res.json({ previewUrl: url, mimeType: file.mimeType });
});

// ─── Rename file ─────────────────────────────────────────────

filesRouter.patch(
  '/:id',
  [body('name').trim().isLength({ min: 1, max: 255 })],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { id } = req.params;
    const { name } = req.body;

    const file = await prisma.file.findUnique({ where: { id }, select: { ownerId: true, folderId: true, isTrashed: true } });
    if (!file || file.isTrashed) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    const permission = file.ownerId === user.id ? SharePermission.OWNER : await getEffectivePermission(user.id, file.folderId!);
    if (!permission || !['EDITOR', 'OWNER'].includes(permission)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }

    const safeName = sanitizeFileName(name);
    await prisma.file.update({ where: { id }, data: { name: safeName } });

    await auditFromRequest(req, AuditAction.FILE_RENAMED, { entityType: 'File', entityId: id, details: { name: safeName } });
    res.json({ message: 'File renamed.', name: safeName });
  }
);

// ─── Move file ───────────────────────────────────────────────

filesRouter.put('/:id/move', async (req: Request, res: Response) => {
  const user = req.user as any;
  if (await isAiSortActive(user.id)) {
    res.status(409).json({ error: 'AI sort is in progress. Wait for it to finish before moving files.' });
    return;
  }
  const { id } = req.params;
  const { folderId } = req.body;

  const file = await prisma.file.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!file || file.isTrashed) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (file.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can move files.' });
    return;
  }

  await prisma.file.update({ where: { id }, data: { folderId: folderId ?? null } });
  await auditFromRequest(req, AuditAction.FILE_MOVED, { entityType: 'File', entityId: id, details: { folderId } });
  res.json({ message: 'File moved.' });
});

// ─── Trash / restore ─────────────────────────────────────────

filesRouter.post('/bulk-trash', async (req: Request, res: Response) => {
  const user = req.user as any;
  if (await isAiSortActive(user.id)) {
    res.status(409).json({ error: 'AI sort is in progress. Wait for it to finish before trashing files.' });
    return;
  }
  if (await isEmptyTrashActive(user.id)) {
    res.status(409).json({ error: 'Trash is being emptied. Wait for it to finish before moving files to trash.' });
    return;
  }
  const { fileIds = [], folderIds = [], trashRootFiles = false, trashAllInFolder = null } = req.body as {
    fileIds?: string[];
    folderIds?: string[];
    trashRootFiles?: boolean;
    trashAllInFolder?: string | null;
  };

  if (!Array.isArray(fileIds) || !Array.isArray(folderIds)) {
    res.status(400).json({ error: 'fileIds and folderIds must be arrays.' });
    return;
  }
  if (fileIds.length === 0 && folderIds.length === 0 && !trashRootFiles && !trashAllInFolder) {
    res.status(400).json({ error: 'Provide at least one fileId, folderId, trashRootFiles: true, or trashAllInFolder.' });
    return;
  }

  const now = new Date();

  // Validate ownership of all files
  if (fileIds.length > 0) {
    const fileCount = await prisma.file.count({
      where: { id: { in: fileIds }, ownerId: user.id, isTrashed: false },
    });
    if (fileCount !== fileIds.length) {
      res.status(403).json({ error: 'Some files not found or not owned by you.' });
      return;
    }
  }

  // Validate ownership of all folders
  if (folderIds.length > 0) {
    const folderCount = await prisma.folder.count({
      where: { id: { in: folderIds }, ownerId: user.id, isTrashed: false },
    });
    if (folderCount !== folderIds.length) {
      res.status(403).json({ error: 'Some folders not found or not owned by you.' });
      return;
    }
  }

  // Validate trashAllInFolder target
  if (trashAllInFolder) {
    const folder = await prisma.folder.findUnique({
      where: { id: trashAllInFolder },
      select: { ownerId: true, isTrashed: true },
    });
    if (!folder || folder.isTrashed) {
      res.status(404).json({ error: 'Folder not found.' });
      return;
    }
    if (folder.ownerId !== user.id) {
      res.status(403).json({ error: 'Only the owner can trash all files in this folder.' });
      return;
    }
  }

  // Recursively collect all descendant folder IDs
  async function getDescendantFolderIds(parentIds: string[]): Promise<string[]> {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: parentIds }, isTrashed: false },
      select: { id: true },
    });
    if (children.length === 0) return [];
    const childIds = children.map((c) => c.id);
    return [...childIds, ...await getDescendantFolderIds(childIds)];
  }

  const descendantIds = folderIds.length > 0 ? await getDescendantFolderIds(folderIds) : [];
  const allFolderIds = [...folderIds, ...descendantIds];

  // Batch-trash helper — find IDs first, then update by ID list to avoid long locks
  async function trashFilesInBatches(where: any, trashedAt: Date) {
    const BATCH = 500;
    let total = 0;
    while (true) {
      const files = await prisma.file.findMany({
        where: { ...where, isTrashed: false },
        select: { id: true },
        take: BATCH,
      });
      if (files.length === 0) break;
      await prisma.file.updateMany({
        where: { id: { in: files.map((f) => f.id) }, isTrashed: false },
        data: { isTrashed: true, trashedAt },
      });
      total += files.length;
      if (files.length < BATCH) break;
    }
    return total;
  }

  let totalTrashed = 0;

  // Trashing by explicit IDs
  if (fileIds.length > 0) {
    await prisma.file.updateMany({
      where: { id: { in: fileIds }, ownerId: user.id },
      data: { isTrashed: true, trashedAt: now },
    });
    totalTrashed += fileIds.length;
  }

  // Trashing all root files
  if (trashRootFiles && fileIds.length === 0) {
    totalTrashed += await trashFilesInBatches({ ownerId: user.id, folderId: null, isTrashed: false }, now);
  }

  // Trashing all files in a folder
  if (trashAllInFolder) {
    totalTrashed += await trashFilesInBatches({ folderId: trashAllInFolder, isTrashed: false }, now);
  }

  // Trashing folders + their nested files
  if (allFolderIds.length > 0) {
    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds } },
        data: { isTrashed: true, trashedAt: now },
      }),
    ]);
    totalTrashed += await trashFilesInBatches({ folderId: { in: allFolderIds }, isTrashed: false }, now);
  }

  await auditFromRequest(req, AuditAction.FILE_DELETED, {
    details: { bulkTrash: true, fileCount: totalTrashed, folderCount: allFolderIds.length, trashRootFiles },
  });
  res.json({ message: `${totalTrashed} items moved to trash.` });
});

filesRouter.post('/:id/trash', async (req: Request, res: Response) => {
  const user = req.user as any;
  if (await isAiSortActive(user.id)) {
    res.status(409).json({ error: 'AI sort is in progress. Wait for it to finish before trashing files.' });
    return;
  }
  if (await isEmptyTrashActive(user.id)) {
    res.status(409).json({ error: 'Trash is being emptied. Wait for it to finish before moving files to trash.' });
    return;
  }
  const { id } = req.params;

  const file = await prisma.file.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (file.ownerId !== user.id) {
    const permission = await getEffectivePermission(user.id, (await prisma.file.findUnique({ where: { id }, select: { folderId: true } }))?.folderId ?? '');
    if (!permission || !['EDITOR', 'OWNER'].includes(permission)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
  }

  await prisma.file.update({ where: { id }, data: { isTrashed: true, trashedAt: new Date() } });
  await auditFromRequest(req, AuditAction.FILE_DELETED, { entityType: 'File', entityId: id });
  res.json({ message: 'File moved to trash.' });
});

filesRouter.post('/:id/restore', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!file || !file.isTrashed) {
    res.status(404).json({ error: 'File not found in trash.' });
    return;
  }
  if (file.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can restore files.' });
    return;
  }

  await prisma.file.update({ where: { id }, data: { isTrashed: false, trashedAt: null } });
  await auditFromRequest(req, AuditAction.FILE_RESTORED, { entityType: 'File', entityId: id });
  res.json({ message: 'File restored.' });
});

filesRouter.delete('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  if (await isAiSortActive(user.id)) {
    res.status(409).json({ error: 'AI sort is in progress. Wait for it to finish before deleting files.' });
    return;
  }
  const { id } = req.params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: { ownerId: true, storageKey: true, size: true, status: true },
  });
  if (!file || file.status === FileStatus.DELETED) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }
  if (file.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can permanently delete files.' });
    return;
  }

  await prisma.file.update({ where: { id }, data: { status: FileStatus.DELETED, deletedAt: new Date() } });

  try {
    await deleteFromS3(file.storageKey);
    await decrementUsage(user.id, file.size);
  } catch (err) {
    logger.error('Failed to delete file from S3', { err, storageKey: file.storageKey });
  }

  await auditFromRequest(req, AuditAction.FILE_PERMANENTLY_DELETED, { entityType: 'File', entityId: id });
  res.json({ message: 'File permanently deleted.' });
});

// ─── Star file ───────────────────────────────────────────────

filesRouter.post('/:id/star', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const existing = await prisma.starredItem.findUnique({
    where: { userId_fileId: { userId: user.id, fileId: id } },
  });

  if (existing) {
    await prisma.starredItem.delete({ where: { userId_fileId: { userId: user.id, fileId: id } } });
    res.json({ starred: false });
  } else {
    await prisma.starredItem.create({ data: { userId: user.id, fileId: id } });
    res.json({ starred: true });
  }
});

// ─── Flag content ────────────────────────────────────────────

filesRouter.post(
  '/:id/flag',
  [body('reason').trim().notEmpty()],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { id } = req.params;
    const { reason, details } = req.body;

    await prisma.contentFlag.create({
      data: { reporterId: user.id, fileId: id, reason, details },
    });

    res.json({ message: 'Content flagged for review.' });
  }
);

// ─── File versions ───────────────────────────────────────────

filesRouter.get('/:id/versions', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const canAccess = await checkFileAccess(user.id, id, SharePermission.VIEWER);
  if (!canAccess) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const versions = await prisma.fileVersion.findMany({
    where: { fileId: id, deletedAt: null },
    orderBy: { version: 'desc' },
  });

  res.json({ versions: versions.map((v) => ({ ...v, size: v.size.toString() })) });
});

// ─── AI Sort ─────────────────────────────────────────────────

filesRouter.post('/ai-sort', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const maxDepth = Math.max(1, Math.min(5, parseInt(req.body.maxDepth) || 2));
    const userPrompt = String(req.body.prompt ?? '').slice(0, 500);

    const activeJobs = await aiSortQueue.getJobs(['active', 'waiting', 'delayed']);
    const activeJob = activeJobs.find((j) => j.data.userId === user.id);
    if (activeJob) {
      res.status(409).json({ error: 'AI sort already in progress.' });
      return;
    }

    const failedJobs = await aiSortQueue.getJobs(['failed', 'completed']);
    const staleJob = failedJobs.find((j) => j.data.userId === user.id);
    if (staleJob) await staleJob.remove();

    const job = await aiSortQueue.add('ai-sort', { userId: user.id, maxDepth, userPrompt }, {
      jobId: `ai-sort-${user.id}`,
    });

    res.json({ jobId: job.id, status: 'processing' });
  } catch (err) {
    logger.error('AI sort route error', { err });
    res.status(500).json({ error: 'Failed to start AI sort.' });
  }
});

filesRouter.get('/ai-sort/status', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const jobs = await aiSortQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed']);
    const job = jobs.find((j) => j.data.userId === user.id);

    if (!job) {
      res.json({ status: 'idle' });
      return;
    }

    const state = await job.getState();
    res.json({
      status: state === 'failed' ? 'failed' : state === 'completed' ? 'completed' : 'processing',
      jobId: job.id,
    });
  } catch (err) {
    logger.error('AI sort status error', { err });
    res.json({ status: 'idle' });
  }
});


// ── Chunked / resumable upload ────────────────────────────────

filesRouter.post('/upload/init', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { name, size, mimeType, folderId } = req.body;
  if (!name || !size || !mimeType) { res.status(400).json({ error: 'name, size, mimeType required' }); return; }

  const totalSize = BigInt(size);
  if (!(await checkQuota(user.id, totalSize))) { res.status(413).json({ error: 'Storage quota exceeded.' }); return; }
  if (!(await checkTotalCapacity(totalSize))) { res.status(507).json({ error: 'Server storage capacity exceeded.' }); return; }

  const fileId = uuidv4();
  const safeName = sanitizeFileName(name);
  const storageKey = buildStorageKey(user.id, fileId, safeName);

  let folderPath = '/';
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, isTrashed: false } });
    if (!folder) { res.status(404).json({ error: 'Folder not found.' }); return; }
    const perm = folder.ownerId === user.id ? SharePermission.OWNER : await getEffectivePermission(user.id, folderId);
    if (!perm || !['CONTRIBUTOR', 'EDITOR', 'OWNER'].includes(perm)) { res.status(403).json({ error: 'Insufficient permissions.' }); return; }
    const p2 = folder.path ?? '/';
    folderPath = p2.endsWith('/') ? p2 : p2 + '/';
  }

  const multipart = await s3Client.send(new CreateMultipartUploadCommand({
    Bucket: config.s3.bucket,
    Key: storageKey,
    ContentType: mimeType,
    Metadata: { originalName: encodeURIComponent(name), uploadedBy: user.id },
  }));

  await prisma.file.create({
    data: {
      id: fileId, name: safeName, originalName: name, mimeType, size: totalSize,
      storageKey, checksum: '', ownerId: user.id,
      folderId: folderId ?? null, path: `${folderPath}${safeName}`,
      status: FileStatus.UPLOADING,
    },
  });

  res.json({ fileId, uploadId: multipart.UploadId, storageKey });
});

filesRouter.post(
  '/upload/part',
  requireAuth,
  express.raw({ limit: '25mb', type: 'application/octet-stream' }),
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { uploadId, storageKey, partNumber } = req.query as Record<string, string>;
    if (!uploadId || !storageKey || !partNumber) { res.status(400).json({ error: 'Missing params' }); return; }

    const file = await prisma.file.findFirst({ where: { storageKey, ownerId: user.id, status: FileStatus.UPLOADING } });
    if (!file) { res.status(404).json({ error: 'Upload session not found' }); return; }

    const chunk = req.body as Buffer;
    const result = await s3Client.send(new UploadPartCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      UploadId: uploadId,
      PartNumber: parseInt(partNumber),
      Body: chunk,
      ContentLength: chunk.length,
    }));

    res.json({ etag: result.ETag, partNumber: parseInt(partNumber) });
  }
);

filesRouter.post('/upload/complete', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { fileId, uploadId, storageKey, parts } = req.body;
  try {
    const file = await prisma.file.findFirst({ where: { id: fileId, storageKey, ownerId: user.id, status: FileStatus.UPLOADING } });
    if (!file) { res.status(404).json({ error: 'Upload session not found' }); return; }

    await s3Client.send(new CompleteMultipartUploadCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: (parts as { partNumber: number; etag: string }[])
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }));

    await prisma.file.update({ where: { id: fileId }, data: { status: FileStatus.ACTIVE } });
    await incrementUsage(user.id, file.size);
    await auditFromRequest(req, AuditAction.FILE_UPLOADED, {
      entityType: 'File', entityId: fileId,
      details: { name: file.name, size: Number(file.size), folderId: file.folderId },
    });

    const result = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, mimeType: true, size: true, createdAt: true, storageKey: true, ownerId: true, folderId: true, status: true, updatedAt: true },
    });
    res.json({ file: result });
  } catch (err: any) {
    // Return a real error so the client knows to retry the complete step (parts are still valid on S3)
    res.status(500).json({ error: `Upload finalization failed: ${err.message ?? err}` });
  }
});

filesRouter.post('/upload/abort', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { fileId, uploadId, storageKey } = req.body;

  const file = await prisma.file.findFirst({ where: { id: fileId, ownerId: user.id, status: FileStatus.UPLOADING } });
  if (file) {
    await s3Client.send(new AbortMultipartUploadCommand({ Bucket: config.s3.bucket, Key: storageKey, UploadId: uploadId })).catch(() => {});
    await prisma.file.delete({ where: { id: fileId } }).catch(() => {});
  }
  res.json({ message: 'Aborted' });
});

// ── Bulk zip download ─────────────────────────────────────────
filesRouter.post('/download-zip', async (req, res) => {
  const user = req.user as any;
  const { fileIds = [], folderIds = [], name } = req.body;

  if (!Array.isArray(fileIds) || !Array.isArray(folderIds)) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  async function collectEntries(uid: string, fids: string[], dids: string[]): Promise<{ storageKey: string; zipPath: string; size: bigint }[]> {
    const entries: { storageKey: string; zipPath: string; size: bigint }[] = [];

    if (fids.length > 0) {
      const files = await prisma.file.findMany({
        where: { id: { in: fids }, ownerId: uid, isTrashed: false },
        select: { name: true, storageKey: true, size: true },
      });
      for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: f.name, size: f.size });
    }

    async function recurseFolder(folderId: string, prefix: string) {
      const [files, subs] = await Promise.all([
        prisma.file.findMany({
          where: { folderId, ownerId: uid, isTrashed: false },
          select: { name: true, storageKey: true, size: true },
        }),
        prisma.folder.findMany({
          where: { parentId: folderId, ownerId: uid, isTrashed: false, deletedAt: null },
          select: { id: true, name: true },
        }),
      ]);
      for (const f of files) entries.push({ storageKey: f.storageKey, zipPath: `${prefix}/${f.name}`, size: f.size });
      for (const sf of subs) await recurseFolder(sf.id, `${prefix}/${sf.name}`);
    }

    for (const folderId of dids) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, ownerId: uid, isTrashed: false, deletedAt: null },
        select: { name: true },
      });
      if (folder) await recurseFolder(folderId, folder.name);
    }
    return entries;
  }

  try {
    const entries = await collectEntries(user.id, fileIds, folderIds);

    if (entries.length === 0) {
      res.status(400).json({ error: 'No files to download' });
      return;
    }

    const totalBytes = entries.reduce((sum, e) => sum + e.size, BigInt(0));
    const ASYNC_THRESHOLD = BigInt(10 * 1024 * 1024); // 10 MB

    const zipName = (name as string | undefined) ?? (folderIds.length === 1 && fileIds.length === 0
      ? 'folder'
      : `download-${entries.length}-files`);

    if (totalBytes > ASYNC_THRESHOLD) {
      // Async path: create DB record and enqueue job
      const dl = await prisma.zipDownload.create({
        data: { userId: user.id, name: zipName, fileIds, folderIds, status: 'QUEUED' },
      });
      await zipQueue.add('zip-job', { downloadId: dl.id, userId: user.id }, { jobId: dl.id });
      res.json({ async: true, downloadId: dl.id });
      return;
    }

    // Sync path: stream directly for small zips
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err) => {
      logger.error('Archiver error during zip download', { err });
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    for (const entry of entries) {
      try {
        const stream = await getObjectStream(entry.storageKey);
        archive.append(stream, { name: entry.zipPath });
      } catch (err) {
        logger.warn('Skipping file in zip (stream error)', { storageKey: entry.storageKey, err });
      }
    }

    await archive.finalize();
  } catch (err) {
    logger.error('Zip download failed', { err });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create zip' });
  }
});


// ─── Zip to drive — enqueues background job ──────────────────

filesRouter.post('/zip-to-drive', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { fileIds = [], folderIds = [], name, folderId: targetFolderId = null } = req.body;
  try {
    if ((fileIds as string[]).length === 0 && (folderIds as string[]).length === 0) {
      res.status(400).json({ error: 'No files selected' }); return;
    }
    let label = ((name as string | undefined)?.trim() || 'archive');
    if (!label.endsWith('.zip')) label += '.zip';

    const jobId = uuidv4();
    await driveOpsQueue.add('drive-op', {
      type: 'zip-to-drive', userId: user.id,
      fileIds: fileIds as string[], folderIds: folderIds as string[],
      name: name as string | undefined, folderId: targetFolderId as string | null, label,
    } as DriveOpsZipJobData, { jobId });

    res.json({ jobId, label });
  } catch (err: any) {
    logger.error('zip-to-drive enqueue failed', { err });
    res.status(500).json({ error: err.message ?? 'Failed to start compression' });
  }
});

// ─── Extract zip — enqueues background job ───────────────────

filesRouter.post('/:id/extract', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  try {
    const file = await prisma.file.findFirst({
      where: { id, ownerId: user.id, isTrashed: false, status: FileStatus.ACTIVE },
      select: { name: true },
    });
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }
    if (!file.name.toLowerCase().endsWith('.zip')) { res.status(400).json({ error: 'Not a zip file' }); return; }

    const label = file.name;
    const jobId = uuidv4();
    await driveOpsQueue.add('drive-op', {
      type: 'extract', userId: user.id, fileId: id, label,
    } as DriveOpsExtractJobData, { jobId });

    res.json({ jobId, label });
  } catch (err: any) {
    logger.error('extract enqueue failed', { err });
    res.status(500).json({ error: err.message ?? 'Failed to start extraction' });
  }
});
