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

// Queue for permanently deleting trash (empty-trash operations)
export const emptyTrashQueue = new Queue('empty-trash-queue', {
  connection,
  defaultJobOptions,
});

// Queue for AI-driven file sorting
export const aiSortQueue = new Queue('ai-sort-queue', {
  connection,
  defaultJobOptions,
});

// Queue for async zip generation
export const zipQueue = new Queue('zip-queue', {
  connection,
  defaultJobOptions,
});

// Queue for compress-to-drive and extract operations
export const driveOpsQueue = new Queue('drive-ops-queue', {
  connection,
  defaultJobOptions,
});

// Queue for flushing locally-cached uploads to S3/MinIO in the background
export const cacheFlushQueue = new Queue('cache-flush-queue', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  },
});