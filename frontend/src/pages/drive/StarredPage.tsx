import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { DriveFile, DriveFolder, SortField, SortDir } from '../../types';
import { useStarredFiles, useTrashFile, useStarFile, useMoveFile, getFileDownloadUrl } from '../../hooks/useFiles';
import { useStarFolder, useTrashFolder, useMoveFolder } from '../../hooks/useFolders';
import { api } from '../../lib/axios';
import { MoveModal } from '../../components/files/MoveModal';
import { FileList } from '../../components/files/FileList';
import { FileGrid } from '../../components/files/FileGrid';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { LayoutGrid, List } from 'lucide-react';
import toast from 'react-hot-toast';

function useStarredFolders() {
  return useQuery({
    queryKey: ['folders', 'starred'],
    queryFn: async () => {
      const res = await api.get('/folders/starred');
      return res.data.folders as DriveFolder[];
    },
  });
}

export function StarredPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);

  const { data: starredFiles, isLoading: filesLoading } = useStarredFiles();
  const { data: starredFolders, isLoading: foldersLoading } = useStarredFolders();

  const trashFile = useTrashFile();
  const trashFolder = useTrashFolder();
  const starFile = useStarFile();
  const starFolder = useStarFolder();
  const moveFile = useMoveFile();
  const moveFolder = useMoveFolder();
  const [moveTarget, setMoveTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);

  const isLoading = filesLoading || foldersLoading;
  const files = starredFiles ?? [];
  const folders = starredFolders ?? [];
  const isEmpty = files.length === 0 && folders.length === 0;

  function handleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function handleFileAction(action: string, file: DriveFile) {
    if (action === 'preview') setPreviewFile(file);
    else if (action === 'download') {
      getFileDownloadUrl(file.id)
        .then(({ downloadUrl, filename }) => { const a = document.createElement('a'); a.href = downloadUrl; a.download = filename; a.click(); })
        .catch(() => toast.error('Download failed.'));
    } else if (action === 'star') starFile.mutate(file.id);
    else if (action === 'trash') trashFile.mutate(file.id);
    else if (action === 'move') setMoveTarget({ type: 'file', id: file.id, name: file.name });
  }

  function handleFolderAction(action: string, folder: DriveFolder) {
    if (action === 'open') navigate(`/drive/folder/${folder.id}`);
    else if (action === 'star') starFolder.mutate(folder.id);
    else if (action === 'trash') trashFolder.mutate(folder.id);
    else if (action === 'move') setMoveTarget({ type: 'folder', id: folder.id, name: folder.name });
  }

  function handleMoveConfirm(targetFolderId: string | null) {
    if (!moveTarget) return;
    if (moveTarget.type === 'file') moveFile.mutate({ id: moveTarget.id, folderId: targetFolderId }, { onSuccess: () => setMoveTarget(null) });
    else moveFolder.mutate({ id: moveTarget.id, parentId: targetFolderId }, { onSuccess: () => setMoveTarget(null) });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Starred</h1>
          <p className="text-sm text-slate-500 mt-1">Files and folders you've starred</p>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx('p-1.5 transition-colors', viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600')}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx('p-1.5 transition-colors', viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600')}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<Star className="w-8 h-8" />}
          title="No starred items"
          description="Star files and folders to quickly access them here."
        />
      ) : viewMode === 'grid' ? (
        <FileGrid
          files={files}
          folders={folders}
          onFileClick={(f) => setPreviewFile(f)}
          onFolderClick={(f) => navigate(`/drive/folder/${f.id}`)}
          onFileAction={handleFileAction}
          onFolderAction={handleFolderAction}
        />
      ) : (
        <FileList
          files={files}
          folders={folders}
          onFileClick={(f) => setPreviewFile(f)}
          onFolderClick={(f) => navigate(`/drive/folder/${f.id}`)}
          onFileAction={handleFileAction}
          onFolderAction={handleFolderAction}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}

      <MoveModal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMoveConfirm}
        isPending={moveFile.isPending || moveFolder.isPending}
        excludeIds={moveTarget ? [moveTarget.id] : []}
        itemName={moveTarget?.name}
      />

      {previewFile && (() => {
        const previewIndex = files.findIndex((f) => f.id === previewFile.id);
        return (
          <FilePreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            onNext={() => previewIndex < files.length - 1 && setPreviewFile(files[previewIndex + 1])}
            onPrev={() => previewIndex > 0 && setPreviewFile(files[previewIndex - 1])}
            hasNext={previewIndex < files.length - 1}
            hasPrev={previewIndex > 0}
          />
        );
      })()}
    </div>
  );
}
