import { useState, useEffect } from 'react';
import { getFilePreviewUrl } from '@/lib/api/files';

const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes (signed URLs last 5 min)

export function usePreviewUrl(fileId: string | null, hasPreview: boolean) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || !hasPreview) {
      setUrl(null);
      return;
    }

    const cached = cache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;

    getFilePreviewUrl(fileId)
      .then((data) => {
        if (!cancelled) {
          cache.set(fileId, { url: data.previewUrl, expiresAt: Date.now() + CACHE_TTL });
          setUrl(data.previewUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => { cancelled = true; };
  }, [fileId, hasPreview]);

  return url;
}

export async function resolvePreviewUrl(fileId: string): Promise<string | null> {
  const cached = cache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const data = await getFilePreviewUrl(fileId);
    cache.set(fileId, { url: data.previewUrl, expiresAt: Date.now() + CACHE_TTL });
    return data.previewUrl;
  } catch {
    return null;
  }
}
