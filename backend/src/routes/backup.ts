import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { uploadMiddleware, sanitizeFileName } from '../middleware/upload';
import { prisma } from '../lib/prisma';
import { uploadToS3, deleteFromS3, buildStorageKey, getSignedDownloadUrl } from '../lib/s3';
import { checkQuota, incrementUsage, decrementUsage } from '../services/quotaService';
import { logger } from '../lib/logger';
import { FileStatus } from '@prisma/client';
import mime from 'mime-types';

export const backupRouter = Router();
backupRouter.use(requireAuth, requireVerifiedEmail);

// ─── Helpers ─────────────────────────────────────────────────

async function getOrCreateBackupRoot(userId: string) {
  let root = await prisma.folder.findFirst({
    where: { ownerId: userId, name: '__backups__', isBackup: true, parentId: null },
  });
  if (!root) {
    root = await prisma.folder.create({
      data: {
        name: '__backups__',
        ownerId: userId,
        parentId: null,
        isBackup: true,
        path: '/__backups__',
        depth: 0,
      },
    });
  }
  return root;
}

async function getOrCreateFolder(userId: string, name: string, parentId: string, parentPath: string, depth: number) {
  let folder = await prisma.folder.findFirst({
    where: { ownerId: userId, name, parentId, isBackup: true },
  });
  if (!folder) {
    folder = await prisma.folder.create({
      data: {
        name,
        ownerId: userId,
        parentId,
        isBackup: true,
        path: `${parentPath}/${name}`,
        depth,
      },
    });
  }
  return folder;
}

async function deleteFolderRecursive(folderId: string, userId: string): Promise<bigint> {
  const files = await prisma.file.findMany({
    where: { folderId, ownerId: userId, isBackup: true },
    select: { id: true, storageKey: true, size: true },
  });

  let totalBytes = BigInt(0);
  for (const file of files) {
    try { await deleteFromS3(file.storageKey); } catch { /* ignore */ }
    totalBytes += file.size;
  }
  await prisma.file.deleteMany({ where: { folderId, ownerId: userId, isBackup: true } });

  const children = await prisma.folder.findMany({ where: { parentId: folderId, ownerId: userId } });
  for (const child of children) {
    totalBytes += await deleteFolderRecursive(child.id, userId);
  }

  await prisma.folder.delete({ where: { id: folderId } });
  return totalBytes;
}

async function setFolderBackupFalseRecursive(folderId: string): Promise<void> {
  await prisma.file.updateMany({ where: { folderId, isBackup: true }, data: { isBackup: false, backupSource: null } });
  const children = await prisma.folder.findMany({ where: { parentId: folderId } });
  for (const child of children) {
    await setFolderBackupFalseRecursive(child.id);
  }
  await prisma.folder.update({ where: { id: folderId }, data: { isBackup: false } });
}

// ─── List backup root ────────────────────────────────────────

backupRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const root = await prisma.folder.findFirst({
    where: { ownerId: user.id, name: '__backups__', isBackup: true, parentId: null },
  });
  if (!root) {
    res.json({ folders: [], files: [] });
    return;
  }

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: root.id, ownerId: user.id, isBackup: true, isTrashed: false },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, parentId: true, path: true, depth: true,
        isBackup: true, color: true, createdAt: true, updatedAt: true,
        _count: { select: { files: { where: { isTrashed: false } }, children: { where: { isTrashed: false } } } },
      },
    }),
    prisma.file.findMany({
      where: { folderId: root.id, ownerId: user.id, isBackup: true, isTrashed: false, status: FileStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, mimeType: true, size: true, folderId: true,
        isBackup: true, backupSource: true, path: true, createdAt: true, updatedAt: true,
        thumbnailKey: true, status: true,
      },
    }),
  ]);

  res.json({
    folders: folders.map((f) => ({ ...f, fileCount: f._count.files, folderCount: f._count.children })),
    files: files.map((f) => ({ ...f, size: f.size.toString() })),
  });
});

// ─── List backup folder ──────────────────────────────────────

backupRouter.get('/folder/:folderId', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { folderId } = req.params;

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: user.id, isBackup: true },
  });
  if (!folder) {
    res.status(404).json({ error: 'Backup folder not found.' });
    return;
  }

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId, ownerId: user.id, isBackup: true, isTrashed: false },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, parentId: true, path: true, depth: true,
        isBackup: true, color: true, createdAt: true, updatedAt: true,
        _count: { select: { files: { where: { isTrashed: false } }, children: { where: { isTrashed: false } } } },
      },
    }),
    prisma.file.findMany({
      where: { folderId, ownerId: user.id, isBackup: true, isTrashed: false, status: FileStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, mimeType: true, size: true, folderId: true,
        isBackup: true, backupSource: true, path: true, createdAt: true, updatedAt: true,
        thumbnailKey: true, status: true,
      },
    }),
  ]);

  res.json({
    folder,
    folders: folders.map((f) => ({ ...f, fileCount: f._count.files, folderCount: f._count.children })),
    files: files.map((f) => ({ ...f, size: f.size.toString() })),
  });
});

// ─── Upload backup file ──────────────────────────────────────

