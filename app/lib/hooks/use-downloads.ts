import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as downloadsApi from '@/lib/api/downloads';

export function useDownloads() {
  const query = useQuery({
    queryKey: ['downloads'],
    queryFn: downloadsApi.getDownloads,
    refetchInterval: (q) => {
      const downloads = q.state.data?.downloads ?? [];
      const hasActive = downloads.some((d) => d.status === 'QUEUED' || d.status === 'PROCESSING');
      return hasActive ? 3000 : false;
    },
  });
  return { ...query, downloads: query.data?.downloads ?? [] };
}

export function useDeleteDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: downloadsApi.deleteDownload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}
