import { useState } from 'react';
import { Star, Share2, MoreVertical, Folder } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { DriveFile, DriveFolder } from '../../types';
import { FileIcon } from './FileIcon';
import { FileContextMenu } from './FileContextMenu';

interface Props {
  files: DriveFile[];
  folders: DriveFolder[];
  onFileClick: (file: DriveFile) => void;
  onFolderClick: (folder: DriveFolder) => void;
  onFileAction: (action: string, file: DriveFile) => void;
  onFolderAction: (action: string, folder: DriveFolder) => void;
  isTrash?: boolean;
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function FolderCard({
  folder,
  onDoubleClick,
  onAction,
}: {
  folder: DriveFolder;
  onDoubleClick: () => void;
  onAction: (action: string) => void;
}) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        className="group relative flex flex-col p-4 bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-card-hover cursor-pointer transition-all duration-150 select-none"
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: folder.color ? `${folder.color}20` : '#fef3c720' }}
          >
            <Folder
              className="w-6 h-6"
              style={{ color: folder.color ?? '#f59e0b' }}
              fill="currentColor"
              strokeWidth={1}
            />
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {folder.isStarred && <Star className="w-4 h-4 text-amber-400 fill-current" />}
            {folder.isShared && <Share2 className="w-3.5 h-3.5 text-brand-400" />}
            <button
              onClick={(e) => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-sm font-medium text-slate-800 truncate">{folder.name}</p>
        <p className="text-xs text-slate-400 mt-1">
          {folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
          {folder.folderCount > 0 && `, ${folder.folderCount} folder${folder.folderCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {menuPos && (
        <FileContextMenu
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onAction={onAction}
          type="folder"
          item={folder}
          isTrash={false}
        />
      )}
    </>
  );
}

function FileCard({
  file,
  onClick,
  onAction,
  isTrash,
}: {
  file: DriveFile;
  onClick: () => void;
  onAction: (action: string) => void;
  isTrash?: boolean;
}) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const isImage = file.mimeType.startsWith('image/');

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        className="group relative flex flex-col bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-card-hover cursor-pointer transition-all duration-150 select-none overflow-hidden"
      >
        {/* Thumbnail area */}
        <div className="aspect-video bg-slate-50 flex items-center justify-center relative overflow-hidden">
          {isImage && file.thumbnailKey ? (
            <img
              src={`/api/files/${file.id}/preview`}
              alt={file.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <FileIcon mimeType={file.mimeType} className="w-14 h-14" size={28} />
          )}

          {/* Overlay actions */}
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); }}
              className="p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm text-slate-500 hover:text-slate-700"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>

          {file.isStarred && (
            <div className="absolute top-2 left-2">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-current drop-shadow" />
            </div>
          )}
        </div>

        {/* File info */}
        <div className="p-3">
          <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
            <p className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
            </p>
          </div>
          {isTrash && file.trashedAt && (
            <p className="text-xs text-red-500 mt-1">
              Deleted {formatDistanceToNow(new Date(file.trashedAt), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {menuPos && (
        <FileContextMenu
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onAction={onAction}
          type="file"
          item={file}
          isTrash={isTrash}
        />
      )}
    </>
  );
}

export function FileGrid({ files, folders, onFileClick, onFolderClick, onFileAction, onFolderAction, isTrash }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {folders.map((folder) => (
        <FolderCard
          key={folder.id}
          folder={folder}
          onDoubleClick={() => onFolderClick(folder)}
          onAction={(action) => onFolderAction(action, folder)}
        />
      ))}
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onClick={() => onFileClick(file)}
          onAction={(action) => onFileAction(action, file)}
          isTrash={isTrash}
        />
      ))}
    </div>
  );
}
