import mime from 'mime-types';
import path from 'path';

// Camera RAW formats the `mime-types` npm package's built-in database does
// not know at all (mime.lookup returns false for every one of these) --
// confirmed live 2026-08-22 against mime-types 2.1.35. Without this map,
// every upload route's `mime.lookup(name) || <client mimetype> || ...`
// fallback skips straight past detection to whatever (possibly wrong)
// Content-Type the uploading client declared -- exactly the class of bug
// that mistagged 4365 JPGs and 417 NEFs as text/plain in the 08-21 NAS
// migration. Conventional image/x-<vendor>-<format> types, matching what
// browsers/OSes that do recognize these already use.
const RAW_EXTENSION_MIME: Record<string, string> = {
  '.nef': 'image/x-nikon-nef',
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.arw': 'image/x-sony-arw',
  '.dng': 'image/x-adobe-dng',
  '.orf': 'image/x-olympus-orf',
  '.rw2': 'image/x-panasonic-rw2',
  '.raf': 'image/x-fuji-raf',
  '.pef': 'image/x-pentax-pef',
  '.srw': 'image/x-samsung-srw',
};

export function isRawImageMimeType(mimeType: string): boolean {
  return Object.values(RAW_EXTENSION_MIME).includes(mimeType);
}

// Filename-first mimeType detection shared by every upload path (/upload,
// /upload/init, /api/backup/upload) -- trusts the extension over whatever
// Content-Type the client declared, falling back to the client value only
// when the extension is genuinely unrecognized.
export function resolveMimeType(filename: string, clientMimeType?: string): string {
  const ext = path.extname(filename).toLowerCase();
  const raw = RAW_EXTENSION_MIME[ext];
  if (raw) return raw;
  return mime.lookup(filename) || clientMimeType || 'application/octet-stream';
}
