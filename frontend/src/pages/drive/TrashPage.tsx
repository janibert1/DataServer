import { useState } from 'react';
import { Trash2, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { DriveFile, SortField, SortDir } from '../../types';
import {
  useTrashedFiles, useRestoreFile, useDeleteFilePermanently, useEmptyTrash
} from '../../hooks/useFiles';
import { FileList } from '../../components/files/FileList';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function TrashPage() {
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DriveFile | null>(null);

  const { data: trashedFiles, isLoading } = useTrashedFiles();
  const restoreFile = useRestoreFile();
  const deleteFile = useDeleteFilePermanently();
  const emptyTrash = useEmptyTrash();

  const files = trashedFiles ?? [];

  function handleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function handleFileAction(action: string, file: DriveFile) {
    if (action === 'restore') restoreFile.mutate(file.id);
    else if (action === 'delete') setConfirmDelete(file);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Trash</h1>
          <p className="text-sm text-slate-500 mt-1">{files.length} item{files.length !== 1 ? 's' : ''} in trash</p>
        </div>
        {files.length > 0 && (
          <button
            onClick={() => setShowEmptyConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Empty trash
          </button>
        )}
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Items in trash are permanently deleted after 30 days</p>
          <p className="text-xs text-amber-600 mt-0.5">
            You can restore files before they are permanently removed.
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="w-8 h-8" />}
          title="Trash is empty"
          description="Files you delete will appear here before being permanently removed."
        />
      ) : (
        <div className="space-y-4">
          {/* Per-item restore/delete in the list, handled via context menu actions */}
          {/* Quick action bar for each file */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Deleted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Size</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {files.map((file) => {
                  const trashedDate = file.trashedAt
                    ? new Date(file.trashedAt)
                    : null;
                  const daysLeft = trashedDate
                    ? 30 - Math.floor((Date.now() - trashedDate.getTime()) / (1000 * 60 * 60 * 24))
                    : 30;
                  const formatBytes = (bytes: string | number) => {
                    const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
                    if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
                    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
                    return `${(n / 1024 ** 3).toFixed(2)} GB`;
                  };

                  return (
                    <tr key={file.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{file.mimeType.split('/')[1]?.toUpperCase() ?? 'File'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {trashedDate ? (
                          <div>
                            <p className="text-sm text-slate-500">
                              {trashedDate.toLocaleDateString()}
                            </p>
                            <p className={`text-xs mt-0.5 ${daysLeft <= 7 ? 'text-red-500' : 'text-slate-400'}`}>
                              {daysLeft > 0 ? `${daysLeft} days left` : 'Deleting soon'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{formatBytes(file.size)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => restoreFile.mutate(file.id)}
                            disabled={restoreFile.isPending}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                          <button
                            onClick={() => setConfirmDelete(file)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty trash confirm */}
      <ConfirmDialog
        open={showEmptyConfirm}
        onClose={() => setShowEmptyConfirm(false)}
        onConfirm={() => emptyTrash.mutate(undefined, { onSuccess: () => setShowEmptyConfirm(false) })}
        title="Empty trash?"
        description={`This will permanently delete all ${files.length} item${files.length !== 1 ? 's' : ''} in your trash. This action cannot be undone.`}
        confirmLabel="Empty trash"
        variant="danger"
        isLoading={emptyTrash.isPending}
      />

      {/* Delete single file confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteFile.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) });
          }
        }}
        title={`Permanently delete "${confirmDelete?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete permanently"
        variant="danger"
        isLoading={deleteFile.isPending}
      />
    </div>
  );
}
