import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { DriveFolder, DriveFile, FolderShare, Permission } from '@/lib/types';

export function getFolders(parentId?: string | null) {
  return apiGet<{ folders: DriveFolder[] }>('/api/folders', parentId ? { parentId } : undefined);
}

export function getFolder(id: string) {
  return apiGet<{ folder: DriveFolder }>(`/api/folders/${id}`);
}

export function getFolderContents(id: string) {
  return apiGet<{ permission: Permission; folders: DriveFolder[]; files: DriveFile[] }>(
    `/api/folders/${id}/contents`,
  );
}

export function createFolder(name: string, parentId?: string) {
  return apiPost<{ folder: DriveFolder }>('/api/folders', { name, parentId });
}

export function renameFolder(id: string, name: string) {
  return apiPatch<{ folder: DriveFolder }>(`/api/folders/${id}/rename`, { name });
}

export function moveFolder(id: string, parentId: string | null) {
  return apiPatch<{ folder: DriveFolder }>(`/api/folders/${id}/move`, { parentId });
}

export function trashFolder(id: string) {
  return apiDelete(`/api/folders/${id}`);
}

export function starFolder(id: string) {
  return apiPatch<{ folder: DriveFolder }>(`/api/folders/${id}/star`);
}

export function setFolderShareable(id: string, isShared: boolean) {
  return apiPatch(`/api/folders/${id}/shareable`, { isShared });
}

export function getFolderShareInfo(id: string) {
  return apiGet<{ shares: FolderShare[] }>(`/api/folders/${id}/share-info`);
}

export function shareFolder(
  id: string,
  data: { recipientEmail: string; permission: Permission; canReshare: boolean; expiresAt?: string },
) {
  return apiPost(`/api/folders/${id}/share`, data);
}

export function updateShare(folderId: string, shareId: string, data: { permission: Permission; canReshare: boolean }) {
  return apiPatch(`/api/folders/${folderId}/share/${shareId}`, data);
}

export function revokeShare(folderId: string, shareId: string) {
  return apiDelete(`/api/folders/${folderId}/share/${shareId}`);
}

export function generateShareInvitation(folderId: string, data: { permission: Permission; expiresAt?: string; maxUses?: number }) {
  return apiPost<{ invitation: { code: string } }>(`/api/folders/${folderId}/share/invitation`, data);
}
