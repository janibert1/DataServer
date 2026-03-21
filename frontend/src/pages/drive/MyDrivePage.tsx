import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus, LayoutGrid, List, ChevronDown,
  Clock, Star
} from 'lucide-react';
import clsx from 'clsx';
import { DriveFile, DriveFolder, SortField, SortDir, ViewMode } from '../../types';
import { useFolders } from '../../hooks/useFolders';
import {
  useFiles, useRecentFiles, useTrashFile, useStarFile,
  useRenameFile, useDeleteFilePermanently, getFileDownloadUrl
} from '../../hooks/useFiles';
import { useTrashFolder, useStarFolder, useRenameFolder } from '../../hooks/useFolders';
import { FileGrid } from '../../components/files/FileGrid';
import { FileList } from '../../components/files/FileList';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { UploadDropzone, UploadButton } from '../../components/files/UploadDropzone';
import { CreateFolderModal } from '../../components/folders/CreateFolderModal';
import { ShareModal } from '../../components/sharing/ShareModal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { FileIcon } from '../../components/files/FileIcon';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

// ── Rename Modal ──────────────────────────────────────────────────────────────
import { Fragment, useRef, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Pencil, X } from 'lucide-react';

function RenameModal({
  open,
  onClose,
  initialName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  initialName: string;
  onConfirm: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, initialName]);

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-brand-600" />
                  Rename
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}
                className="space-y-4"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                  required
                  maxLength={255}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim() || isPending}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Saving…' : 'Rename'}
                  </button>
                </div>
              </form>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// ── Quick Access Card ─────────────────────────────────────────────────────────
function RecentFileCard({ file, onClick }: { file: DriveFile; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-sm transition-all text-left min-w-0 w-full"
    >
      <FileIcon mimeType={file.mimeType} className="w-9 h-9 flex-shrink-0" size={18} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}

// ── Sort Dropdown ─────────────────────────────────────────────────────────────
const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'updatedAt', label: 'Last modified' },
  { field: 'createdAt', label: 'Date created' },
  { field: 'size', label: 'Size' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export function MyDrivePage() {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [shareFolder, setShareFolder] = useState<DriveFolder | null>(null);

  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DriveFile | null>(null);

  const { data: foldersData, isLoading: foldersLoading } = useFolders(null);
  const { data: filesData, isLoading: filesLoading } = useFiles({ folderId: null, sortBy, sortDir });
  const { data: recentFiles } = useRecentFiles();

  const trashFile = useTrashFile();
  const trashFolder = useTrashFolder();
  const starFile = useStarFile();
  const starFolder = useStarFolder();
  const renameFile = useRenameFile();
  const renameFolder = useRenameFolder();
  const deleteFile = useDeleteFilePermanently();

  const folders = foldersData ?? [];
  const files = filesData?.files ?? [];
  const isLoading = foldersLoading || filesLoading;

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setSortDropdownOpen(false);
  }

  function handleFileAction(action: string, file: DriveFile) {
    if (action === 'preview') setPreviewFile(file);
    else if (action === 'download') {
      getFileDownloadUrl(file.id).then(({ downloadUrl, filename }) => {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.click();
      }).catch(() => toast.error('Download failed.'));
    } else if (action === 'rename') setRenameTarget({ type: 'file', id: file.id, name: file.name });
    else if (action === 'star') starFile.mutate(file.id);
    else if (action === 'trash') setConfirmTrash({ type: 'file', id: file.id, name: file.name });
    else if (action === 'delete') setConfirmDeleteFile(file);
  }

  function handleFolderAction(action: string, folder: DriveFolder) {
    if (action === 'open') navigate(`/drive/folder/${folder.id}`);
    else if (action === 'rename') setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
    else if (action === 'star') starFolder.mutate(folder.id);
    else if (action === 'trash') setConfirmTrash({ type: 'folder', id: folder.id, name: folder.name });
    else if (action === 'share') setShareFolder(folder);
  }

  function handleConfirmTrash() {
    if (!confirmTrash) return;
    if (confirmTrash.type === 'file') {
      trashFile.mutate(confirmTrash.id, { onSuccess: () => setConfirmTrash(null) });
    } else {
      trashFolder.mutate(confirmTrash.id, { onSuccess: () => setConfirmTrash(null) });
    }
  }

  function handleRename(name: string) {
    if (!renameTarget) return;
    if (renameTarget.type === 'file') {
      renameFile.mutate({ id: renameTarget.id, name }, { onSuccess: () => setRenameTarget(null) });
    } else {
      renameFolder.mutate({ id: renameTarget.id, name }, { onSuccess: () => setRenameTarget(null) });
    }
  }

  const currentSortLabel = SORT_OPTIONS.find((o) => o.field === sortBy)?.label ?? 'Sort';

  return (
    <UploadDropzone folderId={null} className="h-full">
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-900">My Drive</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateFolder(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New folder
            </button>
            <UploadButton folderId={null} />
          </div>
        </div>

        {/* Quick access / Recent */}
        {recentFiles && recentFiles.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Quick access</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {recentFiles.slice(0, 8).map((file) => (
                <RecentFileCard
                  key={file.id}
                  file={file}
                  onClick={() => setPreviewFile(file)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-700">
            {folders.length + files.length} items
          </h2>
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {currentSortLabel}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortDropdownOpen(false)} />
                  <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
                    {SORT_OPTIONS.map((o) => (
                      <button
                        key={o.field}
                        onClick={() => handleSort(o.field)}
                        className={clsx(
                          'w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors',
                          sortBy === o.field ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        {o.label}
                        {sortBy === o.field && (
                          <span className="text-xs text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* View toggle */}
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
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner size="lg" />
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <EmptyState
            icon={<Star className="w-8 h-8" />}
            title="Your drive is empty"
            description="Upload files or create folders to get started."
            action={
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  New folder
                </button>
                <UploadButton folderId={null} />
              </div>
            }
          />
        ) : viewMode === 'grid' ? (
          <FileGrid
            files={files}
            folders={folders}
            onFileClick={(f) => setPreviewFile(f)}
            onFolderClick={(folder) => navigate(`/drive/folder/${folder.id}`)}
            onFileAction={handleFileAction}
            onFolderAction={handleFolderAction}
          />
        ) : (
          <FileList
            files={files}
            folders={folders}
            onFileClick={(f) => setPreviewFile(f)}
            onFolderClick={(folder) => navigate(`/drive/folder/${folder.id}`)}
            onFileAction={handleFileAction}
            onFolderAction={handleFolderAction}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>

      {/* Modals */}
      <CreateFolderModal
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        parentId={null}
      />

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {shareFolder && (
        <ShareModal
          open={!!shareFolder}
          onClose={() => setShareFolder(null)}
          folderId={shareFolder.id}
        />
      )}

      <RenameModal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        initialName={renameTarget?.name ?? ''}
        onConfirm={handleRename}
        isPending={renameFile.isPending || renameFolder.isPending}
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
    </UploadDropzone>
  );
}
