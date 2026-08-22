import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as backupApi from '@/lib/api/backup';

export function useBackupRoot() {
  return useQuery({
    queryKey: ['backup', 'root'],
    queryFn: backupApi.getBackupRoot,
  });
}

export function useBackupFolder(folderId: string | null) {
  return useQuery({
    queryKey: ['backup', 'folder', folderId],
    queryFn: () => backupApi.getBackupFolder(folderId as string),
    enabled: folderId !== null,
  });
}

function useInvalidateBackup() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['backup'] });
}

export function usePromoteBackupFile() {
  const invalidate = useInvalidateBackup();
  return useMutation({ mutationFn: backupApi.promoteBackupFile, onSuccess: invalidate });
}

export function usePromoteBackupFolder() {
  const invalidate = useInvalidateBackup();
  return useMutation({ mutationFn: backupApi.promoteBackupFolder, onSuccess: invalidate });
}

export function useDeleteBackupFile() {
  const invalidate = useInvalidateBackup();
  return useMutation({ mutationFn: backupApi.deleteBackupFile, onSuccess: invalidate });
}

export function useDeleteBackupFolder() {
  const invalidate = useInvalidateBackup();
  return useMutation({ mutationFn: backupApi.deleteBackupFolder, onSuccess: invalidate });
}
