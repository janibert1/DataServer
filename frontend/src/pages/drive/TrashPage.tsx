import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, RotateCcw, X, Folder, ChevronLeft, ChevronRight } from 'lucide-react';
import { DriveFile, DriveFolder } from '../../types';
import {
  useTrashedFiles, useRestoreFile, useDeleteFilePermanently, useEmptyTrash, useEmptyTrashStatus
} from '../../hooks/useFiles';
import { useTrashedFolders, useRestoreFolder, useDeleteFolderPermanently } from '../../hooks/useFolders';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../lib/axios';

function formatBytes(bytes: string | number) {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function DaysLeft({ trashedAt }: { trashedAt: string | null }) {
  if (!trashedAt) return <span className="text-sm text-slate-400">—</span>;
  const trashedDate = new Date(trashedAt);
  const daysLeft = 30 - Math.floor((Date.now() - trashedDate.getTime()) / (1000 * 60 * 60 * 24));
  return (
    <div>
      <p className="text-sm text-slate-500">{trashedDate.toLocaleDateString()}</p>
      <p className={`text-xs mt-0.5 ${daysLeft <= 7 ? 'text-red-500' : 'text-slate-400'}`}>
        {daysLeft > 0 ? `${daysLeft} days left` : 'Deleting soon'}
      </p>
    </div>
  );
}

export function TrashPage() {
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DriveFile | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<DriveFolder | null>(null);
  const [filePage, setFilePage] = useState(1);
  const [folderPage, setFolderPage] = useState(1);

  const { data: trashedFilesData, isLoading: filesLoading, refetch: refetchTrash } = useTrashedFiles(filePage);
  const { data: trashedFoldersData, isLoading: foldersLoading, refetch: refetchTrashFolders } = useTrashedFolders(folderPage);
  const restoreFile = useRestoreFile();
  const deleteFile = useDeleteFilePermanently();
  const restoreFolder = useRestoreFolder();
  const deleteFolder = useDeleteFolderPermanently();
  const emptyTrash = useEmptyTrash();
  const emptyTrashStatus = useEmptyTrashStatus();

  const files = trashedFilesData?.files ?? [];
  const folders = trashedFoldersData?.folders ?? [];
  const filePagination = trashedFilesData?.pagination;
  const folderPagination = trashedFoldersData?.pagination;
  const totalItems = (filePagination?.total ?? 0) + (folderPagination?.total ?? 0);
  const isLoading = filesLoading || foldersLoading;

  // Poll for empty-trash completion when processing
  const isProcessing = emptyTrashStatus.data?.status === 'processing';
  const lastStatusRef = useState<string>('idle');

  useEffect(() => {
    const status = emptyTrashStatus.data?.status;
    if (!status) return;

    if (status === 'processing' && lastStatusRef[0] !== 'processing') {
      toast.success('Started emptying trash in the background...');
    }

    if (status === 'completed' && lastStatusRef[0] !== 'completed') {
      refetchTrash();
      refetchTrashFolders();
    }

    if (status === 'failed' && lastStatusRef[0] !== 'failed') {
      toast.error('Emptying trash failed. Please try again.');
      refetchTrash();
      refetchTrashFolders();
    }

    lastStatusRef[1](status);
  }, [emptyTrashStatus.data?.status, refetchTrash, refetchTrashFolders]);

  // Invalidate pagination when page exceeds available data
  useEffect(() => {
    if (filePagination && filePage > filePagination.totalPages && filePagination.totalPages > 0) {
      setFilePage(filePagination.totalPages);
    }
  }, [filePagination, filePage]);

  useEffect(() => {
    if (folderPagination && folderPage > folderPagination.totalPages && folderPagination.totalPages > 0) {
      setFolderPage(folderPagination.totalPages);
    }
  }, [folderPagination, folderPage]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Trash</h1>
          <p className="text-sm text-slate-500 mt-1">{totalItems} item{totalItems !== 1 ? 's' : ''} in trash</p>
        </div>
        {totalItems > 0 && (
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
            You can restore files and folders before they are permanently removed.
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : totalItems === 0 ? (
        <EmptyState
          icon={<Trash2 className="w-8 h-8" />}
          title="Trash is empty"
          description="Files and folders you delete will appear here before being permanently removed."
        />
      ) : (
        <>
          {/* Folders section */}
          {folders.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-700">Folders ({folderPagination?.total ?? folders.length})</p>
              </div>
              <table className="w-full">
                <thead className="border-b border-slate-100">
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Deleted</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {folders.map((folder) => (
                    <tr key={`folder-${folder.id}`} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{folder.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">Folder</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <DaysLeft trashedAt={folder.trashedAt ?? null} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => restoreFolder.mutate(folder.id)}
                            disabled={restoreFolder.isPending}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                          <button
                            onClick={() => setConfirmDeleteFolder(folder)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Folder pagination */}
              {folderPagination && folderPagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Showing {(folderPage - 1) * folderPagination.limit + 1}-{Math.min(folderPage * folderPagination.limit, folderPagination.total)} of {folderPagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFolderPage((p) => Math.max(1, p - 1))}
                      disabled={folderPage <= 1}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-xs text-slate-500">Page {folderPage} of {folderPagination.totalPages}</span>
                    <button
                      onClick={() => setFolderPage((p) => p + 1)}
                      disabled={folderPage >= folderPagination.totalPages}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files section */}
          {files.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-700">Files ({filePagination?.total ?? files.length})</p>
              </div>
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
                  {files.map((file) => (
                    <tr key={`file-${file.id}`} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{file.mimeType.split('/')[1]?.toUpperCase() ?? 'File'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <DaysLeft trashedAt={file.trashedAt ?? null} />
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
                            onClick={() => setConfirmDeleteFile(file)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* File pagination */}
              {filePagination && filePagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Showing {(filePage - 1) * filePagination.limit + 1}-{Math.min(filePage * filePagination.limit, filePagination.total)} of {filePagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFilePage((p) => Math.max(1, p - 1))}
                      disabled={filePage <= 1}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-xs text-slate-500">Page {filePage} of {filePagination.totalPages}</span>
                    <button
                      onClick={() => setFilePage((p) => p + 1)}
                      disabled={filePage >= filePagination.totalPages}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty trash confirm */}
      <ConfirmDialog
        open={showEmptyConfirm}
        onClose={() => setShowEmptyConfirm(false)}
        onConfirm={() => {
          setShowEmptyConfirm(false);
          emptyTrash.mutate(undefined, {
            onSuccess: (res) => {
              // Trigger status polling by refetching
              emptyTrashStatus.refetch();
            },
            onError: (err) => {
              const msg = getErrorMessage(err);
              if ((err as any)?.response?.status === 409) {
                toast.error('An empty trash operation is already in progress.');
              } else {
                toast.error(msg);
              }
            },
          });
        }}
        title="Empty trash?"
        description={`This will permanently delete all ${totalItems} item${totalItems !== 1 ? 's' : ''} in your trash. This action cannot be undone.`}
        confirmLabel="Empty trash"
        variant="danger"
        isLoading={emptyTrash.isPending}
      />

      {/* Processing indicator */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <div>
            <p className="text-sm font-medium text-blue-900">Emptying trash...</p>
            <p className="text-xs text-blue-600 mt-0.5">This may take a few minutes. You will be notified when complete.</p>
          </div>
        </div>
      )}

      {/* Delete single file confirm */}
      <ConfirmDialog
        open={!!confirmDeleteFile}
        onClose={() => setConfirmDeleteFile(null)}
        onConfirm={() => {
          if (confirmDeleteFile) {
            deleteFile.mutate(confirmDeleteFile.id, { onSuccess: () => setConfirmDeleteFile(null) });
          }
        }}
        title={`Permanently delete "${confirmDeleteFile?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete permanently"
        variant="danger"
        isLoading={deleteFile.isPending}
      />

      {/* Delete single folder confirm */}
      <ConfirmDialog
        open={!!confirmDeleteFolder}
        onClose={() => setConfirmDeleteFolder(null)}
        onConfirm={() => {
          if (confirmDeleteFolder) {
            deleteFolder.mutate(confirmDeleteFolder.id, { onSuccess: () => setConfirmDeleteFolder(null) });
          }
        }}
        title={`Permanently delete folder "${confirmDeleteFolder?.name}"?`}
        description="This will permanently delete the folder. This action cannot be undone."
        confirmLabel="Delete permanently"
        variant="danger"
        isLoading={deleteFolder.isPending}
      />
    </div>
  );
}
