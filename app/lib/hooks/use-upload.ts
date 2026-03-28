import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { uploadFiles } from '@/lib/api/files';
import { useUploadStore } from '@/stores/upload-store';

export function useUploadFiles(folderId?: string) {
  const { addUpload, updateUpload } = useUploadStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (files: Array<{ uri: string; name: string; type: string }>) => {
      const uploadIds = files.map((f) => addUpload(f.name, 0));

      try {
        uploadIds.forEach((id) => updateUpload(id, { status: 'uploading' }));

        const result = await uploadFiles(files, folderId, (progress) => {
          uploadIds.forEach((id) => updateUpload(id, { progress }));
        });

        // Backend returns { uploaded: [...], errors: [...] }
        uploadIds.forEach((id, i) => {
          const uploaded = result.uploaded?.[i];
          if (uploaded) {
            updateUpload(id, { status: 'complete', progress: 1 });
          } else {
            const err = result.errors?.[i];
            updateUpload(id, { status: 'error', error: err?.error ?? 'Upload failed' });
          }
        });

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Upload failed';
        uploadIds.forEach((id) => updateUpload(id, { status: 'error', error: msg }));
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.files.all });
      qc.invalidateQueries({ queryKey: queryKeys.folders.all });
      qc.invalidateQueries({ queryKey: queryKeys.account.storage });
    },
  });
}
