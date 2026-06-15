import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (_req, res) => {
  res.json({ key: config.vapid.publicKey });
});

pushRouter.post('/subscribe', requireAuth, async (req, res) => {
  const user = req.user as any;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription' });
    return;
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to save push subscription', { err });
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

pushRouter.delete('/subscribe', requireAuth, async (req, res) => {
  const user = req.user as any;
  const { endpoint } = req.body;

  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint' });
    return;
  }

  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});
