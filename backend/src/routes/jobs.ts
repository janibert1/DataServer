import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { driveOpsQueue } from '../workers/queues';

export const jobsRouter = Router();

jobsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user as any;
  try {
    const job = await driveOpsQueue.getJob(id);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if ((job.data as any).userId !== user.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const state = await job.getState();
    if (state === 'active') {
      // Job is locked by worker — force-fail it directly in Redis
      const client = await (driveOpsQueue as any).client;
      const prefix = "bull";
      const qName = driveOpsQueue.name;
      const now = Date.now();
      await client.lrem(`${prefix}:${qName}:active`, 0, id);
      await client.hset(`${prefix}:${qName}:${id}`, 'failedReason', 'Cancelled by user', 'finishedOn', String(now));
      await client.zadd(`${prefix}:${qName}:failed`, now, id);
      await client.del(`${prefix}:${qName}:${id}:lock`);
    } else {
      await job.remove();
    }
    res.json({ message: 'Job cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to cancel job' });
  }
});

jobsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user as any;
  try {
    const job = await driveOpsQueue.getJob(id);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if ((job.data as any).userId !== user.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const state = await job.getState();
    const progress = job.progress as { percent: number; message: string } | null ?? null;

    res.json({
      id: job.id,
      type: (job.data as any).type,
      label: (job.data as any).label,
      status: state,
      progress,
      result: state === 'completed' ? job.returnvalue : undefined,
      error: state === 'failed' ? (job.failedReason ?? 'Unknown error') : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to get job status' });
  }
});
