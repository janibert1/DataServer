import { useState, useEffect, Fragment, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Grid, List, FolderPlus, ChevronDown, Share2, Pencil, X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { useFolderContents, useFolder, useTrashFolder, useStarFolder, useMoveFolder, useRenameFolder, useCreateFolder } from '../../hooks/useFolders';
import { useTrashFile, useStarFile, useMoveFile, useRenameFile, useBulkTrash, getFileDownloadUrl } from '../../hooks/useFiles';
import { FileGrid, DragDropPayload, SelectionItem } from '../../components/files/FileGrid';
import { FileList } from '../../components/files/FileList';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { UploadDropzone, UploadButton } from '../../components/files/UploadDropzone';
import { CreateFolderModal } from '../../components/folders/CreateFolderModal';
import { FolderBreadcrumb } from '../../components/folders/FolderBreadcrumb';
import { ShareModal } from '../../components/sharing/ShareModal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MoveModal } from '../../components/files/MoveModal';
import { AutoCreateFolderModal } from '../../components/files/AutoCreateFolderModal';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DriveFile, DriveFolder, ViewMode, SortField, SortDir, BreadcrumbItem } from '../../types';
import { FolderOpen } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import clsx from 'clsx';
import { api } from '../../lib/axios';
import toast from 'react-hot-toast';

const PERMISSION_LABELS: Record<string, string> = {
  VIEWER: 'Viewer', DOWNLOADER: 'Downloader', CONTRIBUTOR: 'Contributor',
  EDITOR: 'Editor', OWNER: 'Owner',
};
const PERMISSION_COLORS: Record<string, string> = {
  VIEWER: 'bg-slate-100 text-slate-600', DOWNLOADER: 'bg-blue-100 text-blue-700',
  CONTRIBUTOR: 'bg-green-100 text-green-700', EDITOR: 'bg-amber-100 text-amber-700',
  OWNER: 'bg-purple-100 text-purple-700',
};

function RenameModal({
  open, onClose, initialName, onConfirm, isPending,
}: {
  open: boolean; onClose: () => void; initialName: string; onConfirm: (name: string) => void; isPending: boolean;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setName(initialName); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 100); }
  }, [open, initialName]);

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-brand-600" /> Rename
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onConfirm(name.trim()); }} className="space-y-4">
                <input ref={inputRef} type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400" required maxLength={255} />
                <div className="flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={!name.trim() || isPending} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">{isPending ? 'Saving…' : 'Rename'}</button>
                </div>
              </form>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

