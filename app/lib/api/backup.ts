import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

export interface BackupFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  folderId: string | null;
  backupSource?: string | null;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupFolder {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  folderCount: number;
  createdAt: string;
  updatedAt: string;
}

export function getBackupRoot() {
  return apiGet<{ folders: BackupFolder[]; files: BackupFile[] }>('/api/backup');
}

export function getBackupFolder(folderId: string) {
  return apiGet<{ folder: BackupFolder; folders: BackupFolder[]; files: BackupFile[] }>(`/api/backup/folder/${folderId}`);
}

export function promoteBackupFile(id: string) {
  return apiPost(`/api/backup/promote/file/${id}`);
}

export function promoteBackupFolder(id: string) {
  return apiPost(`/api/backup/promote/folder/${id}`);
}

export function deleteBackupFile(id: string) {
  return apiDelete(`/api/backup/file/${id}`);
}

export function deleteBackupFolder(id: string) {
  return apiDelete(`/api/backup/folder/${id}`);
}
