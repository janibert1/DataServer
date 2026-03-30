import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '../lib/axios';
import { DriveFile, SortField, SortDir } from '../types';
import { useUploadStore } from '../store/uploadStore';

export function useFiles(params: {
  folderId?: string | null;
  search?: string;
  sortBy?: SortField;
  sortDir?: SortDir;
  page?: number;
}) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: async () => {
      const res = await api.get('/files', {
        params: {
          folderId: params.folderId,
          search: params.search,
          sortBy: params.sortBy ?? 'updatedAt',
          sortDir: params.sortDir ?? 'desc',
          page: params.page ?? 1,
          limit: 500,
        },
      });
      return res.data as { files: DriveFile[]; pagination: any };
    },
  });
}

export function useRecentFiles() {
  return useQuery({
    queryKey: ['files', 'recent'],
    queryFn: async () => {
      const res = await api.get('/files/recent');
      return res.data.files as DriveFile[];
    },
  });
}

export function useStarredFiles() {
  return useQuery({
    queryKey: ['files', 'starred'],
    queryFn: async () => {
      const res = await api.get('/files/starred');
      return res.data.files as DriveFile[];
    },
  });
}

export function useTrashedFiles(page: number = 1) {
  return useQuery({
    queryKey: ['files', 'trash', page],
    queryFn: async () => {
      const res = await api.get('/files/trash', { params: { page } });
      return {
        files: res.data.files as DriveFile[],
        pagination: res.data.pagination as { page: number; limit: number; total: number; totalPages: number },
      };
    },
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: async () => {
      const res = await api.get(`/files/${id}`);
      return res.data.file as DriveFile;
    },
    enabled: !!id,
  });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();
  const { addUpload, updateUpload } = useUploadStore();

  return {
    upload: async (files: File[], folderId?: string | null) => {
      const uploadIds = files.map((f) => addUpload(f));

      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      if (folderId) formData.append('folderId', folderId);

      // Mark all as uploading
      uploadIds.forEach((id) => updateUpload(id, { status: 'uploading' }));

      try {
        const res = await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percent = Math.round(
              ((progressEvent.loaded ?? 0) / (progressEvent.total ?? 1)) * 100
            );
            uploadIds.forEach((id) => updateUpload(id, { progress: percent }));
          },
        });

        const { uploaded, errors } = res.data;

        uploadIds.forEach((id, i) => {
          if (errors[i]) {
            updateUpload(id, { status: 'error', error: errors[i].error });
          } else {
            updateUpload(id, { status: 'complete', progress: 100 });
          }
        });

        if (uploaded.length > 0) {
          toast.success(`Uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}.`);
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['folders'] });
          queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        }

        if (errors.length > 0) {
          errors.forEach((e: any) => toast.error(`${e.filename}: ${e.error}`));
        }

        return res.data;
      } catch (err) {
        uploadIds.forEach((id) => updateUpload(id, { status: 'error', error: getErrorMessage(err) }));
        toast.error(getErrorMessage(err));
        throw err;
      }
    },
  };
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/files/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File renamed.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.put(`/files/${id}/move`, { folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      toast.success('File moved.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useTrashFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/trash`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File moved to trash.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRestoreFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File restored.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useDeleteFilePermanently() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('File permanently deleted.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useStarFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useBulkTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { fileIds: string[]; folderIds: string[]; trashRootFiles?: boolean; trashAllInFolder?: string | null }) =>
      api.post('/files/bulk-trash', params),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/files/empty-trash'),
    onSuccess: (res) => {
      if (res.data.status === 'processing' || res.data.jobId) {
        toast.success('Emptying trash in the background. You will be notified when complete.');
      } else {
        toast.success(res.data.message);
      }
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useEmptyTrashStatus() {
  return useQuery({
    queryKey: ['empty-trash-status'],
    queryFn: async () => {
      const res = await api.get('/files/empty-trash/status');
      return res.data as { status: 'idle' | 'processing' | 'completed' | 'failed'; progress: number; jobId: string };
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'processing') return 2000;
      return false;
    },
    staleTime: 0,
  });
}

export async function getFileDownloadUrl(id: string): Promise<{ downloadUrl: string; filename: string }> {
  const res = await api.get(`/files/${id}/download`);
  return res.data;
}

export async function getFilePreviewUrl(id: string): Promise<{ previewUrl: string; mimeType: string }> {
  const res = await api.get(`/files/${id}/preview`);
  return res.data;
}

export function useFileVersions(fileId: string) {
  return useQuery({
    queryKey: ['files', fileId, 'versions'],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/versions`);
      return res.data.versions;
    },
    enabled: !!fileId,
  });
}
