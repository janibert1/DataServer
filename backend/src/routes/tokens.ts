import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { logger } from '../lib/logger';

export const tokensRouter = Router();

function generateToken(): string {
  return 'ds_' + crypto.randomBytes(24).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── CRUD ────────────────────────────────────────────────────

// Create a new API token
tokensRouter.post('/', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Token name is required.' });
    }

    const rawToken = generateToken();
    const tokenH = hashToken(rawToken);

    const apiToken = await prisma.apiToken.create({
      data: {
        userId: user.id,
        name: name.trim(),
        tokenHash: tokenH,
        tokenPrefix: rawToken.slice(0, 11), // "ds_" + 8 hex chars
      },
    });

    res.status(201).json({
      token: rawToken,
      id: apiToken.id,
      name: apiToken.name,
      prefix: apiToken.tokenPrefix,
      createdAt: apiToken.createdAt,
    });
  } catch (err) {
    logger.error('Create token error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create token.' });
  }
});

// List user's tokens
tokensRouter.get('/', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const tokens = await prisma.apiToken.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        lastUsedAt: true,
        lastUsedIp: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tokens });
  } catch (err) {
    logger.error('List tokens error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list tokens.' });
  }
});

// Revoke a token
tokensRouter.delete('/:id', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { id } = req.params;

    const token = await prisma.apiToken.findFirst({
      where: { id, userId: user.id, revokedAt: null },
    });

    if (!token) {
      return res.status(404).json({ error: 'Token not found.' });
    }

    await prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    res.json({ message: 'Token revoked.' });
  } catch (err) {
    logger.error('Revoke token error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to revoke token.' });
  }
});

// ─── Device auth flow ────────────────────────────────────────

const DEVICE_AUTH_TTL = 600; // 10 minutes

// Poll for device auth completion (called by desktop client)
tokensRouter.get('/device/:code/poll', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code || !/^[a-f0-9]{32,64}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid device code.' });
    }

    const result = await redis.get(`device_auth:${code}`);
    if (!result) {
      return res.json({ status: 'pending' });
    }

    const data = JSON.parse(result);
    if (data.status === 'complete') {
      // Delete after retrieval so token is only returned once
      await redis.del(`device_auth:${code}`);
      return res.json({ status: 'complete', token: data.token, user: data.user });
    }

    res.json({ status: data.status || 'pending' });
  } catch (err) {
    logger.error('Device poll error', { error: (err as Error).message });
    res.status(500).json({ error: 'Poll failed.' });
  }
});

// Approve device auth (called by frontend after user logs in and approves)
tokensRouter.post('/device', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { code, name } = req.body;

    if (!code || !/^[a-f0-9]{32,64}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid device code.' });
    }

    const deviceName = (name && typeof name === 'string' && name.trim()) || 'Desktop Client';

    // Generate API token
    const rawToken = generateToken();
    const tokenH = hashToken(rawToken);

    await prisma.apiToken.create({
      data: {
        userId: user.id,
        name: deviceName,
        tokenHash: tokenH,
        tokenPrefix: rawToken.slice(0, 11),
      },
    });

    // Store in Redis for the polling desktop client
    await redis.setex(`device_auth:${code}`, DEVICE_AUTH_TTL, JSON.stringify({
      status: 'complete',
      token: rawToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    }));

    res.json({ message: 'Device authorized.' });
  } catch (err) {
    logger.error('Device auth error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to authorize device.' });
  }
});
