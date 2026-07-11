import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import sanitizeFilename from 'sanitize-filename';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.msp', '.scr', '.cpl',
  '.dll', '.sys', '.drv', '.ocx',
]);

async function getMaxFileSize(): Promise<number> {
  try {
    const policy = await prisma.storagePolicy.findFirst();
    return policy ? Number(policy.maxFileSizeBytes) : 2 * 1024 * 1024 * 1024;
  } catch {
    return 2 * 1024 * 1024 * 1024;
  }
}

const storage = multer.memoryStorage();

// Busboy (which multer uses internally) decodes multipart header fields --
// including the filename -- as latin1 by default, since that's the HTTP
// spec's historical assumption for header values. Modern browsers actually
// send the filename as UTF-8 bytes, so a name like "émoji_😀_文件" arrives
// mojibake'd (each UTF-8 byte gets read as its own latin1 codepoint). Fix by
// re-decoding the raw bytes as UTF-8 before anything else touches the name.
function fixMojibakeFilename(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
): void {
  file.originalname = fixMojibakeFilename(file.originalname);

  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    callback(new Error(`File type not allowed: ${ext}`));
    return;
  }

  const safeName = sanitizeFilename(file.originalname);
  if (!safeName || safeName !== file.originalname.replace(/[<>:"/\\|?*]/g, '_')) {
    file.originalname = safeName || 'untitled';
  }

  callback(null, true);
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2 GB hard limit; policy-based check done in route
    files: 20,
  },
});

export function validateFileExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !BLOCKED_EXTENSIONS.has(ext);
}

export function sanitizeFileName(name: string): string {
  return sanitizeFilename(name).slice(0, 255) || 'untitled';
}
