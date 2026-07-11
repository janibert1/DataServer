import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { flushToS3 } from '../lib/cache';
import { logger } from '../lib/logger';

export interface CacheFlushJobData {
  key: string;
}

async function processCacheFlushJob(job: Job<CacheFlushJobData>): Promise<void> {
  await flushToS3(job.data.key);
}

export const cacheFlushWorker = new Worker<CacheFlushJobData>(
  'cache-flush-queue',
  processCacheFlushJob,
  {
    connection: { url: config.redis.url },
    concurrency: 4,
  }
);

cacheFlushWorker.on('completed', (job) => {
  logger.info('Cache flush job completed', { jobId: job.id, key: job.data.key });
});

cacheFlushWorker.on('failed', (job, err) => {
  logger.error('Cache flush job failed', { jobId: job?.id, key: job?.data.key, error: err.message });
});
