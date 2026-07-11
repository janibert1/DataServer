import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronRight, Folder, File, MoveRight, Trash2, Download, Home } from 'lucide-react';
import { api } from '../../lib/axios';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { DriveFile } from '../../types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface BackupFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  folderId: string | null;
  backupSource?: string | null;
  path: string;
  createdAt: string;
  updatedAt: string;
}

interface BackupFolder {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  folderCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// Backup files come back from the API with a narrower shape than the
// regular My Drive listing. FilePreviewModal only actually touches
// id/name/mimeType/size, so the rest are safe placeholder defaults.
function toDriveFile(f: BackupFile): DriveFile {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    thumbnailKey: null,
    previewKey: null,
    status: 'READY' as DriveFile['status'],
    folderId: f.folderId,
    path: f.path,
    downloadCount: 0,
    isStarred: false,
    isTrashed: false,
    trashedAt: null,
    isVirusScanned: true,
    isFlagged: false,
    description: null,
    tags: [],
    isBackup: true,
    backupSource: f.backupSource ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function useBackupRoot() {
  return useQuery({
    queryKey: ['backup', 'root'],
    queryFn: async () => {
      const res = await api.get('/backup');
      return res.data as { folders: BackupFolder[]; files: BackupFile[] };
    },
  });
}

function useBackupFolder(folderId: string | null) {
  return useQuery({
    queryKey: ['backup', 'folder', folderId],
    queryFn: async () => {
      const res = await api.get(`/backup/folder/${folderId}`);
      return res.data as { folder: BackupFolder; folders: BackupFolder[]; files: BackupFile[] };
    },
    enabled: folderId !== null,
  });
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function BackupPage() {
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'Backups' }]);
  const [previewFile, setPreviewFile] = useState<BackupFile | null>(null);

  const rootQuery = useBackupRoot();
  const folderQuery = useBackupFolder(currentFolderId);

  const isLoading = currentFolderId === null ? rootQuery.isLoading : folderQuery.isLoading;
  const folders = currentFolderId === null ? (rootQuery.data?.folders ?? []) : (folderQuery.data?.folders ?? []);
  const files = currentFolderId === null ? (rootQuery.data?.files ?? []) : (folderQuery.data?.files ?? []);
  const isEmpty = !isLoading && folders.length === 0 && files.length === 0;
  const previewIndex = previewFile ? files.findIndex((f) => f.id === previewFile.id) : -1;

  const promoteFile = useMutation({
    mutationFn: (id: string) => api.post(`/backup/promote/file/${id}`),
    onSuccess: () => {
      toast.success('File moved to My Drive');
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: () => toast.error('Failed to move file'),
  });

  const promoteFolder = useMutation({
    mutationFn: (id: string) => api.post(`/backup/promote/folder/${id}`),
    onSuccess: () => {
      toast.success('Folder moved to My Drive');
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: () => toast.error('Failed to move folder'),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => api.delete(`/backup/file/${id}`),
    onSuccess: () => {
      toast.success('Backup file deleted');
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: () => toast.error('Failed to delete file'),
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => api.delete(`/backup/folder/${id}`),
    onSuccess: () => {
      toast.success('Backup folder deleted');
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: () => toast.error('Failed to delete folder'),
  });

  function openFolder(folder: BackupFolder) {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }

  function navigateTo(crumb: BreadcrumbItem) {
    setCurrentFolderId(crumb.id);
    const idx = breadcrumbs.findIndex((b) => b.id === crumb.id);
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
  }

  async function downloadFile(file: BackupFile) {
    try {
      const res = await api.get(`/files/${file.id}/download`);
      const a = document.createElement('a');
      a.href = res.data.downloadUrl;
      a.download = file.name;
      a.click();
    } catch {
      toast.error('Download failed.');
    }
  }

  async function downloadFolder(folder: BackupFolder) {
    try {
      const res = await api.post(
        '/files/download-zip',
        { fileIds: [], folderIds: [folder.id], name: folder.name },
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Folder download failed.');
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
          <Archive className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Backups</h1>
          <p className="text-xs text-slate-500 mt-0.5">Read-only snapshots synced from your devices</p>
        </div>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 1 && (
        <div className="px-6 py-2 flex items-center gap-1 text-sm border-b border-slate-50 flex-shrink-0">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
              <button
                onClick={() => navigateTo(crumb)}
                className={clsx(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
                  i === breadcrumbs.length - 1
                    ? 'text-slate-900 font-medium cursor-default'
                    : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                )}
              >
                {i === 0 && <Home className="w-3 h-3" />}
                {crumb.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<Archive className="w-8 h-8" />}
            title="No backups yet"
            description="Install the DataServer Backup app on your computer to start syncing files here."
          />
        ) : (
          <div className="space-y-1">
            {/* Folders */}
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors"
              >
                <Folder className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <button
                  className="flex-1 text-left text-sm font-medium text-slate-800 truncate"
                  onClick={() => openFolder(folder)}
                >
                  {folder.name}
                </button>
                <span className="text-xs text-slate-400 mr-2">
                  {folder.fileCount} files
                </span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button
                    title="Download as .zip"
                    onClick={() => downloadFolder(folder)}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    title="Move to My Drive"
                    onClick={() => promoteFolder.mutate(folder.id)}
                    className="p-1.5 rounded-md hover:bg-amber-100 text-amber-600 transition-colors"
                  >
                    <MoveRight className="w-4 h-4" />
                  </button>
                  <button
                    title="Delete backup folder"
                    onClick={() => {
                      if (confirm(`Delete backup folder "${folder.name}" and all its contents?`)) {
                        deleteFolder.mutate(folder.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-red-50 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Files */}
            {files.map((file) => (
              <div
                key={file.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <File className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setPreviewFile(file)}
                  title="Preview"
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(file.size)}
                    {file.backupSource && (
                      <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-xs">
                        {file.backupSource}
                      </span>
                    )}
                  </p>
                </button>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button
                    title="Download"
                    onClick={() => downloadFile(file)}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    title="Move to My Drive"
                    onClick={() => promoteFile.mutate(file.id)}
                    className="p-1.5 rounded-md hover:bg-amber-100 text-amber-600 transition-colors"
                  >
                    <MoveRight className="w-4 h-4" />
                  </button>
                  <button
                    title="Delete backup"
                    onClick={() => {
                      if (confirm(`Delete backup file "${file.name}"?`)) {
                        deleteFile.mutate(file.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-red-50 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewFile && (
        <FilePreviewModal
          file={toDriveFile(previewFile)}
          onClose={() => setPreviewFile(null)}
          onNext={() => previewIndex >= 0 && previewIndex < files.length - 1 && setPreviewFile(files[previewIndex + 1])}
          onPrev={() => previewIndex > 0 && setPreviewFile(files[previewIndex - 1])}
          hasNext={previewIndex >= 0 && previewIndex < files.length - 1}
          hasPrev={previewIndex > 0}
        />
      )}
    </div>
  );
}
