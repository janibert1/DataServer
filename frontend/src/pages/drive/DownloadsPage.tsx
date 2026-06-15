import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, RefreshCw, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../lib/axios';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ZipDownload {
  id: string;
  name: string;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  sizeBytes: string | null;
  fileCount: number | null;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function formatBytes(bytes: string | number | null): string {
  if (bytes === null) return '—';
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function StatusBadge({ status }: { status: ZipDownload['status'] }) {
  if (status === 'READY') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> Ready
    </span>
  );
  if (status === 'PROCESSING') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
      <Loader2 className="w-3 h-3 animate-spin" /> Processing
    </span>
  );
  if (status === 'QUEUED') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Queued
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<ZipDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchDownloads = useCallback(async () => {
    try {
      const { data } = await api.get('/downloads');
      setDownloads(data.downloads);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, []);

  // Auto-refresh when a push notification arrives (visibility change = user came back)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDownloads(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchDownloads]);

  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  // Poll while any download is not in a terminal state
  useEffect(() => {
    const hasActive = downloads.some((d) => d.status === 'QUEUED' || d.status === 'PROCESSING');
    if (!hasActive) return;
    const t = setInterval(fetchDownloads, 3000);
    return () => clearInterval(t);
  }, [downloads, fetchDownloads]);

  async function handleDownload(dl: ZipDownload) {
    setDownloading(dl.id);
    try {
      const { data } = await api.get(`/downloads/${dl.id}/url`);
      const a = document.createElement('a');
      a.href = data.url;
      a.download = `${dl.name}.zip`;
      a.click();
    } catch {
      toast.error('Failed to get download link');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.delete(`/downloads/${id}`);
      setDownloads((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Downloads</h1>
          <p className="text-sm text-slate-500 mt-0.5">Prepared archives are kept for 2 days</p>
        </div>
        <button
          onClick={() => fetchDownloads()}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {loading && downloads.length === 0 && !hasFetched ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : downloads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Download className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">No downloads yet</p>
          <p className="text-sm text-slate-400 mt-1">Select files or folders and click Download to create an archive</p>
        </div>
      ) : (
        <div className="space-y-2">
          {downloads.map((dl) => (
            <div
              key={dl.id}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5 text-brand-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900 truncate">{dl.name}.zip</span>
                  <StatusBadge status={dl.status} />
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  {dl.fileCount !== null && <span>{dl.fileCount} file{dl.fileCount !== 1 ? 's' : ''}</span>}
                  {dl.sizeBytes !== null && <span>{formatBytes(dl.sizeBytes)}</span>}
                  <span>{formatDistanceToNow(new Date(dl.createdAt), { addSuffix: true })}</span>
                  {dl.expiresAt && dl.status === 'READY' && (
                    <span className="text-amber-600">
                      expires {formatDistanceToNow(new Date(dl.expiresAt), { addSuffix: true })}
                    </span>
                  )}
                  {dl.errorMessage && <span className="text-red-500">{dl.errorMessage}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {dl.status === 'READY' && (
                  <button
                    onClick={() => handleDownload(dl)}
                    disabled={downloading === dl.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {downloading === dl.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Download
                  </button>
                )}
                <button
                  onClick={() => handleDelete(dl.id)}
                  disabled={deleting === dl.id}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Remove"
                >
                  {deleting === dl.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
