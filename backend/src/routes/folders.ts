import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/auditService';
import { getEffectivePermission, shareFolder, updateSharePermission, revokeShare } from '../services/sharingService';
import { notifyFolderShared } from '../services/notificationService';
import { sanitizeFileName } from '../middleware/upload';
import { AuditAction, SharePermission } from '@prisma/client';
import { sendFolderSharedEmail } from '../lib/mailer';
import { config } from '../config';

export const foldersRouter = Router();
foldersRouter.use(requireAuth, requireVerifiedEmail);

// ─── List folders ────────────────────────────────────────────

foldersRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { parentId, search } = req.query as any;

  const where: any = {
    ownerId: user.id,
    isTrashed: false,
    deletedAt: null,
  };

  if (parentId === 'root' || !parentId) {
    where.parentId = null;
  } else {
    where.parentId = parentId;
  }

  if (search) where.name = { contains: search, mode: 'insensitive' };

  const folders = await prisma.folder.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, parentId: true, path: true, depth: true,
      isShared: true, color: true, description: true, createdAt: true, updatedAt: true,
      starredBy: { where: { userId: user.id }, select: { id: true } },
      _count: { select: { files: { where: { isTrashed: false } }, children: { where: { isTrashed: false } } } },
    },
  });

  res.json({
    folders: folders.map((f) => ({
      ...f,
      isStarred: f.starredBy.length > 0,
      fileCount: f._count.files,
      folderCount: f._count.children,
    })),
  });
});

// ─── Starred folders ─────────────────────────────────────────

foldersRouter.get('/starred', async (req: Request, res: Response) => {
  const user = req.user as any;

  const starredItems = await prisma.starredItem.findMany({
    where: { userId: user.id, folderId: { not: null } },
    include: {
      folder: {
        select: {
          id: true, name: true, parentId: true, path: true, depth: true,
          isShared: true, color: true, createdAt: true, updatedAt: true,
          _count: { select: { files: { where: { isTrashed: false } }, children: { where: { isTrashed: false } } } },
        },
      },
    },
  });

  const folders = starredItems
    .filter((s) => s.folder !== null)
    .map((s) => ({
      ...s.folder!,
      isStarred: true,
      fileCount: s.folder!._count.files,
      folderCount: s.folder!._count.children,
    }));

  res.json({ folders });
});

// ─── List trashed folders ────────────────────────────────────

foldersRouter.get('/trashed', async (req: Request, res: Response) => {
  const user = req.user as any;

  const folders = await prisma.folder.findMany({
    where: { ownerId: user.id, isTrashed: true, deletedAt: null },
    orderBy: { trashedAt: 'desc' },
    select: {
      id: true, name: true, color: true, trashedAt: true, parentId: true,
      _count: { select: { files: true, children: true } },
    },
  });

  res.json({ folders });
});

// ─── Permanently delete folder ──────────────────────────────

foldersRouter.delete('/:id/permanent', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!folder || !folder.isTrashed) {
    res.status(404).json({ error: 'Folder not found in trash.' });
    return;
  }
  if (folder.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can permanently delete folders.' });
    return;
  }

  // Permanently delete the folder and cascade to children
  await prisma.folder.update({ where: { id }, data: { deletedAt: new Date() } });
  res.json({ message: 'Folder permanently deleted.' });
});

// ─── Create folder ───────────────────────────────────────────

foldersRouter.post(
  '/',
  [body('name').trim().isLength({ min: 1, max: 255 })],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = req.user as any;
    const { name, parentId, color } = req.body;

    const safeName = sanitizeFileName(name);

    // Verify parent exists and is accessible
    let parentPath = '/';
    let parentDepth = 0;
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, ownerId: user.id, isTrashed: false },
        select: { path: true, depth: true },
      });
      if (!parent) {
        res.status(404).json({ error: 'Parent folder not found.' });
        return;
      }
      parentPath = parent.path.endsWith('/') ? parent.path : `${parent.path}/`;
      parentDepth = parent.depth + 1;
    }

    // Check for duplicate name in same directory
    const duplicate = await prisma.folder.findFirst({
      where: {
        ownerId: user.id,
        parentId: parentId ?? null,
        name: safeName,
        isTrashed: false,
      },
    });
    if (duplicate) {
      res.status(409).json({ error: 'A folder with that name already exists here.' });
      return;
    }

    const folder = await prisma.folder.create({
      data: {
        name: safeName,
        ownerId: user.id,
        parentId: parentId ?? null,
        path: `${parentPath}${safeName}`,
        depth: parentDepth,
        color: color ?? null,
      },
    });

    await auditFromRequest(req, AuditAction.FOLDER_CREATED, {
      entityType: 'Folder',
      entityId: folder.id,
      details: { name: safeName, parentId },
    });

    res.status(201).json({ folder });
  }
);

