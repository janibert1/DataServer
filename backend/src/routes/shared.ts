import { Router, Request, Response } from 'express';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getEffectivePermission } from '../services/sharingService';
import { SharePermission, FileStatus } from '@prisma/client';

export const sharedRouter = Router();
sharedRouter.use(requireAuth, requireVerifiedEmail);

// ─── Shared with me ──────────────────────────────────────────

sharedRouter.get('/with-me', async (req: Request, res: Response) => {
  const user = req.user as any;

  const shares = await prisma.folderShare.findMany({
    where: { recipientId: user.id, revokedAt: null },
    include: {
      folder: {
        select: {
          id: true, name: true, path: true, isShared: true,
          color: true, updatedAt: true,
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
          _count: { select: { files: { where: { isTrashed: false } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    shares: shares
      .filter((s) => s.folder)
      .map((s) => ({
        shareId: s.id,
        permission: s.permission,
        canReshare: s.canReshare,
        sharedAt: s.createdAt,
        folder: {
          ...s.folder,
          fileCount: s.folder._count.files,
        },
      })),
  });
});

// ─── Shared by me ────────────────────────────────────────────

sharedRouter.get('/by-me', async (req: Request, res: Response) => {
  const user = req.user as any;

  const shares = await prisma.folderShare.findMany({
    where: { ownerId: user.id, revokedAt: null },
    include: {
      folder: { select: { id: true, name: true, path: true, color: true } },
      recipient: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ shares });
});

// ─── Browse shared folder contents ───────────────────────────

sharedRouter.get('/folder/:folderId/contents', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { folderId } = req.params;

  const permission = await getEffectivePermission(user.id, folderId);
  if (!permission) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const [subfolders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId, isTrashed: false, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, path: true, color: true, updatedAt: true,
        _count: { select: { files: { where: { isTrashed: false } } } },
      },
    }),
    prisma.file.findMany({
      where: { folderId, isTrashed: false, status: FileStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, mimeType: true, size: true,
        thumbnailKey: true, updatedAt: true,
      },
    }),
  ]);

  res.json({
    permission,
    folders: subfolders.map((f) => ({ ...f, fileCount: f._count.files })),
    files: files.map((f) => ({ ...f, size: f.size.toString() })),
  });
});
