import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from './logger';
import { Readable } from 'stream';

export const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

export async function ensureBucketExists(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    logger.info(`S3 bucket "${config.s3.bucket}" exists`);
  } catch {
    logger.info(`Creating S3 bucket "${config.s3.bucket}"`);
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: config.s3.bucket,
      })
    );
  }
}

export async function uploadToS3(
  key: string,
  body: Buffer | Readable,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    })
  );
}

function rewriteToPublicUrl(signedUrl: string): string {
  if (!config.s3.publicUrl) return signedUrl;
  try {
    const parsed = new URL(signedUrl);
    const publicParsed = new URL(config.s3.publicUrl);
    parsed.hostname = publicParsed.hostname;
    parsed.port = publicParsed.port;
    parsed.protocol = publicParsed.protocol;
    return parsed.toString();
  } catch {
    return signedUrl;
  }
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  return rewriteToPublicUrl(url);
}

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  return rewriteToPublicUrl(url);
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    })
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    })
  );
  return response.Body as Readable;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function buildStorageKey(userId: string, fileId: string, filename: string): string {
  return `users/${userId}/files/${fileId}/${filename}`;
}

export function buildThumbnailKey(userId: string, fileId: string): string {
  return `users/${userId}/thumbnails/${fileId}.webp`;
}

export function buildVersionKey(userId: string, fileId: string, version: number): string {
  return `users/${userId}/versions/${fileId}/v${version}`;
}
