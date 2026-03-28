import { apiGet } from '@/lib/api-client';
import type { FolderShare } from '@/lib/types';

export function getSharedWithMe() {
  return apiGet<{ shares: FolderShare[] }>('/api/shared/with-me');
}

export function getSharedByMe() {
  return apiGet<{ shares: FolderShare[] }>('/api/shared/by-me');
}
