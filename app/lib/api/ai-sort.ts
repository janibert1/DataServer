import { apiGet, apiPost } from '@/lib/api-client';

export function triggerAiSort(prompt?: string, maxDepth?: number) {
  return apiPost<{ jobId: string; status: string }>('/api/files/ai-sort', { prompt, maxDepth });
}

export function getAiSortStatus() {
  return apiGet<{ status: 'idle' | 'processing' | 'completed' | 'failed'; jobId?: string }>('/api/files/ai-sort/status');
}
