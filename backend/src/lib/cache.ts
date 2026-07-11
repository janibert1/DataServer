import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { redis } from './redis';
import { config } from '../config';
import { logger } from './logger';
import { uploadToS3, getObjectStream } from './s3';

// A local-disk write-through cache in front of MinIO/S3, sized and capped via
// CACHE_MAX_SIZE_GB (default 20GB). Uploads land here first (fast, since this
// disk isn't the NAS-backed MinIO volume) and get flushed to S3 asynchronously
// by cacheFlushWorker. An entry is only ever evicted after it's confirmed
// flushed — a full cache means slower eviction, never data loss.

const CACHE_DIR = config.cache.dir;
const MAX_SIZE_BYTES = BigInt(config.cache.maxSizeGB) * 1024n * 1024n * 1024n;

const metaKey = (key: string) => `cache:meta:${key}`;
const LRU_ZSET = 'cache:lru';
const PENDING_SET = 'cache:pending_flush';
const TOTAL_SIZE_KEY = 'cache:total_size';

function cachePath(key: string): string {
  // storageKey looks like "users/<id>/files/<id>/<name>" — safe as a relative path
  return path.join(CACHE_DIR, key);
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

export async function cacheWrite(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  const filePath = cachePath(key);
  await ensureParentDir(filePath);
  await fsp.writeFile(filePath, body);

  const now = Date.now();
  await redis
    .multi()
    .hset(
      metaKey(key),
      'size', body.length,
      'cachedAt', now,
      'flushed', 0,
      'contentType', contentType,
      'metadata', JSON.stringify(metadata ?? {})
    )
    .sadd(PENDING_SET, key)
    .zadd(LRU_ZSET, now, key)
    .incrby(TOTAL_SIZE_KEY, body.length)
    .exec();

  logger.info('Cache write', { key, size: body.length });

  // Fire-and-forget: don't make the caller (the upload request) wait on eviction.
  evictIfNeeded().catch((err) =>
    logger.error('Cache eviction check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

export async function cacheExists(key: string): Promise<boolean> {
  return (await redis.exists(metaKey(key))) === 1;
}

// True only while a key is cached AND not yet confirmed durable in S3/MinIO —
// distinct from cacheExists, since flushed entries stay cached (for fast reads)
// until evicted, which can be much later or never at this scale. Callers that
// need "will a direct S3/MinIO URL work right now" should check this, not
// cacheExists.
export async function isPendingFlush(key: string): Promise<boolean> {
  const flushed = await redis.hget(metaKey(key), 'flushed');
  if (flushed === null) return false; // not in cache at all -> not pending, assume already in S3
  return flushed !== '1';
}

export async function cacheRead(key: string): Promise<Readable | null> {
  if (!(await cacheExists(key))) return null;
  try {
    const stream = fs.createReadStream(cachePath(key));
    await redis.zadd(LRU_ZSET, Date.now(), key); // bump LRU on read
    return stream;
  } catch {
    return null;
  }
}

// Drop-in replacement for s3.ts's getObjectStream that transparently serves
// from the local cache when present (e.g. a file zipped/scanned moments
// after upload, before its background flush to S3 has completed).
export async function getObjectStreamWithCache(key: string): Promise<Readable> {
  const cached = await cacheRead(key);
  if (cached) return cached;
  return getObjectStream(key);
}

export async function cacheDelete(key: string): Promise<void> {
  const meta = await redis.hgetall(metaKey(key));
  if (!meta || Object.keys(meta).length === 0) return;

  await fsp.rm(cachePath(key), { force: true });
  await redis
    .multi()
    .del(metaKey(key))
    .srem(PENDING_SET, key)
    .zrem(LRU_ZSET, key)
    .decrby(TOTAL_SIZE_KEY, Number(meta.size) || 0)
    .exec();
}

async function markFlushed(key: string): Promise<void> {
  await redis.multi().hset(metaKey(key), 'flushed', 1).srem(PENDING_SET, key).exec();
  await evictIfNeeded();
}

export async function flushToS3(key: string): Promise<void> {
  const meta = await redis.hgetall(metaKey(key));
  if (!meta || Object.keys(meta).length === 0) {
    logger.warn('flushToS3: no cache metadata for key, skipping', { key });
    return;
  }
  const stream = fs.createReadStream(cachePath(key));
  const metadata = JSON.parse(meta.metadata || '{}');
  await uploadToS3(key, stream, meta.contentType, metadata);
  await markFlushed(key);
  logger.info('Cache flushed to S3', { key });
}

async function evictIfNeeded(): Promise<void> {
  let totalSize = BigInt((await redis.get(TOTAL_SIZE_KEY)) || '0');
  if (totalSize <= MAX_SIZE_BYTES) return;

  // Evict oldest-touched entries first, but only ones already confirmed in S3.
  const candidates = await redis.zrange(LRU_ZSET, 0, -1);
  for (const key of candidates) {
    if (totalSize <= MAX_SIZE_BYTES) break;
    const flushed = await redis.hget(metaKey(key), 'flushed');
    if (flushed !== '1') continue; // never evict data that isn't safely durable yet

    const size = Number(await redis.hget(metaKey(key), 'size')) || 0;
    await fsp.rm(cachePath(key), { force: true });
    await redis
      .multi()
      .del(metaKey(key))
      .srem(PENDING_SET, key)
      .zrem(LRU_ZSET, key)
      .decrby(TOTAL_SIZE_KEY, size)
      .exec();
    totalSize -= BigInt(size);
    logger.info('Cache evicted', { key, size });
  }

  if (totalSize > MAX_SIZE_BYTES) {
    logger.warn('Cache still over size cap after evicting all flushed entries', {
      totalSizeBytes: totalSize.toString(),
      maxSizeBytes: MAX_SIZE_BYTES.toString(),
    });
  }
}

export async function getPendingFlushKeys(): Promise<string[]> {
  return redis.smembers(PENDING_SET);
}

// ── Chunked/multipart upload support ────────────────────────────────────────
// Same idea as the single-shot cache above, but parts arrive over many
// requests (possibly in parallel/out of order) before the client calls
// /complete. Each part is buffered to its own temp file; /complete assembles
// them in order into the normal cache path and enqueues the same background
// flush — so large uploads get the same fast-ack benefit as small ones,
// instead of blocking on a real S3 UploadPartCommand per chunk.

const MULTIPART_TMP_DIR = path.join(CACHE_DIR, '.multipart');

function multipartPartPath(uploadId: string, partNumber: number): string {
  return path.join(MULTIPART_TMP_DIR, uploadId, `part-${partNumber}`);
}

export async function writeMultipartPart(uploadId: string, partNumber: number, chunk: Buffer): Promise<void> {
  const p = multipartPartPath(uploadId, partNumber);
  await ensureParentDir(p);
  await fsp.writeFile(p, chunk);
}

export async function assembleMultipartUpload(
  uploadId: string,
  partNumbers: number[],
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  const dir = path.join(MULTIPART_TMP_DIR, uploadId);
  const destPath = cachePath(key);
  await ensureParentDir(destPath);

  const out = fs.createWriteStream(destPath);
  const sorted = [...partNumbers].sort((a, b) => a - b);
  for (const pn of sorted) {
    const partPath = multipartPartPath(uploadId, pn);
    await new Promise<void>((resolve, reject) => {
      const inStream = fs.createReadStream(partPath);
      inStream.on('error', reject);
      inStream.pipe(out, { end: false });
      inStream.on('end', resolve);
    });
  }
  await new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    out.end();
  });

  const stat = await fsp.stat(destPath);
  const now = Date.now();
  await redis
    .multi()
    .hset(
      metaKey(key),
      'size', stat.size,
      'cachedAt', now,
      'flushed', 0,
      'contentType', contentType,
      'metadata', JSON.stringify(metadata ?? {})
    )
    .sadd(PENDING_SET, key)
    .zadd(LRU_ZSET, now, key)
    .incrby(TOTAL_SIZE_KEY, stat.size)
    .exec();

  await fsp.rm(dir, { recursive: true, force: true });

  logger.info('Cache write (assembled multipart)', { key, size: stat.size, parts: sorted.length });

  evictIfNeeded().catch((err) =>
    logger.error('Cache eviction check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

export async function abortMultipartUpload(uploadId: string): Promise<void> {
  const dir = path.join(MULTIPART_TMP_DIR, uploadId);
  await fsp.rm(dir, { recursive: true, force: true });
}
