import { customAlphabet } from 'nanoid';
import { InvitationType, InvitationStatus, SharePermission } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Readable alphabet: no 0/O, 1/I/l confusion
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nanoid = customAlphabet(alphabet, 12);

function formatCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function generateInvitationCode(): Promise<string> {
  let code: string;
  let attempts = 0;
  do {
    code = formatCode(nanoid());
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique invitation code');
  } while (await prisma.invitation.findUnique({ where: { code } }));
  return code;
}

export interface CreatePlatformInviteOptions {
  creatorId: string;
  maxUses?: number;
  expiresAt?: Date;
  email?: string;
  note?: string;
}

export async function createPlatformInvitation(opts: CreatePlatformInviteOptions) {
  const code = await generateInvitationCode();
  return prisma.invitation.create({
    data: {
      code,
      type: InvitationType.PLATFORM,
      creatorId: opts.creatorId,
      maxUses: opts.maxUses ?? 1,
      expiresAt: opts.expiresAt,
      email: opts.email?.toLowerCase().trim(),
      note: opts.note,
    },
  });
}

export interface CreateFolderShareInviteOptions {
  creatorId: string;
  folderId: string;
  targetPermission?: SharePermission;
  maxUses?: number;
  expiresAt?: Date;
  email?: string;
  note?: string;
}

export async function createFolderShareInvitation(opts: CreateFolderShareInviteOptions) {
  // Verify creator owns the folder
  const folder = await prisma.folder.findFirst({
    where: { id: opts.folderId, ownerId: opts.creatorId, isTrashed: false },
  });
  if (!folder) throw new Error('Folder not found or not owned by you.');
  if (!folder.isShared) throw new Error('Folder must be marked as shareable first.');

  const code = await generateInvitationCode();
  return prisma.invitation.create({
    data: {
      code,
      type: InvitationType.FOLDER_SHARE,
      creatorId: opts.creatorId,
      targetFolderId: opts.folderId,
      targetPermission: opts.targetPermission ?? SharePermission.VIEWER,
      maxUses: opts.maxUses ?? 1,
      expiresAt: opts.expiresAt,
      email: opts.email?.toLowerCase().trim(),
      note: opts.note,
    },
  });
}

export interface ValidateResult {
  valid: boolean;
  error?: string;
  invitation?: any;
}

export async function validateInvitationCode(
  code: string,
  type?: InvitationType
): Promise<ValidateResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { code: code.toUpperCase().trim() },
    include: { targetFolder: true },
  });

  if (!invitation) {
    return { valid: false, error: 'Invalid invitation code.' };
  }

  if (type && invitation.type !== type) {
    return { valid: false, error: 'Invalid invitation code type.' };
  }

  if (invitation.status === InvitationStatus.REVOKED) {
    return { valid: false, error: 'This invitation has been revoked.' };
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    return { valid: false, error: 'This invitation has expired.' };
  }

  if (invitation.useCount >= invitation.maxUses) {
    return { valid: false, error: 'This invitation code has already been used.' };
  }

  return { valid: true, invitation };
}

export async function consumeInvitationCode(
  code: string,
  userId: string
): Promise<void> {
  const invitation = await prisma.invitation.findUnique({ where: { code } });
  if (!invitation) throw new Error('Invitation not found.');

  const newCount = invitation.useCount + 1;
  const fullyUsed = newCount >= invitation.maxUses;

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      useCount: newCount,
      status: fullyUsed ? InvitationStatus.ACCEPTED : InvitationStatus.PENDING,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { usedInvitationId: invitation.id },
  });
}

export async function revokeInvitation(
  invitationId: string,
  requesterId: string,
  isAdmin: boolean,
  reason?: string
): Promise<void> {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation) throw new Error('Invitation not found.');

  if (!isAdmin && invitation.creatorId !== requesterId) {
    throw new Error('Not authorized to revoke this invitation.');
  }

  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: InvitationStatus.REVOKED,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}
