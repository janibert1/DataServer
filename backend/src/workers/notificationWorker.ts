import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { config } from '../config';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPlatformInvitationEmail,
  sendFolderSharedEmail,
  sendStorageWarningEmail,
} from '../lib/mailer';

// ─── Job data shapes ──────────────────────────────────────────────────────────

export interface EmailVerificationJobData {
  type: 'email_verification';
  userId: string;
  email: string;
  token: string;
}

export interface PasswordResetJobData {
  type: 'password_reset';
  email: string;
  token: string;
}

export interface PlatformInvitationJobData {
  type: 'platform_invitation';
  email: string;
  code: string;
  inviterName: string;
  note?: string | null;
}

export interface FolderSharedJobData {
  type: 'folder_shared';
  email: string;
  folderName: string;
  sharedByName: string;
  permission: string;
  inviteCode?: string;
}

export interface StorageWarningJobData {
  type: 'storage_warning';
  userId: string;
  email: string;
  usedBytes: number;
  quotaBytes: number;
}

export type NotificationJobData =
  | EmailVerificationJobData
  | PasswordResetJobData
  | PlatformInvitationJobData
  | FolderSharedJobData
  | StorageWarningJobData;

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleEmailVerification(data: EmailVerificationJobData): Promise<void> {
  // Look up the user's display name from the DB
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { displayName: true },
  });

  const displayName = user?.displayName ?? 'User';
  const verificationUrl = `${config.frontendUrl}/verify-email?token=${data.token}`;

  await sendVerificationEmail(data.email, displayName, verificationUrl);
  logger.info('Notification: verification email sent', { userId: data.userId });
}

async function handlePasswordReset(data: PasswordResetJobData): Promise<void> {
  // Look up display name by email
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { displayName: true },
  });

  const displayName = user?.displayName ?? 'User';
  const resetUrl = `${config.frontendUrl}/reset-password?token=${data.token}`;

  await sendPasswordResetEmail(data.email, displayName, resetUrl);
  logger.info('Notification: password reset email sent', { email: data.email });
}

async function handlePlatformInvitation(data: PlatformInvitationJobData): Promise<void> {
  const registrationUrl = `${config.frontendUrl}/register?code=${data.code}`;

  await sendPlatformInvitationEmail(
    data.email,
    data.code,
    data.inviterName,
    data.note ?? null,
    registrationUrl
  );
  logger.info('Notification: platform invitation email sent', { email: data.email });
}

async function handleFolderShared(data: FolderSharedJobData): Promise<void> {
  // Look up recipient's display name if the account already exists
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { displayName: true },
  });

  const recipientName = user?.displayName ?? data.email;

  // Build a direct folder URL; include invite code when the recipient is not yet a member
  const folderUrl = data.inviteCode
    ? `${config.frontendUrl}/register?code=${data.inviteCode}`
    : `${config.frontendUrl}/drive`;

  await sendFolderSharedEmail(
    data.email,
    recipientName,
    data.sharedByName,
    data.folderName,
    data.permission,
    folderUrl
  );
  logger.info('Notification: folder shared email sent', { email: data.email });
}

async function handleStorageWarning(data: StorageWarningJobData): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { displayName: true },
  });

  const displayName = user?.displayName ?? 'User';
  const usedPercent =
    data.quotaBytes > 0 ? Math.round((data.usedBytes / data.quotaBytes) * 100) : 0;

  await sendStorageWarningEmail(data.email, displayName, usedPercent);
  logger.info('Notification: storage warning email sent', {
    userId: data.userId,
    usedPercent,
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  logger.info('Notification job started', { jobId: job.id, type: job.data.type });

  switch (job.data.type) {
    case 'email_verification':
      await handleEmailVerification(job.data);
      break;

    case 'password_reset':
      await handlePasswordReset(job.data);
      break;

    case 'platform_invitation':
      await handlePlatformInvitation(job.data);
      break;

    case 'folder_shared':
      await handleFolderShared(job.data);
      break;

    case 'storage_warning':
      await handleStorageWarning(job.data);
      break;

    default: {
      // Exhaustiveness guard — TypeScript will error here if a case is missed
      const exhaustiveCheck: never = job.data;
      logger.warn('Notification job: unknown type', { data: exhaustiveCheck });
    }
  }
}

export const notificationWorker = new Worker<NotificationJobData>(
  'notification-queue',
  processNotificationJob,
  {
    connection: { url: config.redis.url },
    concurrency: 5,
  }
);

notificationWorker.on('completed', (job) => {
  logger.info('Notification job completed', { jobId: job.id, type: job.data.type });
});

notificationWorker.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job?.id,
    type: job?.data.type,
    error: err.message,
  });
});
