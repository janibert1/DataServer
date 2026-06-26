import { SyncProgress, SyncResult, SyncState } from "../types";

interface Props {
  state: SyncState;
  progress: SyncProgress | null;
  result: SyncResult | null;
  log: string[];
  lastSync: string | null;
}

export default function SyncLog({ state, progress, result, log, lastSync }: Props) {
  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  }

  const percent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      {state === "syncing" && progress && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>Syncing…</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          {progress.current_file && (
            <p className="mt-1.5 text-xs text-slate-500 truncate">{progress.current_file}</p>
          )}
        </div>
      )}

      {state === "done" && result && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3">
          <div className="text-sm font-medium text-green-400">Sync complete</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {result.uploaded} uploaded · {result.skipped} unchanged
            {result.errors > 0 && <span className="text-red-400"> · {result.errors} errors</span>}
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
          <div className="text-sm font-medium text-red-400">Sync failed</div>
        </div>
      )}

      {lastSync && state === "idle" && (
        <div className="text-xs text-slate-500">Last sync: {formatTime(lastSync)}</div>
      )}

      {log.length > 0 && (
        <div className="mt-1">
          <div className="text-xs font-medium text-slate-400 mb-2">Recent activity</div>
          <div className="bg-slate-900 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
            {log.slice(-50).reverse().map((line, i) => (
              <div key={i} className="text-xs text-slate-400 truncate font-mono">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
