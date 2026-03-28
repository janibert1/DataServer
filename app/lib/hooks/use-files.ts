import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import * as filesApi from '@/lib/api/files';

export function useFiles(params?: { folderId?: string; search?: string; sortBy?: string; sortDir?: string }) {
  return useQuery({
    queryKey: queryKeys.files.list(params),
    queryFn: () => filesApi.getFiles(params),
  });
}

export function useRecentFiles() {
  return useQuery({
    queryKey: queryKeys.files.recent,
    queryFn: filesApi.getRecentFiles,
  });
}

export function useStarredFiles() {
  return useQuery({
    queryKey: queryKeys.files.starred,
    queryFn: filesApi.getStarredFiles,
  });
}

export function useTrashedFiles() {
  return useQuery({
    queryKey: queryKeys.files.trash,
    queryFn: filesApi.getTrashedFiles,
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: queryKeys.files.detail(id),
    queryFn: () => filesApi.getFile(id),
    enabled: !!id,
  });
}

export function useFileVersions(id: string) {
  return useQuery({
    queryKey: queryKeys.files.versions(id),
    queryFn: () => filesApi.getFileVersions(id),
    enabled: !!id,
  });
}

export function useRenameFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => filesApi.renameFile(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useMoveFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => filesApi.moveFile(id, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useStarFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => filesApi.starFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });
}

export function useTrashFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => filesApi.trashFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function usePermanentDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => filesApi.permanentDeleteFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.account.storage });
    },
  });
}

export function useRestoreFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => filesApi.restoreFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: filesApi.emptyTrash,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.account.storage });
    },
  });
}

export function useFlagFile() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => filesApi.flagFile(id, reason),
  });
}
