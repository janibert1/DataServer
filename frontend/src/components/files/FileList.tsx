import { useState } from 'react';
import { Star, Share2, Folder, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { DriveFile, DriveFolder, SortField, SortDir } from '../../types';
import { FileIcon } from './FileIcon';
import { FileContextMenu } from './FileContextMenu';

interface Props {
  files: DriveFile[];
  folders: DriveFolder[];
  onFileClick: (file: DriveFile) => void;
  onFolderClick: (folder: DriveFolder) => void;
  onFileAction: (action: string, file: DriveFile) => void;
  onFolderAction: (action: string, folder: DriveFolder) => void;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  isTrash?: boolean;
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function SortHeader({ label, field, current, dir, onSort }: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <div className="w-3 h-3" />
        )}
      </div>
    </th>
  );
}

export function FileList({
  files, folders, onFileClick, onFolderClick,
  onFileAction, onFolderAction, sortBy, sortDir, onSort, isTrash,
}: Props) {
  const [menuState, setMenuState] = useState<{ pos: { x: number; y: number }; item: DriveFile | DriveFolder; type: 'file' | 'folder' } | null>(null);

  const openMenu = (e: React.MouseEvent, item: DriveFile | DriveFolder, type: 'file' | 'folder') => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ pos: { x: e.clientX, y: e.clientY }, item, type });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-slate-100">
          <tr className="bg-slate-50">
            <SortHeader label="Name" field="name" current={sortBy} dir={sortDir} onSort={onSort} />
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Type</th>
            <SortHeader label="Modified" field="updatedAt" current={sortBy} dir={sortDir} onSort={onSort} />
            <SortHeader label="Size" field="size" current={sortBy} dir={sortDir} onSort={onSort} />
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {folders.map((folder) => (
            <tr
              key={folder.id}
              className="hover:bg-slate-50 cursor-pointer group transition-colors"
              onDoubleClick={() => onFolderClick(folder)}
              onContextMenu={(e) => openMenu(e, folder, 'folder')}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: folder.color ? `${folder.color}20` : '#fef3c720' }}
                  >
                    <Folder className="w-4 h-4" style={{ color: folder.color ?? '#f59e0b' }} fill="currentColor" strokeWidth={1} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate block">{folder.name}</span>
                    <span className="text-xs text-slate-400">{folder.fileCount} items</span>
                  </div>
                  {folder.isShared && <Share2 className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />}
                  {folder.isStarred && <Star className="w-3.5 h-3.5 text-amber-400 fill-current flex-shrink-0" />}
                </div>
              </td>
              <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">Folder</td>
              <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap">
                {formatDistanceToNow(new Date(folder.updatedAt), { addSuffix: true })}
              </td>
              <td className="px-4 py-2.5 text-sm text-slate-400">—</td>
              <td className="pr-2">
                <button
                  onClick={(e) => openMenu(e, folder, 'folder')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}

          {files.map((file) => (
            <tr
              key={file.id}
              className="hover:bg-slate-50 cursor-pointer group transition-colors"
              onClick={() => onFileClick(file)}
              onContextMenu={(e) => openMenu(e, file, 'file')}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <FileIcon mimeType={file.mimeType} className="w-8 h-8 flex-shrink-0" size={16} />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate block">{file.name}</span>
                  </div>
                  {file.isStarred && <Star className="w-3.5 h-3.5 text-amber-400 fill-current flex-shrink-0" />}
                </div>
              </td>
              <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">
                {file.mimeType.split('/')[1]?.toUpperCase() ?? 'File'}
              </td>
              <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap">
                {isTrash && file.trashedAt
                  ? <span className="text-red-500">Deleted {formatDistanceToNow(new Date(file.trashedAt), { addSuffix: true })}</span>
                  : formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })
                }
              </td>
              <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap">{formatBytes(file.size)}</td>
              <td className="pr-2">
                <button
                  onClick={(e) => openMenu(e, file, 'file')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}

          {files.length === 0 && folders.length === 0 && (
            <tr>
              <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                This folder is empty
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {menuState && (
        <FileContextMenu
          position={menuState.pos}
          onClose={() => setMenuState(null)}
          onAction={(action) => {
            if (menuState.type === 'file') onFileAction(action, menuState.item as DriveFile);
            else onFolderAction(action, menuState.item as DriveFolder);
            setMenuState(null);
          }}
          type={menuState.type}
          item={menuState.item}
          isTrash={isTrash}
        />
      )}
    </div>
  );
}
