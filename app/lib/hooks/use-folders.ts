import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import * as foldersApi from '@/lib/api/folders';
import type { Permission } from '@/lib/types';

export function useFolders(parentId?: string | null) {
  return useQuery({
    queryKey: queryKeys.folders.list(parentId),
    queryFn: () => foldersApi.getFolders(parentId),
  });
}

export function useFolder(id: string) {
  return useQuery({
    queryKey: queryKeys.folders.detail(id),
    queryFn: () => foldersApi.getFolder(id),
    enabled: !!id,
  });
}

export function useFolderContents(id: string) {
  return useQuery({
    queryKey: queryKeys.folders.contents(id),
    queryFn: () => foldersApi.getFolderContents(id),
    enabled: !!id,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string }) =>
      foldersApi.createFolder(name, parentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => foldersApi.renameFolder(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useMoveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      foldersApi.moveFolder(id, parentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useTrashFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => foldersApi.trashFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });
}

export function useStarFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => foldersApi.starFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useFolderShareInfo(id: string) {
  return useQuery({
    queryKey: queryKeys.folders.shareInfo(id),
    queryFn: () => foldersApi.getFolderShareInfo(id),
    enabled: !!id,
  });
}

export function useShareFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      folderId,
      ...data
    }: {
      folderId: string;
      recipientEmail: string;
      permission: Permission;
      canReshare: boolean;
      expiresAt?: string;
    }) => foldersApi.shareFolder(folderId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.shareInfo(vars.folderId) });
    },
  });
}

export function useUpdateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      folderId,
      shareId,
      ...data
    }: {
      folderId: string;
      shareId: string;
      permission: Permission;
      canReshare: boolean;
    }) => foldersApi.updateShare(folderId, shareId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.shareInfo(vars.folderId) });
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, shareId }: { folderId: string; shareId: string }) =>
      foldersApi.revokeShare(folderId, shareId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.shareInfo(vars.folderId) });
    },
  });
}

export function useGenerateShareInvitation() {
  return useMutation({
    mutationFn: ({
      folderId,
      ...data
    }: {
      folderId: string;
      permission: Permission;
      expiresAt?: string;
      maxUses?: number;
    }) => foldersApi.generateShareInvitation(folderId, data),
  });
}
