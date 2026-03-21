import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { unreadOnly } = req.query;

  const where: any = { userId: user.id };
  if (unreadOnly === 'true') where.isRead = false;

  const notifications = await prisma.notification.findMany({
    where,
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({ where: { userId: user.id, isRead: false } });

  res.json({ notifications, unreadCount });
});

notificationsRouter.patch('/:id/read', async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true, readAt: new Date() },
  });

  res.json({ message: 'Marked as read.' });
});

notificationsRouter.post('/read-all', async (req: Request, res: Response) => {
  const user = req.user as any;
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ message: 'All notifications marked as read.' });
});

notificationsRouter.delete('/:id', async (req: Request, res: Response) => {
  const user = req.user as any;
  await prisma.notification.deleteMany({ where: { id: req.params.id, userId: user.id } });
  res.json({ message: 'Notification deleted.' });
});
