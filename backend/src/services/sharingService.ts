import { SharePermission } from '@prisma/client';
import { prisma } from '../lib/prisma';

const PERMISSION_RANK: Record<SharePermission, number> = {
  VIEWER: 1,
  DOWNLOADER: 2,
  CONTRIBUTOR: 3,
  EDITOR: 4,
  OWNER: 5,
};

export function hasPermission(
  userPermission: SharePermission,
  required: SharePermission
): boolean {
  return PERMISSION_RANK[userPermission] >= PERMISSION_RANK[required];
}

/**
 * Get the effective permission a user has on a folder.
 * Checks direct share on this folder, then walks up the tree for inherited permissions.
 * Returns null if no access.
 */
export async function getEffectivePermission(
  userId: string,
  folderId: string
): Promise<SharePermission | null> {
  // Check if user owns the folder
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ownerId: true, parentId: true, isTrashed: true },
  });

  if (!folder || folder.isTrashed) return null;
  if (folder.ownerId === userId) return SharePermission.OWNER;

  // Check direct share
  const directShare = await prisma.folderShare.findFirst({
    where: { folderId, recipientId: userId, revokedAt: null },
    select: { permission: true },
  });

  if (directShare) return directShare.permission;

  // Walk up tree for inherited permissions
  if (folder.parentId) {
    return getEffectivePermission(userId, folder.parentId);
  }

  return null;
}

export async function checkFileAccess(
  userId: string,
  fileId: string,
  required: SharePermission
): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true, folderId: true, isTrashed: true, status: true },
  });

  if (!file || file.status === 'DELETED') return false;
  if (file.ownerId === userId) return true;

  if (!file.folderId) return false;

  const permission = await getEffectivePermission(userId, file.folderId);
  if (!permission) return false;

  return hasPermission(permission, required);
}

export async function shareFolder(
  folderId: string,
  ownerId: string,
  recipientEmail: string,
  permission: SharePermission,
  canReshare = false
): Promise<void> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId, isTrashed: false },
  });
  if (!folder) throw new Error('Folder not found.');
  if (!folder.isShared) throw new Error('Folder must be marked shareable first.');

  const recipient = await prisma.user.findUnique({
    where: { email: recipientEmail.toLowerCase() },
    select: { id: true },
  });

  await prisma.folderShare.upsert({
    where: {
      folderId_recipientId: {
        folderId,
        recipientId: recipient?.id ?? 'pending',
      },
    },
    update: { permission, canReshare, revokedAt: null },
    create: {
      folderId,
      ownerId,
      recipientId: recipient?.id,
      recipientEmail: recipient ? null : recipientEmail.toLowerCase(),
      permission,
      canReshare,
    },
  });
}

export async function updateSharePermission(
  shareId: string,
  requesterId: string,
  permission: SharePermission,
  canReshare?: boolean
): Promise<void> {
  const share = await prisma.folderShare.findUnique({ where: { id: shareId } });
  if (!share) throw new Error('Share not found.');
  if (share.ownerId !== requesterId) throw new Error('Not authorized.');

  await prisma.folderShare.update({
    where: { id: shareId },
    data: { permission, canReshare: canReshare ?? share.canReshare },
  });
}

export async function revokeShare(shareId: string, requesterId: string): Promise<void> {
  const share = await prisma.folderShare.findUnique({ where: { id: shareId } });
  if (!share) throw new Error('Share not found.');
  if (share.ownerId !== requesterId) throw new Error('Not authorized.');

  await prisma.folderShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}
