import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

interface CreateNotificationOptions {
  userId: string;
  senderId?: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function createNotification(opts: CreateNotificationOptions) {
  try {
    return await prisma.notification.create({
      data: {
        userId: opts.userId,
        senderId: opts.senderId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link,
      },
    });
  } catch (error) {
    logger.error('Failed to create notification', { error, opts });
  }
}

export async function notifyFolderShared(
  recipientId: string,
  senderId: string,
  folderName: string,
  folderId: string
) {
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { displayName: true } });
  await createNotification({
    userId: recipientId,
    senderId,
    type: NotificationType.FOLDER_SHARED,
    title: 'Folder shared with you',
    body: `${sender?.displayName ?? 'Someone'} shared "${folderName}" with you.`,
    link: `/drive/shared-with-me`,
  });
}

export async function notifyInvitationAccepted(
  creatorId: string,
  acceptorName: string
) {
  await createNotification({
    userId: creatorId,
    type: NotificationType.INVITATION_ACCEPTED,
    title: 'Invitation accepted',
    body: `${acceptorName} accepted your invitation and joined DataServer.`,
  });
}

export async function notifyAccessRevoked(
  recipientId: string,
  folderName: string
) {
  await createNotification({
    userId: recipientId,
    type: NotificationType.ACCESS_REVOKED,
    title: 'Access revoked',
    body: `Your access to "${folderName}" has been revoked.`,
    link: '/drive/shared-with-me',
  });
}

export async function notifyStorageNearlyFull(
  userId: string,
  percent: number
) {
  await createNotification({
    userId,
    type: NotificationType.STORAGE_NEARLY_FULL,
    title: 'Storage almost full',
    body: `Your storage is ${percent}% full. Consider freeing up space.`,
    link: '/drive/settings',
  });
}

export async function notifySecurityChange(
  userId: string,
  title: string,
  body: string
) {
  await createNotification({
    userId,
    type: NotificationType.SECURITY_CHANGE,
    title,
    body,
    link: '/drive/security',
  });
}
