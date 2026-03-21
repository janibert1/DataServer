import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import path from 'path';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { uploadMiddleware, sanitizeFileName } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../lib/prisma';
import { uploadToS3, getSignedDownloadUrl, deleteFromS3, buildStorageKey, getObjectStream } from '../lib/s3';
import { auditFromRequest } from '../services/auditService';
import { checkFileAccess, getEffectivePermission } from '../services/sharingService';
import { checkQuota, incrementUsage, decrementUsage } from '../services/quotaService';
import { AuditAction, FileStatus, SharePermission } from '@prisma/client';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

export const filesRouter = Router();

filesRouter.use(requireAuth, requireVerifiedEmail);

// ─── List files ──────────────────────────────────────────────

filesRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { search, folderId, sortBy = 'updatedAt', sortDir = 'desc', page = '1', limit = '50' } = req.query as any;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    ownerId: user.id,
    isTrashed: false,
    status: { in: [FileStatus.ACTIVE, FileStatus.PROCESSING] },
  };

  if (folderId) where.folderId = folderId;
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
  const files = await prisma.file.findMany({
    where: { ownerId: user.id, isTrashed: true, status: { not: FileStatus.DELETED } },
    orderBy: { trashedAt: 'desc' },
    select: {
      id: true, name: true, mimeType: true, size: true, trashedAt: true, path: true,
    },
  });
  res.json({ files: files.map((f) => ({ ...f, size: f.size.toString() })) });
});

// ─── Upload file ─────────────────────────────────────────────

filesRouter.post(
  '/upload',
  uploadRateLimiter,
  uploadMiddleware.array('files', 20),
  async (req: Request, res: Response) => {
    const user = req.user as any;
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

        const fileId = uuidv4();
        const safeName = sanitizeFileName(file.originalname);
        const storageKey = buildStorageKey(user.id, fileId, safeName);
        const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

        // Get folder path for display
        let folderPath = '/';
        if (folderId) {
          const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { path: true } });
          folderPath = folder?.path ?? '/';
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
          status: FileStatus.ACTIVE,
        });
      } catch (error) {
        logger.error('File upload error', { error, filename: file.originalname });
        errors.push({ filename: file.originalname, error: 'Upload failed.' });
      }
    }

    res.json({ uploaded: results, errors });
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

filesRouter.post('/:id/trash', async (req: Request, res: Response) => {
  const user = req.user as any;
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

// ─── Empty trash ─────────────────────────────────────────────

filesRouter.post('/empty-trash', async (req: Request, res: Response) => {
  const user = req.user as any;

  const trashedFiles = await prisma.file.findMany({
    where: { ownerId: user.id, isTrashed: true },
    select: { id: true, storageKey: true, size: true },
  });

  for (const file of trashedFiles) {
    try {
      await deleteFromS3(file.storageKey);
      await decrementUsage(user.id, file.size);
    } catch (err) {
      logger.error('Failed to delete file from S3 during trash empty', { err });
    }
  }

  await prisma.file.updateMany({
    where: { ownerId: user.id, isTrashed: true },
    data: { status: FileStatus.DELETED, deletedAt: new Date() },
  });

  res.json({ message: `Permanently deleted ${trashedFiles.length} file(s).`, count: trashedFiles.length });
});
