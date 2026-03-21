import { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { Request } from 'express';

interface AuditOptions {
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(options: AuditOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        details: options.details as any,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log', { error, options });
  }
}

export function getRequestMeta(req: Request): { ipAddress: string; userAgent: string } {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress ?? 'unknown';

  return {
    ipAddress,
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

export async function auditFromRequest(
  req: Request,
  action: AuditAction,
  opts: Partial<Omit<AuditOptions, 'action'>> = {}
): Promise<void> {
  const user = req.user as any;
  const meta = getRequestMeta(req);
  await createAuditLog({
    userId: user?.id,
    action,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    ...opts,
  });
}
