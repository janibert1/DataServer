import { apiGet, apiDelete } from '@/lib/api-client';

export interface ZipDownload {
  id: string;
  name: string;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  sizeBytes: string | null;
  fileCount: number | null;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export function getDownloads() {
  return apiGet<{ downloads: ZipDownload[] }>('/api/downloads');
}

export function getDownloadUrl(id: string) {
  return apiGet<{ url: string }>(`/api/downloads/${id}/url`);
}

export function deleteDownload(id: string) {
  return apiDelete(`/api/downloads/${id}`);
}
