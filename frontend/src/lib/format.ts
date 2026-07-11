// Single source of truth for human-readable byte sizes across the app.
// Previously there were 10+ near-duplicate formatBytes() implementations
// scattered across components/pages, several of which lacked a proper
// bytes-only branch (anything under 1024 bytes rounded to "0 KB"), plus
// inconsistent decimal precision between the ones that were correct.
export function formatBytes(bytes: string | number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const n = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 4).toFixed(2)} TB`;
}
