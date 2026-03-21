import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/auditService';
import { getUserQuotaInfo } from '../services/quotaService';
import { AuditAction, UserStatus } from '@prisma/client';
import { sanitizeFileName } from '../middleware/upload';

export const accountRouter = Router();
accountRouter.use(requireAuth);

// ─── Get profile ─────────────────────────────────────────────

accountRouter.get('/profile', async (req: Request, res: Response) => {
  const user = req.user as any;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, displayName: true, avatarUrl: true,
      role: true, status: true, emailVerified: true, authProvider: true,
      twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true, createdAt: true,
    },
  });
  res.json({ user: dbUser });
});

// ─── Update profile ──────────────────────────────────────────

accountRouter.patch(
  '/profile',
  [
    body('displayName').optional().trim().isLength({ min: 2, max: 100 }),
    body('avatarUrl').optional().isURL(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = req.user as any;
    const { displayName, avatarUrl } = req.body;

    const data: any = {};
    if (displayName) data.displayName = displayName.trim();
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    await prisma.user.update({ where: { id: user.id }, data });
    res.json({ message: 'Profile updated.' });
  }
);

// ─── Storage info ────────────────────────────────────────────

accountRouter.get('/storage', async (req: Request, res: Response) => {
  const user = req.user as any;
  const info = await getUserQuotaInfo(user.id);
  res.json(info);
});

// ─── Active sessions ─────────────────────────────────────────

accountRouter.get('/sessions', async (req: Request, res: Response) => {
  const user = req.user as any;
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    orderBy: { createdAt: 'desc' },
  });

  const currentSessionId = (req.session as any).id;
  res.json({
    sessions: sessions.map((s) => ({ ...s, isCurrent: s.id === currentSessionId })),
  });
});

accountRouter.delete('/sessions/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  if (id === (req.session as any).id) {
    res.status(400).json({ error: 'Cannot revoke your current session. Use logout instead.' });
    return;
  }

  await prisma.session.deleteMany({ where: { id, userId: user.id } });
  res.json({ message: 'Session revoked.' });
});

// ─── Revoke all other sessions ───────────────────────────────

accountRouter.delete('/sessions', async (req: Request, res: Response) => {
  const user = req.user as any;
  const currentSessionId = (req.session as any).id;

  await prisma.session.deleteMany({
    where: { userId: user.id, id: { not: currentSessionId } },
  });

  res.json({ message: 'All other sessions revoked.' });
});

// ─── Recent security events ──────────────────────────────────

accountRouter.get('/security-events', async (req: Request, res: Response) => {
  const user = req.user as any;
  const events = await prisma.auditLog.findMany({
    where: {
      userId: user.id,
      action: {
        in: [
          AuditAction.USER_LOGIN,
          AuditAction.USER_LOGIN_FAILED,
          AuditAction.PASSWORD_CHANGED,
          AuditAction.PASSWORD_RESET_REQUESTED,
          AuditAction.TWO_FACTOR_ENABLED,
          AuditAction.TWO_FACTOR_DISABLED,
          AuditAction.EMAIL_VERIFIED,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ events });
});

// ─── Delete account ──────────────────────────────────────────

accountRouter.delete('/', async (req: Request, res: Response) => {
  const user = req.user as any;

  await prisma.user.update({
    where: { id: user.id },
    data: { status: UserStatus.DELETED, deletedAt: new Date() },
  });

  await auditFromRequest(req, AuditAction.USER_DELETED, { entityType: 'User', entityId: user.id });

  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('ds.sid');
      res.json({ message: 'Account deleted.' });
    });
  });
});
