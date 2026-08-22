import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as aiSortApi from '@/lib/api/ai-sort';

export function useAiSortStatus() {
  return useQuery({
    queryKey: ['ai-sort', 'status'],
    queryFn: aiSortApi.getAiSortStatus,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 3000 : false),
  });
}

export function useAiSort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prompt, maxDepth }: { prompt?: string; maxDepth?: number }) => aiSortApi.triggerAiSort(prompt, maxDepth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-sort', 'status'] }),
  });
}
