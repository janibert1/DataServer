import { CheckCircle, XCircle, Loader2, X, ChevronDown, ChevronUp, CloudUpload, RotateCcw, Pause } from 'lucide-react';
import { useUploadStore, loadPendingUploads, clearPendingUpload } from '../../store/uploadStore';
import { useQueryClient } from '@tanstack/react-query';
import { uploadChunked } from '../../hooks/useFiles';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../lib/axios';

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function UploadProgressPanel() {
  const { uploads, isVisible, setVisible, removeUpload, clearCompleted, addUpload, updateUpload, restoreFromStorage } = useUploadStore();
  const queryClient = useQueryClient();
  const resumingRef = useRef(new Set<string>());

  // On mount: hydrate paused items from localStorage so they appear after a page reload
  useEffect(() => { restoreFromStorage(); }, []);

  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending');
  const done = uploads.filter((u) => u.status === 'complete' || u.status === 'error');
  const paused = uploads.filter((u) => u.status === 'paused');

  async function resumeUpload(fileId: string, file: File) {
    if (resumingRef.current.has(fileId)) return;
    resumingRef.current.add(fileId);

    const pending = loadPendingUploads().find((u) => u.chunked.fileId === fileId);
    if (!pending) { resumingRef.current.delete(fileId); return; }

    const uploadItemId = addUpload(file);
    updateUpload(uploadItemId, { status: 'uploading', chunked: pending.chunked });

    // Remove the placeholder item that was restored from localStorage
    const placeholderItem = uploads.find((u) => u.chunked?.fileId === fileId && u.file === null);
    if (placeholderItem) removeUpload(placeholderItem.id);

    try {
      await uploadChunked(file, pending.chunked.folderId, uploadItemId, updateUpload, queryClient, {
        fileId: pending.chunked.fileId,
        uploadId: pending.chunked.uploadId,
        storageKey: pending.chunked.storageKey,
        completedParts: pending.chunked.completedParts,
        chunkSize: pending.chunked.chunkSize,
        totalChunks: pending.chunked.totalChunks,
      });
      toast.success(`${file.name} resumed and uploaded.`);
    } catch (err) {
      updateUpload(uploadItemId, { status: 'paused', error: getErrorMessage(err) });
    } finally {
      resumingRef.current.delete(fileId);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 shadow-dropdown">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <CloudUpload className="w-4 h-4" />
          <span className="text-sm font-medium">
            {active.length > 0
              ? `Uploading ${active.length} file${active.length > 1 ? 's' : ''}…`
              : paused.length > 0
              ? `${paused.length} paused`
              : `${done.length} upload${done.length > 1 ? 's' : ''} complete`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {done.length > 0 && (
            <button onClick={clearCompleted} className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10">
              Clear
            </button>
          )}
          <button onClick={() => setVisible(!isVisible)} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            {isVisible ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Upload list */}
      {isVisible && (
        <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl max-h-72 overflow-y-auto divide-y divide-slate-50">
          {uploads.map((upload) => {
            const name = upload.file?.name ?? upload.chunked?.name ?? '';
            const size = upload.file?.size ?? upload.chunked?.size ?? 0;
            const chunkInfo = upload.chunked
              ? `${upload.chunked.completedParts.length}/${upload.chunked.totalChunks} parts`
              : null;

            return (
              <div key={upload.id} className="flex items-center gap-3 px-4 py-3">
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {upload.status === 'complete' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : upload.status === 'error' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : upload.status === 'paused' ? (
                    <Pause className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(size)}
                    {chunkInfo && upload.status === 'uploading' && <span className="ml-1 text-brand-500">{chunkInfo}</span>}
                  </p>

                  {upload.status === 'uploading' && (
                    <div className="mt-1 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}

                  {upload.status === 'paused' && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      {upload.chunked
                        ? `Interrupted at ${upload.chunked.completedParts.length}/${upload.chunked.totalChunks} parts — re-select to resume`
                        : 'Interrupted — re-select file to resume'}
                    </p>
                  )}

                  {upload.status === 'error' && (
                    <p className="text-xs text-red-500 mt-0.5">{upload.error}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {upload.status === 'paused' && upload.chunked && (
                    <label className="cursor-pointer p-1 rounded text-amber-500 hover:bg-amber-50" title="Re-select file to resume">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f && upload.chunked) resumeUpload(upload.chunked.fileId, f);
                        }}
                      />
                      <RotateCcw className="w-3.5 h-3.5" />
                    </label>
                  )}
                  {(upload.status === 'complete' || upload.status === 'error' || upload.status === 'paused') && (
                    <button
                      onClick={() => {
                        if (upload.chunked) clearPendingUpload(upload.chunked.fileId);
                        removeUpload(upload.id);
                      }}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
