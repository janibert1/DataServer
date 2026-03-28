import { apiGet, apiPatch, apiDelete, apiPost, apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { DriveFile, FileVersion } from '@/lib/types';

export function getFiles(params?: { folderId?: string; search?: string; sortBy?: string; sortDir?: string }) {
  return apiGet<{ files: DriveFile[] }>('/api/files', params as Record<string, string>);
}

export function getRecentFiles() {
  return apiGet<{ files: DriveFile[] }>('/api/files/recent');
}

export function getStarredFiles() {
  return apiGet<{ files: DriveFile[] }>('/api/files/starred');
}

export function getTrashedFiles() {
  return apiGet<{ files: DriveFile[] }>('/api/files/trash');
}

export function getFile(id: string) {
  return apiGet<{ file: DriveFile }>(`/api/files/${id}`);
}

export function getFileDownloadUrl(id: string) {
  return apiGet<{ downloadUrl: string; filename: string; mimeType: string }>(`/api/files/${id}/download`);
}

export function getFilePreviewUrl(id: string) {
  return apiGet<{ previewUrl: string; mimeType: string }>(`/api/files/${id}/preview`);
}

export function renameFile(id: string, name: string) {
  return apiPatch<{ file: DriveFile }>(`/api/files/${id}/rename`, { name });
}

export function moveFile(id: string, folderId: string | null) {
  return apiPatch<{ file: DriveFile }>(`/api/files/${id}/move`, { folderId });
}

export function starFile(id: string) {
  return apiPatch<{ file: DriveFile }>(`/api/files/${id}/star`);
}

export function trashFile(id: string) {
  return apiDelete(`/api/files/${id}`);
}

export function permanentDeleteFile(id: string) {
  return apiDelete(`/api/files/${id}/permanent`);
}

export function restoreFile(id: string) {
  return apiPost(`/api/files/restore/${id}`);
}

export function emptyTrash() {
  return apiDelete('/api/files/trash/empty');
}

export function flagFile(id: string, reason: string) {
  return apiPost(`/api/files/${id}/flag`, { reason });
}

export function getFileVersions(id: string) {
  return apiGet<{ versions: FileVersion[] }>(`/api/files/${id}/versions`);
}

interface UploadResponse {
  uploaded: Array<{ id: string; name: string; size: number; mimeType: string; status: string }>;
  errors: Array<{ filename: string; error: string }>;
}

export function uploadFiles(
  files: Array<{ uri: string; name: string; type: string }>,
  folderId?: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const { serverUrl } = useAuthStore.getState();
  if (!serverUrl) throw new Error('Server URL not configured');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        let msg = `Upload failed: ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) msg = data.error;
        } catch { /* use default message */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', {
        uri: file.uri,
        type: file.type || 'application/octet-stream',
        name: file.name,
      } as unknown as Blob);
    }
    if (folderId) formData.append('folderId', folderId);

    xhr.open('POST', `${serverUrl}/api/files/upload`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}