backupRouter.post(
  '/upload',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }

    const { remotePath, source } = req.body;
    if (!remotePath || !source) {
      res.status(400).json({ error: 'remotePath and source are required.' });
      return;
    }

    try {
      const totalSize = BigInt(uploadedFile.size);
      const hasQuota = await checkQuota(user.id, totalSize);
      if (!hasQuota) {
        res.status(413).json({ error: 'Storage quota exceeded.' });
        return;
      }

      // Build folder path: __backups__ / source / ...dirs from remotePath...
      const root = await getOrCreateBackupRoot(user.id);

      // Strip leading slash and split remote path into parts
      const parts = remotePath.replace(/^\//, '').split('/').filter(Boolean);
      const filename = parts.pop() || uploadedFile.originalname;
      const dirParts = [source, ...parts]; // source becomes first folder segment

      let currentParentId = root.id;
      let currentPath = root.path;
      let currentDepth = root.depth + 1;

      for (const part of dirParts) {
        const folder = await getOrCreateFolder(user.id, part, currentParentId, currentPath, currentDepth);
        currentParentId = folder.id;
        currentPath = folder.path;
        currentDepth = folder.depth + 1;
      }

      const safeName = sanitizeFileName(filename);
      const fileId = uuidv4();
      const storageKey = buildStorageKey(user.id, fileId, safeName);
      const checksum = crypto.createHash('sha256').update(uploadedFile.buffer).digest('hex');
      const detectedMime = mime.lookup(safeName) || uploadedFile.mimetype || 'application/octet-stream';

      // Check if a file with same path already exists — update it (replace)
      const existing = await prisma.file.findFirst({
        where: { folderId: currentParentId, name: safeName, ownerId: user.id, isBackup: true, isTrashed: false },
      });

      if (existing) {
        // Delete old S3 object
        try { await deleteFromS3(existing.storageKey); } catch { /* ignore */ }
        await decrementUsage(user.id, existing.size);

        await uploadToS3(storageKey, uploadedFile.buffer, detectedMime, { checksum });
        await prisma.file.update({
          where: { id: existing.id },
          data: {
            storageKey,
            size: totalSize,
            checksum,
            mimeType: detectedMime,
            status: FileStatus.ACTIVE,
            updatedAt: new Date(),
          },
        });
        await incrementUsage(user.id, totalSize);

        res.json({ id: existing.id, name: safeName, replaced: true });
        return;
      }

      // New file
      const dbFile = await prisma.file.create({
        data: {
          id: fileId,
          name: safeName,
          originalName: filename,
          mimeType: detectedMime,
          size: totalSize,
          storageKey,
          checksum,
          ownerId: user.id,
          folderId: currentParentId,
          isBackup: true,
          backupSource: source,
          path: `${currentPath}/${safeName}`,
          status: FileStatus.UPLOADING,
        },
      });

      await uploadToS3(storageKey, uploadedFile.buffer, detectedMime, { checksum });
      await prisma.file.update({ where: { id: dbFile.id }, data: { status: FileStatus.ACTIVE } });
      await incrementUsage(user.id, totalSize);

      res.json({ id: dbFile.id, name: safeName, replaced: false });
    } catch (err) {
      logger.error('Backup upload error', { error: (err as Error).message });
      res.status(500).json({ error: 'Upload failed.' });
    }
  }
);

// ─── Promote file to main ────────────────────────────────────

backupRouter.post('/promote/file/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findFirst({ where: { id, ownerId: user.id, isBackup: true } });
  if (!file) {
    res.status(404).json({ error: 'Backup file not found.' });
    return;
  }

  await prisma.file.update({
    where: { id },
    data: { isBackup: false, backupSource: null, folderId: null, path: `/${file.name}` },
  });

  res.json({ message: 'File moved to My Drive.' });
});

// ─── Promote folder to main ──────────────────────────────────

backupRouter.post('/promote/folder/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findFirst({ where: { id, ownerId: user.id, isBackup: true } });
  if (!folder) {
    res.status(404).json({ error: 'Backup folder not found.' });
    return;
  }

  await setFolderBackupFalseRecursive(id);
  await prisma.folder.update({ where: { id }, data: { parentId: null, path: `/${folder.name}`, depth: 0 } });

  res.json({ message: 'Folder moved to My Drive.' });
});

// ─── Delete backup file ──────────────────────────────────────

backupRouter.delete('/file/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const file = await prisma.file.findFirst({ where: { id, ownerId: user.id, isBackup: true } });
  if (!file) {
    res.status(404).json({ error: 'Backup file not found.' });
    return;
  }

  try { await deleteFromS3(file.storageKey); } catch { /* ignore */ }
  await prisma.file.delete({ where: { id } });
  await decrementUsage(user.id, file.size);

  res.json({ message: 'Backup file deleted.' });
});

// ─── Delete backup folder ────────────────────────────────────

backupRouter.delete('/folder/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findFirst({ where: { id, ownerId: user.id, isBackup: true } });
  if (!folder) {
    res.status(404).json({ error: 'Backup folder not found.' });
    return;
  }

  const freedBytes = await deleteFolderRecursive(id, user.id);
  if (freedBytes > BigInt(0)) await decrementUsage(user.id, freedBytes);

  res.json({ message: 'Backup folder deleted.' });
});
