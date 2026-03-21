import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireVerifiedEmail, requireAdmin } from '../middleware/auth';
import { invitationValidateRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/auditService';
import {
  createFolderShareInvitation,
  validateInvitationCode,
  revokeInvitation,
} from '../services/invitationService';
import { getEffectivePermission } from '../services/sharingService';
import { AuditAction, InvitationType, SharePermission } from '@prisma/client';

export const invitationsRouter = Router();
invitationsRouter.use(requireAuth, requireVerifiedEmail);

// ─── Create folder-share invitation (non-admin users) ────────

invitationsRouter.post(
  '/',
  [
    body('type').isIn([InvitationType.FOLDER_SHARE]).withMessage('Users can only create FOLDER_SHARE invitations. Admins use /admin/invitations for platform invites.'),
    body('folderId').notEmpty(),
    body('targetPermission').optional().isIn(Object.values(SharePermission)),
    body('maxUses').optional().isInt({ min: 1, max: 100 }),
    body('expiresAt').optional().isISO8601(),
    body('email').optional().isEmail().normalizeEmail(),
    body('note').optional().trim().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = req.user as any;
    const { folderId, targetPermission, maxUses, expiresAt, email, note } = req.body;

    try {
      const invitation = await createFolderShareInvitation({
        creatorId: user.id,
        folderId,
        targetPermission,
        maxUses: maxUses ? parseInt(maxUses) : 1,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        email,
        note,
      });

      await auditFromRequest(req, AuditAction.INVITATION_CREATED, {
        entityType: 'Invitation',
        entityId: invitation.id,
        details: { type: InvitationType.FOLDER_SHARE, folderId },
      });

      res.status(201).json({ invitation });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── List own invitations ────────────────────────────────────

invitationsRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { type } = req.query;

  const where: any = { creatorId: user.id };
  if (type && Object.values(InvitationType).includes(type as InvitationType)) {
    where.type = type;
  }

  const invitations = await prisma.invitation.findMany({
    where,
    include: {
      targetFolder: { select: { id: true, name: true } },
      usedByUsers: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ invitations });
});

// ─── Get specific invitation ─────────────────────────────────

invitationsRouter.get('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const invitation = await prisma.invitation.findFirst({
    where: { id, creatorId: user.id },
    include: {
      targetFolder: { select: { id: true, name: true } },
      usedByUsers: { select: { id: true, displayName: true, email: true } },
    },
  });

  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found.' });
    return;
  }

  res.json({ invitation });
});

// ─── Revoke invitation ───────────────────────────────────────

invitationsRouter.delete('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  const { reason } = req.body;

  try {
    await revokeInvitation(id, user.id, user.role === 'ADMIN', reason);
    await auditFromRequest(req, AuditAction.INVITATION_REVOKED, { entityType: 'Invitation', entityId: id });
    res.json({ message: 'Invitation revoked.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Validate code (no consumption) ─────────────────────────

invitationsRouter.post(
  '/validate',
  invitationValidateRateLimiter,
  [body('code').trim().notEmpty()],
  async (req: Request, res: Response) => {
    const { code, type } = req.body;
    const result = await validateInvitationCode(code, type);

    if (!result.valid) {
      res.status(400).json({ error: result.error });
      return;
    }

    const inv = result.invitation;
    res.json({
      valid: true,
      type: inv.type,
      folder: inv.targetFolder ? { id: inv.targetFolder.id, name: inv.targetFolder.name } : null,
      permission: inv.targetPermission,
      note: inv.note,
    });
  }
);

// ─── Accept folder-share invitation ─────────────────────────

invitationsRouter.post(
  '/accept',
  [body('code').trim().notEmpty()],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { code } = req.body;

    const result = await validateInvitationCode(code, InvitationType.FOLDER_SHARE);
    if (!result.valid) {
      res.status(400).json({ error: result.error });
      return;
    }

    const inv = result.invitation;

    // Check email restriction
    if (inv.email && inv.email !== user.email) {
      res.status(403).json({ error: 'This invitation is for a different email address.' });
      return;
    }

    if (!inv.targetFolderId) {
      res.status(400).json({ error: 'Invalid invitation: no target folder.' });
      return;
    }

    // Create or update the share
    await prisma.folderShare.upsert({
      where: { folderId_recipientId: { folderId: inv.targetFolderId, recipientId: user.id } },
      update: { permission: inv.targetPermission!, revokedAt: null, invitationId: inv.id },
      create: {
        folderId: inv.targetFolderId,
        ownerId: inv.creatorId,
        recipientId: user.id,
        permission: inv.targetPermission!,
        invitationId: inv.id,
      },
    });

    // Consume the invitation
    const newCount = inv.useCount + 1;
    await prisma.invitation.update({
      where: { id: inv.id },
      data: {
        useCount: newCount,
        status: newCount >= inv.maxUses ? 'ACCEPTED' : 'PENDING',
      },
    });

    await auditFromRequest(req, AuditAction.INVITATION_ACCEPTED, {
      entityType: 'Invitation',
      entityId: inv.id,
      details: { folderId: inv.targetFolderId, permission: inv.targetPermission },
    });

    res.json({
      message: 'Invitation accepted. You now have access to the shared folder.',
      folderId: inv.targetFolderId,
      permission: inv.targetPermission,
    });
  }
);
