import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { logger } from '../lib/logger';

export const syncRouter = Router();

syncRouter.use(requireAuth, requireVerifiedEmail);

// Full state snapshot — used for initial sync
syncRouter.get('/state', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { ownerId: user.id, isTrashed: false, deletedAt: null },
        select: {
          id: true,
          name: true,
          parentId: true,
          path: true,
          updatedAt: true,
        },
        orderBy: { path: 'asc' },
      }),
      prisma.file.findMany({
        where: { ownerId: user.id, isTrashed: false, deletedAt: null, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          folderId: true,
          path: true,
          size: true,
          checksum: true,
          mimeType: true,
          updatedAt: true,
        },
        orderBy: { path: 'asc' },
      }),
    ]);

    res.json({
      folders,
      files: files.map(f => ({ ...f, size: f.size.toString() })),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Sync state error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch sync state.' });
  }
});

// Delta changes since a timestamp
syncRouter.get('/changes', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const since = req.query.since as string;

    if (!since) {
      return res.status(400).json({ error: 'Missing "since" query parameter.' });
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid "since" date format.' });
    }

    const [folders, files, trashedFolders, trashedFiles] = await Promise.all([
      // Updated/created folders since timestamp
      prisma.folder.findMany({
        where: {
          ownerId: user.id,
          isTrashed: false,
          deletedAt: null,
          updatedAt: { gt: sinceDate },
        },
        select: {
          id: true,
          name: true,
          parentId: true,
          path: true,
          updatedAt: true,
        },
      }),
      // Updated/created files since timestamp
      prisma.file.findMany({
        where: {
          ownerId: user.id,
          isTrashed: false,
          deletedAt: null,
          status: 'ACTIVE',
          updatedAt: { gt: sinceDate },
        },
        select: {
          id: true,
          name: true,
          folderId: true,
          path: true,
          size: true,
          checksum: true,
          mimeType: true,
          updatedAt: true,
        },
      }),
      // Folders trashed or deleted since timestamp
      prisma.folder.findMany({
        where: {
          ownerId: user.id,
          OR: [
            { isTrashed: true, trashedAt: { gt: sinceDate } },
            { deletedAt: { gt: sinceDate } },
          ],
        },
        select: { id: true },
      }),
      // Files trashed or deleted since timestamp
      prisma.file.findMany({
        where: {
          ownerId: user.id,
          OR: [
            { isTrashed: true, trashedAt: { gt: sinceDate } },
            { deletedAt: { gt: sinceDate } },
          ],
        },
        select: { id: true },
      }),
    ]);

    res.json({
      folders,
      files: files.map(f => ({ ...f, size: f.size.toString() })),
      trashedFolderIds: trashedFolders.map(f => f.id),
      trashedFileIds: trashedFiles.map(f => f.id),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Sync changes error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch sync changes.' });
  }
});