// ─── Get folder ──────────────────────────────────────────────

foldersRouter.get('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findUnique({
    where: { id },
    select: {
      id: true, name: true, ownerId: true, parentId: true, path: true, depth: true,
      isShared: true, color: true, description: true, createdAt: true, updatedAt: true,
      starredBy: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!folder || folder.ownerId !== user.id) {
    const permission = await getEffectivePermission(user.id, id);
    if (!permission) {
      res.status(404).json({ error: 'Folder not found.' });
      return;
    }
  }

  res.json({ folder: { ...folder, isStarred: (folder?.starredBy?.length ?? 0) > 0 } });
});

// ─── Folder contents ─────────────────────────────────────────

foldersRouter.get('/:id/contents', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  const { sortBy = 'name', sortDir = 'asc' } = req.query as any;

  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!folder || folder.isTrashed) {
    res.status(404).json({ error: 'Folder not found.' });
    return;
  }

  const permission = folder.ownerId === user.id
    ? SharePermission.OWNER
    : await getEffectivePermission(user.id, id);

  if (!permission) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const validSort = ['name', 'createdAt', 'updatedAt', 'size'];
  const sortField = validSort.includes(sortBy) ? sortBy : 'name';
  const sortDirection = sortDir === 'desc' ? 'desc' : 'asc';

  const [subfolders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: id, isTrashed: false, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, path: true, depth: true, isShared: true, color: true, updatedAt: true,
        starredBy: { where: { userId: user.id }, select: { id: true } },
        _count: { select: { files: { where: { isTrashed: false } }, children: { where: { isTrashed: false } } } },
      },
    }),
    prisma.file.findMany({
      where: { folderId: id, isTrashed: false, status: { not: 'DELETED' } },
      orderBy: { [sortField === 'name' ? 'name' : sortField]: sortDirection },
      select: {
        id: true, name: true, mimeType: true, size: true,
        thumbnailKey: true, status: true, updatedAt: true, createdAt: true,
        starredBy: { where: { userId: user.id }, select: { id: true } },
      },
    }),
  ]);

  res.json({
    permission,
    folders: subfolders.map((f) => ({
      ...f,
      isStarred: f.starredBy.length > 0,
      fileCount: f._count.files,
      folderCount: f._count.children,
    })),
    files: files.map((f) => ({ ...f, size: f.size.toString(), isStarred: f.starredBy.length > 0 })),
  });
});

// ─── Rename folder ───────────────────────────────────────────

foldersRouter.patch(
  '/:id',
  [body('name').trim().isLength({ min: 1, max: 255 })],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { id } = req.params;
    const { name, color, description } = req.body;

    const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
    if (!folder || folder.isTrashed) {
      res.status(404).json({ error: 'Folder not found.' });
      return;
    }
    if (folder.ownerId !== user.id) {
      res.status(403).json({ error: 'Only the owner can modify this folder.' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = sanitizeFileName(name);
    if (color !== undefined) updateData.color = color;
    if (description !== undefined) updateData.description = description;

    await prisma.folder.update({ where: { id }, data: updateData });
    await auditFromRequest(req, AuditAction.FOLDER_RENAMED, { entityType: 'Folder', entityId: id, details: { name } });
    res.json({ message: 'Folder updated.' });
  }
);

// ─── Move folder ─────────────────────────────────────────────

foldersRouter.put('/:id/move', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  const { parentId } = req.body;

  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!folder || folder.isTrashed) {
    res.status(404).json({ error: 'Folder not found.' });
    return;
  }
  if (folder.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can move this folder.' });
    return;
  }
  if (parentId === id) {
    res.status(400).json({ error: 'Cannot move folder into itself.' });
    return;
  }

  await prisma.folder.update({ where: { id }, data: { parentId: parentId ?? null } });
  await auditFromRequest(req, AuditAction.FOLDER_MOVED, { entityType: 'Folder', entityId: id, details: { parentId } });
  res.json({ message: 'Folder moved.' });
});

// ─── Trash / restore ─────────────────────────────────────────

foldersRouter.post('/:id/trash', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!folder || folder.isTrashed) {
    res.status(404).json({ error: 'Folder not found.' });
    return;
  }
  if (folder.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can trash this folder.' });
    return;
  }

  const now = new Date();

  // Recursively collect all descendant folder IDs
  async function getDescendantFolderIds(parentId: string): Promise<string[]> {
    const children = await prisma.folder.findMany({
      where: { parentId, isTrashed: false },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      ids.push(...await getDescendantFolderIds(child.id));
    }
    return ids;
  }

  const descendantIds = await getDescendantFolderIds(id);
  const allFolderIds = [id, ...descendantIds];

  // Trash the folder, all subfolders, and all files inside them
  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds } },
      data: { isTrashed: true, trashedAt: now },
    }),
    prisma.file.updateMany({
      where: { folderId: { in: allFolderIds }, isTrashed: false },
      data: { isTrashed: true, trashedAt: now },
    }),
  ]);

  await auditFromRequest(req, AuditAction.FOLDER_DELETED, { entityType: 'Folder', entityId: id });
  res.json({ message: 'Folder moved to trash.' });
});

