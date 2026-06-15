import { useEffect, useRef } from 'react';
import { Archive, FolderOutput, CheckCircle, XCircle, Loader2, X, ChevronDown, ChevronUp, Trash2, RotateCcw } from 'lucide-react';
import { useDriveOpsStore } from '../../store/driveOpsStore';
import { api } from '../../lib/axios';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

export function DriveOpsPanel() {
  const { jobs, isVisible, updateJob, removeJob, clearDone, setVisible, cancelJob } = useDriveOpsStore();
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeIds = jobs.filter((j) => j.status === 'waiting' || j.status === 'active' || j.status === 'delayed').map((j) => j.id).join(',');

  useEffect(() => {
    if (!activeIds) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }

    async function poll() {
      const activeJobs = useDriveOpsStore.getState().jobs.filter(
        (j) => j.status === 'waiting' || j.status === 'active' || j.status === 'delayed'
      );
      for (const job of activeJobs) {
        try {
          const res = await api.get(`/jobs/${job.id}`);
          const d = res.data;
          useDriveOpsStore.getState().updateJob(job.id, {
            status: d.status, progress: d.progress ?? null, result: d.result, error: d.error,
          });
          if (d.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
          }
        } catch { /* ignore transient errors */ }
      }
    }

    poll();
    timerRef.current = setInterval(poll, 2000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [activeIds]);

  if (jobs.length === 0) return null;

  const active = jobs.filter((j) => j.status === 'waiting' || j.status === 'active' || j.status === 'delayed');
  const done = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');

  return (
    <div className="fixed bottom-4 left-4 z-40 w-80 shadow-dropdown">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4" />
          <span className="text-sm font-medium">
            {active.length > 0
              ? `${active.length} operation${active.length !== 1 ? 's' : ''} running…`
              : `${done.length} operation${done.length !== 1 ? 's' : ''} done`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {done.length > 0 && (
            <button onClick={clearDone} className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10">
              Clear
            </button>
          )}
          <button onClick={() => setVisible(!isVisible)} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            {isVisible ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isVisible && (
        <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl max-h-72 overflow-y-auto divide-y divide-slate-50">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-shrink-0 mt-0.5">
                {job.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : job.status === 'failed' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {job.type === 'zip-to-drive'
                    ? <Archive className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    : job.type === 'trash-folder'
                    ? <Trash2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    : job.type === 'restore-folder'
                    ? <RotateCcw className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    : <FolderOutput className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                  <p className="text-xs font-medium text-slate-700 truncate">{job.label}</p>
                </div>

                <p className="text-xs text-slate-400">
                  {job.status === 'completed'
                    ? (job.result?.message ?? job.result?.fileName ?? 'Done')
                    : job.status === 'failed'
                    ? (job.error ?? 'Failed')
                    : (job.progress?.message ?? (job.status === 'waiting' ? 'Queued…' : 'Starting…'))}
                </p>

                {(job.status === 'waiting' || job.status === 'active' || job.status === 'delayed') && (
                  <div className="mt-1.5 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${job.progress?.percent ?? 0}%` }}
                    />
                  </div>
                )}
              </div>

              {(job.status === 'completed' || job.status === 'failed') ? (
                <button
                  onClick={() => removeJob(job.id)}
                  className="flex-shrink-0 mt-0.5 p-0.5 rounded text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/jobs/${job.id}`);
                      cancelJob(job.id);
                    } catch {
                      toast.error('Could not cancel job');
                    }
                  }}
                  className="flex-shrink-0 mt-0.5 p-0.5 rounded text-red-300 hover:text-red-500"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
