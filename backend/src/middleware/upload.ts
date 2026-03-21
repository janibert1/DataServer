import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import sanitizeFilename from 'sanitize-filename';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.ps2', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.msc', '.msi', '.msp', '.com', '.scr', '.hta', '.cpl',
  '.dll', '.sys', '.drv', '.ocx', '.inf', '.reg', '.lnk', '.jar', '.py',
  '.rb', '.php', '.asp', '.aspx', '.jsp', '.so', '.dylib',
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

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
): void {
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