export function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [autoCreateFolder, setAutoCreateFolder] = useState<{ dragged: DragDropPayload; target: DragDropPayload } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [confirmBulkTrash, setConfirmBulkTrash] = useState(false);
  const [filePage, setFilePage] = useState(1);
  const [selectAllMode, setSelectAllMode] = useState(false);

  const { data: folderContents, isLoading } = useFolderContents(folderId ?? null, sortBy, sortDir, filePage);
  const { data: folderData } = useFolder(folderId ?? '');

  // Open file preview from search result URL (?preview=fileId)
  useEffect(() => {
    const previewId = searchParams.get('preview');
    if (previewId && folderContents?.files) {
      const file = folderContents.files.find((f: any) => f.id === previewId);
      if (file) {
        setPreviewFile(file);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, folderContents]);
  const trashFile = useTrashFile();
  const starFile = useStarFile();
  const trashFolder = useTrashFolder();
  const starFolder = useStarFolder();
  const moveFile = useMoveFile();
  const moveFolder = useMoveFolder();
  const renameFile = useRenameFile();
  const renameFolder = useRenameFolder();
  const createFolder = useCreateFolder();
  const bulkTrash = useBulkTrash();

  // Build breadcrumb chain
  useEffect(() => {
    if (!folderId) return;
    async function buildBreadcrumbs() {
      const crumbs: BreadcrumbItem[] = [];
      let currentId: string | null = folderId!;
      while (currentId) {
        try {
          const res: { data: { folder: { id: string; name: string; parentId: string | null } } } = await api.get(`/folders/${currentId}`);
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
  const pagination = folderContents?.pagination;
  const fileTotal = pagination?.total ?? files.length;
  const loadedItems = folders.length + files.length;
  const totalItems = fileTotal + folders.length;
  const allLoadedSelected = selectedItems.size > 0 && selectedItems.size === loadedItems;

  function handleToggleSelect(item: SelectionItem) {
    setSelectedItems((prev) => {
      const key = `${item.type}:${item.id}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelectAllMode(false);
  }

  function handleSelectAll() {
    if (selectAllMode || selectedItems.size === loadedItems) {
      setSelectedItems(new Set());
      setSelectAllMode(false);
    } else {
      const allKeys = [
        ...folders.map((f: any) => `folder:${f.id}`),
        ...files.map((f: any) => `file:${f.id}`),
      ];
      setSelectedItems(new Set(allKeys));
      setSelectAllMode(false);
    }
  }

  function handleSelectAllTotal() {
    setSelectAllMode(true);
    setSelectedItems(new Set());
  }

  function handleBulkTrash() {
    if (selectAllMode) {
      bulkTrash.mutate({ fileIds: [], folderIds: [], trashAllInFolder: folderId ?? undefined }, {
        onSuccess: () => {
          setSelectedItems(new Set());
          setSelectAllMode(false);
          setConfirmBulkTrash(false);
        },
      });
      return;
    }
    const fileIds: string[] = [];
    const folderIds: string[] = [];
    selectedItems.forEach((key) => {
      const [type, id] = key.split(':');
      if (type === 'file') fileIds.push(id);
      else folderIds.push(id);
    });
    bulkTrash.mutate({ fileIds, folderIds }, {
      onSuccess: () => {
        setSelectedItems(new Set());
        setConfirmBulkTrash(false);
      },
    });
  }

  const handleFileAction = (action: string, file: DriveFile) => {
    switch (action) {
      case 'preview': setPreviewFile(file); break;
      case 'download': {
        getFileDownloadUrl(file.id).then(({ downloadUrl, filename }) => {
          const a = document.createElement('a'); a.href = downloadUrl; a.download = filename; a.click();
        }).catch(() => toast.error('Download failed.'));
        break;
      }
      case 'star': starFile.mutate(file.id); break;
      case 'trash': setConfirmTrash({ type: 'file', id: file.id, name: file.name }); break;
      case 'rename': setRenameTarget({ type: 'file', id: file.id, name: file.name }); break;
      case 'move': setMoveTarget({ type: 'file', id: file.id, name: file.name }); break;
    }
  };

  const handleFolderAction = (action: string, folder: DriveFolder) => {
    switch (action) {
      case 'open': navigate(`/drive/folder/${folder.id}`); break;
      case 'star': starFolder.mutate(folder.id); break;
      case 'trash': setConfirmTrash({ type: 'folder', id: folder.id, name: folder.name }); break;
      case 'rename': setRenameTarget({ type: 'folder', id: folder.id, name: folder.name }); break;
      case 'move': setMoveTarget({ type: 'folder', id: folder.id, name: folder.name }); break;
      case 'share': setShowShare(true); break;
    }
  };

  function handleConfirmTrash() {
    if (!confirmTrash) return;
    if (confirmTrash.type === 'file') trashFile.mutate(confirmTrash.id, { onSuccess: () => setConfirmTrash(null) });
    else trashFolder.mutate(confirmTrash.id, { onSuccess: () => setConfirmTrash(null) });
  }

  function handleRename(name: string) {
    if (!renameTarget) return;
    if (renameTarget.type === 'file') renameFile.mutate({ id: renameTarget.id, name }, { onSuccess: () => setRenameTarget(null) });
    else renameFolder.mutate({ id: renameTarget.id, name }, { onSuccess: () => setRenameTarget(null) });
  }

  function handleMoveConfirm(targetFolderId: string | null) {
    if (!moveTarget) return;
    if (moveTarget.type === 'file') moveFile.mutate({ id: moveTarget.id, folderId: targetFolderId }, { onSuccess: () => setMoveTarget(null) });
    else moveFolder.mutate({ id: moveTarget.id, parentId: targetFolderId }, { onSuccess: () => setMoveTarget(null) });
  }

  function handleDropOnFolder(dragged: DragDropPayload, targetFolderId: string) {
    if (dragged.type === 'file') moveFile.mutate({ id: dragged.id, folderId: targetFolderId });
    else moveFolder.mutate({ id: dragged.id, parentId: targetFolderId });
  }

  function handleDropOnItem(dragged: DragDropPayload, target: DragDropPayload) {
    setAutoCreateFolder({ dragged, target });
  }

  async function handleAutoCreateFolder(folderName: string) {
    if (!autoCreateFolder) return;
    const { dragged, target } = autoCreateFolder;
    createFolder.mutate({ name: folderName, parentId: folderId ?? null }, {
      onSuccess: (res) => {
        const newFolderId = res.data.folder.id;
        if (dragged.type === 'file') moveFile.mutate({ id: dragged.id, folderId: newFolderId });
        else moveFolder.mutate({ id: dragged.id, parentId: newFolderId });
        if (target.type === 'file') moveFile.mutate({ id: target.id, folderId: newFolderId });
        else moveFolder.mutate({ id: target.id, parentId: newFolderId });
        setAutoCreateFolder(null);
      },
    });
  }

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

        {/* Bulk action bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-50 border border-brand-200 rounded-xl">
            <input
              type="checkbox"
              checked={allLoadedSelected}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-brand-800">
              {selectedItems.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setConfirmBulkTrash(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Trash selected
            </button>
            <button
              onClick={() => setSelectedItems(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Toolbar row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {loadedItems === totalItems
              ? `${totalItems} items`
              : `${loadedItems} of ${totalItems} items`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                selectedItems.size > 0 && !selectAllMode
                  ? 'bg-brand-100 text-brand-700 border-brand-200'
                  : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
              )}
              title="Select all on this page"
            >
              Select all on page
            </button>

            {fileTotal > 500 && (
              <button
                onClick={handleSelectAllTotal}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                  selectAllMode
                    ? 'bg-brand-100 text-brand-700 border-brand-200'
                    : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                )}
              >
                Select all ({fileTotal})
              </button>
            )}

            {/* Page navigation */}
            {fileTotal > 500 && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <button
                  onClick={() => setFilePage((p) => Math.max(1, p - 1))}
                  disabled={filePage <= 1}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-1">Page {filePage}</span>
                <button
                  onClick={() => setFilePage((p) => p + 1)}
                  disabled={filePage >= Math.ceil(fileTotal / 500)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
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
            onDropOnFolder={handleDropOnFolder}
            onDropOnItem={handleDropOnItem}
            selectedItems={selectedItems}
            onToggleSelect={handleToggleSelect}
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
            onDropOnFolder={handleDropOnFolder}
            onDropOnItem={handleDropOnItem}
            selectedItems={selectedItems}
            onToggleSelect={handleToggleSelect}
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

      <RenameModal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        initialName={renameTarget?.name ?? ''}
        onConfirm={handleRename}
        isPending={renameFile.isPending || renameFolder.isPending}
      />

      <MoveModal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMoveConfirm}
        isPending={moveFile.isPending || moveFolder.isPending}
        excludeIds={moveTarget ? [moveTarget.id] : []}
        itemName={moveTarget?.name}
      />

      <AutoCreateFolderModal
        open={!!autoCreateFolder}
        onClose={() => setAutoCreateFolder(null)}
        onConfirm={handleAutoCreateFolder}
        isPending={createFolder.isPending}
      />

      <ConfirmDialog
        open={!!confirmTrash}
        onClose={() => setConfirmTrash(null)}
        onConfirm={handleConfirmTrash}
        title={`Move "${confirmTrash?.name}" to trash?`}
        description="You can restore it from the trash within 30 days."
        confirmLabel="Move to trash"
        variant="danger"
        isLoading={trashFile.isPending || trashFolder.isPending}
      />

      <ConfirmDialog
        open={confirmBulkTrash}
        onClose={() => setConfirmBulkTrash(false)}
        onConfirm={handleBulkTrash}
        title={`Move ${selectedItems.size} items to trash?`}
        description="You can restore them from the trash within 30 days."
        confirmLabel="Move to trash"
        variant="danger"
        isLoading={bulkTrash.isPending}
      />
    </UploadDropzone>
  );
}
