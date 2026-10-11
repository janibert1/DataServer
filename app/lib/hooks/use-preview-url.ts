import { useState, useEffect } from 'react';
import { getFileThumbnailUrl } from '@/lib/api/files';

// A file grid needs the small 400px derivative, never the 2000px preview
// used by the full-screen viewer.  Apart from wasting bandwidth, decoding a
// preview-size image for each freshly visible card can saturate the iOS image
// decoder during a fast flick.  Keep a promise cache as well as the resolved
// URL cache: FlatList may briefly mount the same cell twice while it recycles
// rows, and that must still result in one signed-URL request.
const cache = new Map<string, { url: string; expiresAt: number }>();
const pending = new Map<string, Promise<string>>();
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes (signed URLs last 5 min)

async function resolveThumbnailUrl(fileId: string): Promise<string> {
  const cached = cache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let request = pending.get(fileId);
  if (!request) {
    request = getFileThumbnailUrl(fileId)
      .then((data) => {
        cache.set(fileId, { url: data.thumbnailUrl, expiresAt: Date.now() + CACHE_TTL });
        return data.thumbnailUrl;
      })
      .finally(() => pending.delete(fileId));
    pending.set(fileId, request);
  }
  return request;
}

export function useThumbnailUrl(fileId: string | null, hasPreview: boolean) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || !hasPreview) {
      setUrl(null);
      return;
    }

    let cancelled = false;

    resolveThumbnailUrl(fileId)
      .then((thumbnailUrl) => {
        if (!cancelled) {
          setUrl(thumbnailUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => { cancelled = true; };
  }, [fileId, hasPreview]);

  return url;
}

export async function resolveThumbnailUrlOrNull(fileId: string): Promise<string | null> {
  try {
    return await resolveThumbnailUrl(fileId);
  } catch {
    return null;
  }
}