foldersRouter.post('/:id/restore', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true, isTrashed: true } });
  if (!folder || !folder.isTrashed) {
    res.status(404).json({ error: 'Folder not found in trash.' });
    return;
  }
  if (folder.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the owner can restore this folder.' });
    return;
  }

  // Recursively collect all descendant folder IDs
  async function getDescendantFolderIds(parentId: string): Promise<string[]> {
    const children = await prisma.folder.findMany({
      where: { parentId, isTrashed: true },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      ids.push(...await getDescendantFolderIds(child.id));
    }
    return ids;
  }

  const descendantIds = await getDescendantFolderIds(id);
  const allFolderIds = [id, ...descendantIds];

  // Restore the folder, all subfolders, and all files inside them
  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds } },
      data: { isTrashed: false, trashedAt: null },
    }),
    prisma.file.updateMany({
      where: { folderId: { in: allFolderIds }, isTrashed: true },
      data: { isTrashed: false, trashedAt: null },
    }),
  ]);

  res.json({ message: 'Folder restored.' });
});

// ─── Star folder ─────────────────────────────────────────────

foldersRouter.post('/:id/star', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const existing = await prisma.starredItem.findUnique({
    where: { userId_folderId: { userId: user.id, folderId: id } },
  });

  if (existing) {
    await prisma.starredItem.delete({ where: { userId_folderId: { userId: user.id, folderId: id } } });
    res.json({ starred: false });
  } else {
    await prisma.starredItem.create({ data: { userId: user.id, folderId: id } });
    res.json({ starred: true });
  }
});

// ─── Share folder ────────────────────────────────────────────

foldersRouter.get('/:id/share-info', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const folder = await prisma.folder.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true, name: true, isShared: true },
  });
  if (!folder) {
    res.status(404).json({ error: 'Folder not found.' });
    return;
  }

  const shares = await prisma.folderShare.findMany({
    where: { folderId: id, revokedAt: null },
    include: {
      recipient: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
  });

  res.json({ folder, shares });
});

foldersRouter.post(
  '/:id/share',
  [
    body('email').isEmail().normalizeEmail(),
    body('permission').isIn(Object.values(SharePermission)),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = req.user as any;
    const { id } = req.params;
    const { email, permission, canReshare = false } = req.body;

    try {
      await shareFolder(id, user.id, email, permission as SharePermission, canReshare);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const recipient = await prisma.user.findUnique({
      where: { email },
      select: { id: true, displayName: true },
    });

    const folder = await prisma.folder.findUnique({ where: { id }, select: { name: true } });

    if (recipient && folder) {
      await notifyFolderShared(recipient.id, user.id, folder.name, id);
      await sendFolderSharedEmail(
        email,
        recipient.displayName,
        (req.user as any).displayName,
        folder.name,
        permission,
        `${config.frontendUrl}/drive/shared-with-me`
      ).catch(() => {});
    }

    await auditFromRequest(req, AuditAction.FOLDER_SHARED, {
      entityType: 'Folder',
      entityId: id,
      details: { email, permission },
    });

    res.json({ message: 'Folder shared.' });
  }
);

foldersRouter.patch('/:id/share/:shareId', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { shareId } = req.params;
  const { permission, canReshare } = req.body;

  try {
    await updateSharePermission(shareId, user.id, permission, canReshare);
    await auditFromRequest(req, AuditAction.PERMISSION_CHANGED, {
      entityType: 'FolderShare',
      entityId: shareId,
      details: { permission },
    });
    res.json({ message: 'Permission updated.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

foldersRouter.delete('/:id/share/:shareId', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { shareId } = req.params;

  try {
    await revokeShare(shareId, user.id);
    await auditFromRequest(req, AuditAction.FOLDER_UNSHARED, { entityType: 'FolderShare', entityId: shareId });
    res.json({ message: 'Access revoked.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle shareable flag
foldersRouter.patch('/:id/shareable', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  const { isShared } = req.body;

  const folder = await prisma.folder.findFirst({ where: { id, ownerId: user.id } });
  if (!folder) {
    res.status(404).json({ error: 'Folder not found.' });
    return;
  }

  await prisma.folder.update({ where: { id }, data: { isShared: Boolean(isShared) } });
  res.json({ isShared: Boolean(isShared) });
});
