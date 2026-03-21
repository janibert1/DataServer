import { Queue } from 'bullmq';
import { config } from '../config';

// Pass connection URL to BullMQ directly to avoid ioredis version conflicts
const connection = { url: config.redis.url };

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

// Queue for generating file previews / thumbnails
export const previewQueue = new Queue('preview-queue', {
  connection,
  defaultJobOptions,
});

// Queue for scanning uploaded files with ClamAV
export const virusScanQueue = new Queue('virus-scan-queue', {
  connection,
  defaultJobOptions,
});

// Queue for purging files that have been in the trash for >30 days
export const trashCleanupQueue = new Queue('trash-cleanup-queue', {
  connection,
  defaultJobOptions,
});

// Queue for sending email / in-app notifications
export const notificationQueue = new Queue('notification-queue', {
  connection,
  defaultJobOptions,
});
