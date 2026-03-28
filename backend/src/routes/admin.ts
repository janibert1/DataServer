import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/auditService';
import { createPlatformInvitation, revokeInvitation } from '../services/invitationService';
import { AuditAction, UserStatus, InvitationType } from '@prisma/client';
import {
  getPhysicalDiskSpace,
  getTotalOccupiedSpace,
  getTotalAllocatedQuota,
  validateCapacitySetting,
  proportionallyReduceQuotas,
} from '../services/storageCapacityService';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// ─── Users ───────────────────────────────────────────────────

adminRouter.get('/users', async (req: Request, res: Response) => {
  const { search, status, page = '1', limit = '25' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (status) where.status = status;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, displayName: true, role: true, status: true,
        emailVerified: true, authProvider: true, storageQuotaBytes: true, storageUsedBytes: true,
        lastLoginAt: true, createdAt: true, avatarUrl: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    users: users.map((u) => ({
      ...u,
      storageQuotaBytes: u.storageQuotaBytes.toString(),
      storageUsedBytes: u.storageUsedBytes.toString(),
    })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

adminRouter.get('/users/:id', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, email: true, displayName: true, role: true, status: true,
      emailVerified: true, authProvider: true, storageQuotaBytes: true, storageUsedBytes: true,
      twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true, createdAt: true, avatarUrl: true,
      _count: { select: { files: true, folders: true, createdInvitations: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({
    user: {
      ...user,
      storageQuotaBytes: user.storageQuotaBytes.toString(),
      storageUsedBytes: user.storageUsedBytes.toString(),
    },
  });
});

adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  const admin = req.user as any;
  const { id } = req.params;
  const { action, storageQuotaBytes, role } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const updateData: any = {};
  let auditAction: AuditAction = AuditAction.ADMIN_ACTION;

  switch (action) {
    case 'suspend':
      updateData.status = UserStatus.SUSPENDED;
      auditAction = AuditAction.USER_SUSPENDED;
      break;
    case 'restore':
      updateData.status = UserStatus.ACTIVE;
      auditAction = AuditAction.USER_RESTORED;
      break;
    case 'delete':
      updateData.status = UserStatus.DELETED;
      updateData.deletedAt = new Date();
      auditAction = AuditAction.USER_DELETED;
      break;
    case 'setQuota':
      if (storageQuotaBytes) updateData.storageQuotaBytes = BigInt(storageQuotaBytes);
      auditAction = AuditAction.QUOTA_CHANGED;
      break;
    case 'setRole':
      if (role) updateData.role = role;
      auditAction = AuditAction.ADMIN_ACTION;
      break;
    default:
      res.status(400).json({ error: 'Unknown action.' });
      return;
  }

  await prisma.user.update({ where: { id }, data: updateData });

  await auditFromRequest(req, auditAction, {
    entityType: 'User',
    entityId: id,
    details: { action, performedBy: admin.id, ...req.body },
  });

  res.json({ message: `User ${action} successful.` });
});

// ─── Invitations ─────────────────────────────────────────────

adminRouter.get('/invitations', async (req: Request, res: Response) => {
  const { type, status, page = '1', limit = '25' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [invitations, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        creator: { select: { id: true, displayName: true, email: true } },
        targetFolder: { select: { id: true, name: true } },
        usedByUsers: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invitation.count({ where }),
  ]);

  res.json({ invitations, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});

adminRouter.post(
  '/invitations',
  [
    body('maxUses').optional().isInt({ min: 1, max: 1000 }),
    body('expiresAt').optional().isISO8601(),
    body('email').optional().isEmail().normalizeEmail(),
    body('note').optional().trim().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response) => {
    const admin = req.user as any;
    const { maxUses, expiresAt, email, note } = req.body;

    const invitation = await createPlatformInvitation({
      creatorId: admin.id,
      maxUses: maxUses ? parseInt(maxUses) : 1,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      email,
      note,
    });

    await auditFromRequest(req, AuditAction.INVITATION_CREATED, {
      entityType: 'Invitation',
      entityId: invitation.id,
      details: { type: InvitationType.PLATFORM, email, maxUses },
    });

    res.status(201).json({ invitation });
  }
);

adminRouter.delete('/invitations/:id', async (req: Request, res: Response) => {
  const admin = req.user as any;
  const { reason } = req.body;

  try {
    await revokeInvitation(req.params.id, admin.id, true, reason);
    await auditFromRequest(req, AuditAction.INVITATION_REVOKED, { entityType: 'Invitation', entityId: req.params.id });
    res.json({ message: 'Invitation revoked.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Audit logs ──────────────────────────────────────────────

adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
  const { userId, action, from, to, page = '1', limit = '50' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});

// ─── Storage stats ───────────────────────────────────────────

adminRouter.get('/storage-stats', async (req: Request, res: Response) => {
  const [topUsers, totals] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { storageUsedBytes: 'desc' },
      take: 10,
      select: {
        id: true, displayName: true, email: true,
        storageUsedBytes: true, storageQuotaBytes: true,
      },
    }),
    prisma.user.aggregate({
      _sum: { storageUsedBytes: true, storageQuotaBytes: true },
    }),
  ]);

  res.json({
    topUsers: topUsers.map((u) => ({
      ...u,
      storageUsedBytes: u.storageUsedBytes.toString(),
      storageQuotaBytes: u.storageQuotaBytes.toString(),
    })),
    totals: {
      usedBytes: totals._sum.storageUsedBytes?.toString() ?? '0',
      quotaBytes: totals._sum.storageQuotaBytes?.toString() ?? '0',
    },
  });
});

// ─── Content flags ───────────────────────────────────────────

adminRouter.get('/flags', async (req: Request, res: Response) => {
  const { status = 'PENDING', page = '1' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page));
  const skip = (pageNum - 1) * 25;

  const [flags, total] = await Promise.all([
    prisma.contentFlag.findMany({
      where: { status },
      include: {
        reporter: { select: { id: true, displayName: true, email: true } },
        file: { select: { id: true, name: true, mimeType: true } },
        folder: { select: { id: true, name: true } },
        reviewer: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: 25,
    }),
    prisma.contentFlag.count({ where: { status } }),
  ]);

  res.json({ flags, pagination: { page: pageNum, total, pages: Math.ceil(total / 25) } });
});

adminRouter.patch('/flags/:id', async (req: Request, res: Response) => {
  const admin = req.user as any;
  const { status, reviewNote } = req.body;

  await prisma.contentFlag.update({
    where: { id: req.params.id },
    data: {
      status,
      reviewNote,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });

  await auditFromRequest(req, AuditAction.ADMIN_ACTION, {
    entityType: 'ContentFlag',
    entityId: req.params.id,
    details: { status, reviewNote },
  });

  res.json({ message: 'Flag updated.' });
});

// ─── Storage policy ──────────────────────────────────────────

adminRouter.get('/policy', async (_req: Request, res: Response) => {
  let policy = await prisma.storagePolicy.findFirst();
  if (!policy) {
    policy = await prisma.storagePolicy.create({ data: {} });
  }
  res.json({
    policy: {
      ...policy,
      defaultQuotaBytes: policy.defaultQuotaBytes.toString(),
      maxFileSizeBytes: policy.maxFileSizeBytes.toString(),
      totalDriveCapacityBytes: policy.totalDriveCapacityBytes?.toString() ?? null,
    },
  });
});

adminRouter.patch('/policy', async (req: Request, res: Response) => {
  const admin = req.user as any;
  const {
    defaultQuotaBytes, maxFileSizeBytes, allowedMimeTypes,
    blockedExtensions, trashRetentionDays, versionRetentionCount,
    totalDriveCapacityBytes,
  } = req.body;

  const data: any = {};
  if (defaultQuotaBytes !== undefined) data.defaultQuotaBytes = BigInt(defaultQuotaBytes);
  if (maxFileSizeBytes !== undefined) data.maxFileSizeBytes = BigInt(maxFileSizeBytes);
  if (allowedMimeTypes !== undefined) data.allowedMimeTypes = allowedMimeTypes;
  if (blockedExtensions !== undefined) data.blockedExtensions = blockedExtensions;
  if (trashRetentionDays !== undefined) data.trashRetentionDays = parseInt(trashRetentionDays);
  if (versionRetentionCount !== undefined) data.versionRetentionCount = parseInt(versionRetentionCount);

  if (totalDriveCapacityBytes !== undefined) {
    if (totalDriveCapacityBytes === null || totalDriveCapacityBytes === '') {
      data.totalDriveCapacityBytes = null;
    } else {
      const capacityBig = BigInt(totalDriveCapacityBytes);
      const validation = await validateCapacitySetting(capacityBig);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      data.totalDriveCapacityBytes = capacityBig;
    }
  }

  let policy = await prisma.storagePolicy.findFirst();
  if (!policy) {
    policy = await prisma.storagePolicy.create({ data });
  } else {
    policy = await prisma.storagePolicy.update({ where: { id: policy.id }, data });
  }

  await auditFromRequest(req, AuditAction.ADMIN_ACTION, {
    entityType: 'StoragePolicy',
    entityId: policy.id,
    details: { performedBy: admin.id, changes: req.body },
  });

  res.json({
    message: 'Policy updated.',
    policy: {
      ...policy,
      defaultQuotaBytes: policy.defaultQuotaBytes.toString(),
      maxFileSizeBytes: policy.maxFileSizeBytes.toString(),
      totalDriveCapacityBytes: policy.totalDriveCapacityBytes?.toString() ?? null,
    },
  });
});

// ─── Storage overview ────────────────────────────────────────

adminRouter.get('/storage-overview', async (_req: Request, res: Response) => {
  const [occupied, allocated, policy] = await Promise.all([
    getTotalOccupiedSpace(),
    getTotalAllocatedQuota(),
    prisma.storagePolicy.findFirst(),
  ]);

  let disk = null;
  try {
    const d = getPhysicalDiskSpace();
    disk = { totalBytes: d.totalBytes.toString(), availableBytes: d.availableBytes.toString() };
  } catch { /* non-local storage, skip */ }

  res.json({
    disk,
    capacityBytes: policy?.totalDriveCapacityBytes?.toString() ?? null,
    occupiedBytes: occupied.toString(),
    allocatedQuotaBytes: allocated.toString(),
  });
});

// ─── Redistribute quotas ────────────────────────────────────

adminRouter.post('/redistribute-quotas', async (req: Request, res: Response) => {
  const admin = req.user as any;
  const { targetCapacityBytes, preview } = req.body;

  if (!targetCapacityBytes) {
    res.status(400).json({ error: 'targetCapacityBytes is required.' });
    return;
  }

  const result = await proportionallyReduceQuotas(BigInt(targetCapacityBytes), preview === true);

  if (!preview && result.adjusted) {
    await auditFromRequest(req, AuditAction.ADMIN_ACTION, {
      entityType: 'StoragePolicy',
      entityId: 'quota-redistribution',
      details: { performedBy: admin.id, targetCapacityBytes, usersAffected: result.users.length },
    });
  }

  res.json(result);
});
