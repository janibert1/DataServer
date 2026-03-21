import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Grid, List, FolderPlus, ChevronDown, Share2 } from 'lucide-react';
import { useFolderContents, useFolder, useTrashFolder, useStarFolder } from '../../hooks/useFolders';
import { useTrashFile, useStarFile, useFiles, useRestoreFile, useDeleteFilePermanently } from '../../hooks/useFiles';
import { FileGrid } from '../../components/files/FileGrid';
import { FileList } from '../../components/files/FileList';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { UploadDropzone, UploadButton } from '../../components/files/UploadDropzone';
import { CreateFolderModal } from '../../components/folders/CreateFolderModal';
import { FolderBreadcrumb } from '../../components/folders/FolderBreadcrumb';
import { ShareModal } from '../../components/sharing/ShareModal';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DriveFile, DriveFolder, ViewMode, SortField, SortDir, BreadcrumbItem } from '../../types';
import { getFileDownloadUrl } from '../../hooks/useFiles';
import { FolderOpen } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import clsx from 'clsx';
import { api } from '../../lib/axios';

const PERMISSION_LABELS: Record<string, string> = {
  VIEWER: 'Viewer', DOWNLOADER: 'Downloader', CONTRIBUTOR: 'Contributor',
  EDITOR: 'Editor', OWNER: 'Owner',
};
const PERMISSION_COLORS: Record<string, string> = {
  VIEWER: 'bg-slate-100 text-slate-600', DOWNLOADER: 'bg-blue-100 text-blue-700',
  CONTRIBUTOR: 'bg-green-100 text-green-700', EDITOR: 'bg-amber-100 text-amber-700',
  OWNER: 'bg-purple-100 text-purple-700',
};

export function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const { data: folderContents, isLoading } = useFolderContents(folderId ?? null, sortBy, sortDir);
  const { data: folderData } = useFolder(folderId ?? '');
  const trashFile = useTrashFile();
  const starFile = useStarFile();
  const trashFolder = useTrashFolder();
  const starFolder = useStarFolder();

  // Build breadcrumb chain
  useEffect(() => {
    if (!folderId) return;
    async function buildBreadcrumbs() {
      const crumbs: BreadcrumbItem[] = [];
      let currentId: string | null = folderId!;
      while (currentId) {
        try {
          const res = await api.get(`/folders/${currentId}`);
          const folder = res.data.folder;
          crumbs.unshift({ id: folder.id, name: folder.name });
          currentId = folder.parentId;
        } catch {
          break;
        }
      }
      setBreadcrumbs(crumbs);
    }
    buildBreadcrumbs();
  }, [folderId]);

  const folders = folderContents?.folders ?? [];
  const files = folderContents?.files ?? [];
  const permission = folderContents?.permission;
  const isOwner = folderData && user && folderData.ownerId === user.id;
  const canUpload = permission && ['CONTRIBUTOR', 'EDITOR', 'OWNER'].includes(permission);

  const handleFileAction = async (action: string, file: DriveFile) => {
    switch (action) {
      case 'preview': setPreviewFile(file); break;
      case 'download': {
        const { downloadUrl, filename } = await getFileDownloadUrl(file.id);
        const a = document.createElement('a'); a.href = downloadUrl; a.download = filename; a.click();
        break;
      }
      case 'star': starFile.mutate(file.id); break;
      case 'trash': trashFile.mutate(file.id); break;
    }
  };

  const handleFolderAction = (action: string, folder: DriveFolder) => {
    switch (action) {
      case 'open': navigate(`/drive/folder/${folder.id}`); break;
      case 'star': starFolder.mutate(folder.id); break;
      case 'trash': trashFolder.mutate(folder.id); break;
    }
  };

  const previewIndex = previewFile ? files.findIndex((f: any) => f.id === previewFile.id) : -1;
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <UploadDropzone folderId={folderId} className="min-h-full">
      <div className="p-6 space-y-4">
        {/* Breadcrumb */}
        <FolderBreadcrumb items={breadcrumbs} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{folderData?.name ?? 'Folder'}</h1>
            {permission && (
              <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', PERMISSION_COLORS[permission])}>
                {PERMISSION_LABELS[permission]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode('grid')} className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}>
                <Grid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}>
                <List className="w-4 h-4" />
              </button>
            </div>
            {isOwner && (
              <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors">
                <Share2 className="w-4 h-4" />
                Share
              </button>
            )}
            {canUpload && (
              <>
                <button onClick={() => setShowCreateFolder(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                  <FolderPlus className="w-4 h-4" />New folder
                </button>
                <UploadButton folderId={folderId} />
              </>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : isEmpty ? (
          <EmptyState
            icon={<FolderOpen className="w-8 h-8" />}
            title="This folder is empty"
            description={canUpload ? 'Upload files or create a subfolder to get started.' : 'No files have been added yet.'}
            action={canUpload ? <UploadButton folderId={folderId} /> : undefined}
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
            onSort={(field) => {
              if (field === sortBy) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
              else { setSortBy(field); setSortDir('asc'); }
            }}
          />
        )}
      </div>

      <CreateFolderModal open={showCreateFolder} onClose={() => setShowCreateFolder(false)} parentId={folderId} />

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onNext={() => previewIndex < files.length - 1 && setPreviewFile(files[previewIndex + 1])}
          onPrev={() => previewIndex > 0 && setPreviewFile(files[previewIndex - 1])}
          hasNext={previewIndex < files.length - 1}
          hasPrev={previewIndex > 0}
        />
      )}

      {showShare && folderId && (
        <ShareModal open={showShare} onClose={() => setShowShare(false)} folderId={folderId} />
      )}
    </UploadDropzone>
  );
}
