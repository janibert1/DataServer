import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '../lib/axios';
import { DriveFolder, SharePermission } from '../types';
import { useDriveOpsStore } from '../store/driveOpsStore';

export function useFolders(parentId?: string | null) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ['folders', parentId ?? 'root'],
    queryFn: async () => {
      const res = await api.get('/folders', {
        params: { parentId: parentId ?? 'root' },
      });
      return {
        folders: res.data.folders as DriveFolder[],
        total: res.data.total as number,
      };
    },
  });
}

export function useFolder(id: string) {
  return useQuery({
    queryKey: ['folder', id],
    queryFn: async () => {
      const res = await api.get(`/folders/${id}`);
      return res.data.folder as DriveFolder;
    },
    enabled: !!id,
  });
}

export function useFolderContents(folderId: string | null, sortBy = 'name', sortDir = 'asc', page = 1) {
  return useQuery({
    queryKey: ['folder-contents', folderId, sortBy, sortDir, page],
    queryFn: async () => {
      if (!folderId) return null;
      const res = await api.get(`/folders/${folderId}/contents`, {
        params: { sortBy, sortDir, page, limit: 500 },
      });
      return res.data as {
        permission: SharePermission;
        folders: DriveFolder[];
        files: any[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
    },
    enabled: !!folderId,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; parentId?: string | null; color?: string }) =>
      api.post('/folders', data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['folders', vars.parentId ?? 'root'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents', vars.parentId] });
      if (vars.parentId) queryClient.invalidateQueries({ queryKey: ['folder', vars.parentId] });
      toast.success('Folder created.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color, description }: { id: string; name?: string; color?: string; description?: string }) =>
      api.patch(`/folders/${id}`, { name, color, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      toast.success('Folder updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useMoveFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      api.put(`/folders/${id}/move`, { parentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      // Moving a folder changes both its old and new parent's aggregate size
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      toast.success('Folder moved.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useTrashFolder() {
  const queryClient = useQueryClient();
  const addJob = useDriveOpsStore((s) => s.addJob);
  return useMutation({
    mutationFn: (id: string) => api.post<{ jobId: string; label: string }>(`/folders/${id}/trash`),
    onSuccess: (res, id) => {
      const { jobId, label } = res.data;
      addJob({ id: jobId, type: 'trash-folder', label });
      // Optimistically remove from visible listings while the job runs in background
      queryClient.setQueriesData<any>({ queryKey: ['folders'] }, (old: any) =>
        old ? { ...old, folders: (old.folders ?? []).filter((f: any) => f.id !== id) } : old
      );
      queryClient.setQueriesData<any>({ queryKey: ['folder-contents'] }, (old: any) =>
        old ? { ...old, folders: (old.folders ?? []).filter((f: any) => f.id !== id) } : old
      );
      // Parent's aggregate size changes once the trash job removes this folder's bytes
      queryClient.invalidateQueries({ queryKey: ['folder'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRestoreFolder() {
  const queryClient = useQueryClient();
  const addJob = useDriveOpsStore((s) => s.addJob);
  return useMutation({
    mutationFn: (id: string) => api.post<{ jobId: string; label: string }>(`/folders/${id}/restore`),
    onSuccess: (res) => {
      const { jobId, label } = res.data;
      addJob({ id: jobId, type: 'restore-folder', label });
      queryClient.invalidateQueries({ queryKey: ['folders', 'trashed'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useTrashedFolders(page: number = 1) {
  return useQuery({
    queryKey: ['folders', 'trashed', page],
    queryFn: async () => {
      const res = await api.get('/folders/trashed', { params: { page } });
      return {
        folders: res.data.folders as DriveFolder[],
        pagination: res.data.pagination as { page: number; limit: number; total: number; totalPages: number },
      };
    },
  });
}

export function useDeleteFolderPermanently() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/folders/${id}/permanent`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success('Folder permanently deleted.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useStarFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/folders/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useToggleShareable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      api.patch(`/folders/${id}/shareable`, { isShared }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useFolderShareInfo(folderId: string) {
  return useQuery({
    queryKey: ['folder-share-info', folderId],
    queryFn: async () => {
      const res = await api.get(`/folders/${folderId}/share-info`);
      return res.data as { folder: DriveFolder; shares: any[] };
    },
    enabled: !!folderId,
  });
}

export function useShareFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, email, permission, canReshare }: {
      folderId: string;
      email: string;
      permission: SharePermission;
      canReshare?: boolean;
    }) => api.post(`/folders/${folderId}/share`, { email, permission, canReshare }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['folder-share-info', vars.folderId] });
      toast.success('Folder shared.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useUpdateSharePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, shareId, permission, canReshare }: {
      folderId: string; shareId: string; permission: SharePermission; canReshare?: boolean;
    }) => api.patch(`/folders/${folderId}/share/${shareId}`, { permission, canReshare }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['folder-share-info', vars.folderId] });
      toast.success('Permission updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, shareId }: { folderId: string; shareId: string }) =>
      api.delete(`/folders/${folderId}/share/${shareId}`),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['folder-share-info', vars.folderId] });
      toast.success('Access revoked.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useCreateFolderShareInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      folderId: string;
      targetPermission?: SharePermission;
      maxUses?: number;
      expiresAt?: string;
      email?: string;
      note?: string;
    }) => api.post('/invitations', { type: 'FOLDER_SHARE', ...data }),
    onSuccess: () => toast.success('Invitation code generated.'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
