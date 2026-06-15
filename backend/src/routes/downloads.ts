import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { s3Client, getSignedDownloadUrl } from '../lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { logger } from '../lib/logger';

export const downloadsRouter = Router();

downloadsRouter.use(requireAuth);

// List all zip downloads for the user
downloadsRouter.get('/', async (req, res) => {
  try {
    const user = req.user as any;
    const rows = await prisma.zipDownload.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        status: true,
        sizeBytes: true,
        fileCount: true,
        expiresAt: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    // Serialize BigInt sizeBytes to string for JSON
    const downloads = rows.map((d) => ({ ...d, sizeBytes: d.sizeBytes != null ? d.sizeBytes.toString() : null }));
    res.json({ downloads });
  } catch (err) {
    logger.error('Downloads list error', { err });
    res.status(500).json({ error: 'Failed to load downloads' });
  }
});

// Get signed download URL for a ready zip
downloadsRouter.get('/:id/url', async (req, res) => {
  const user = req.user as any;
  const dl = await prisma.zipDownload.findFirst({
    where: { id: req.params.id, userId: user.id },
  });
  if (!dl) { res.status(404).json({ error: 'Not found' }); return; }
  if (dl.status !== 'READY' || !dl.storageKey) {
    res.status(400).json({ error: 'Download not ready' });
    return;
  }
  try {
    const url = await getSignedDownloadUrl(dl.storageKey, 3600);
    res.json({ url });
  } catch (err) {
    logger.error('Failed to generate signed URL', { err });
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Delete a zip download record + S3 object
downloadsRouter.delete('/:id', async (req, res) => {
  const user = req.user as any;
  const dl = await prisma.zipDownload.findFirst({
    where: { id: req.params.id, userId: user.id },
  });
  if (!dl) { res.status(404).json({ error: 'Not found' }); return; }
  if (dl.storageKey) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: dl.storageKey })).catch(() => {});
  }
  await prisma.zipDownload.delete({ where: { id: dl.id } });
  res.json({ message: 'Deleted' });
});
