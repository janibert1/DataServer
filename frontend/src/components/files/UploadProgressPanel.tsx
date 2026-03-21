import { CheckCircle, XCircle, Loader2, X, ChevronDown, ChevronUp, CloudUpload } from 'lucide-react';
import clsx from 'clsx';
import { useUploadStore } from '../../store/uploadStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function UploadProgressPanel() {
  const { uploads, isVisible, setVisible, removeUpload, clearCompleted } = useUploadStore();

  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending');
  const done = uploads.filter((u) => u.status === 'complete' || u.status === 'error');

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 shadow-dropdown">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <CloudUpload className="w-4 h-4" />
          <span className="text-sm font-medium">
            {active.length > 0 ? `Uploading ${active.length} file${active.length > 1 ? 's' : ''}…` : `${done.length} upload${done.length > 1 ? 's' : ''} complete`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {done.length > 0 && (
            <button
              onClick={clearCompleted}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setVisible(!isVisible)}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
          >
            {isVisible ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Upload list */}
      {isVisible && (
        <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl max-h-64 overflow-y-auto divide-y divide-slate-50">
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 px-4 py-3">
              {/* Status icon */}
              <div className="flex-shrink-0">
                {upload.status === 'complete' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : upload.status === 'error' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{upload.file.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(upload.file.size)}</p>

                {upload.status === 'uploading' && (
                  <div className="mt-1 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}

                {upload.status === 'error' && (
                  <p className="text-xs text-red-500 mt-0.5">{upload.error}</p>
                )}
              </div>

              {/* Remove button */}
              {(upload.status === 'complete' || upload.status === 'error') && (
                <button
                  onClick={() => removeUpload(upload.id)}
                  className="flex-shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600"
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
