import { useEffect, useRef } from 'react';
import {
  Download, Edit2, Move, Star, StarOff, Share2, Trash2,
  RotateCcw, Eye, History, Flag, Copy, FolderOpen, X
} from 'lucide-react';
import { DriveFile, DriveFolder } from '../../types';

interface Props {
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: string) => void;
  type: 'file' | 'folder';
  item: DriveFile | DriveFolder;
  isTrash?: boolean;
}

interface MenuItem {
  label: string;
  icon: typeof Eye;
  action: string;
  danger?: boolean;
  divider?: boolean;
}

export function FileContextMenu({ position, onClose, onAction, type, item, isTrash }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust menu position to keep it within viewport
  const menuStyle = {
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y, window.innerHeight - 300),
  };

  const fileMenuItems: MenuItem[] = isTrash
    ? [
        { label: 'Restore', icon: RotateCcw, action: 'restore' },
        { label: 'Delete permanently', icon: Trash2, action: 'delete-permanent', danger: true, divider: true },
      ]
    : [
        { label: 'Preview', icon: Eye, action: 'preview' },
        { label: 'Download', icon: Download, action: 'download', divider: true },
        { label: 'Rename', icon: Edit2, action: 'rename' },
        { label: 'Move to…', icon: Move, action: 'move', divider: true },
        { label: (item as DriveFile).isStarred ? 'Remove star' : 'Add to starred', icon: (item as DriveFile).isStarred ? StarOff : Star, action: 'star' },
        { label: 'Version history', icon: History, action: 'versions', divider: true },
        { label: 'Report', icon: Flag, action: 'flag' },
        { label: 'Move to trash', icon: Trash2, action: 'trash', danger: true, divider: true },
      ];

  const folderMenuItems: MenuItem[] = isTrash
    ? [
        { label: 'Restore', icon: RotateCcw, action: 'restore' },
        { label: 'Delete permanently', icon: Trash2, action: 'delete-permanent', danger: true, divider: true },
      ]
    : [
        { label: 'Open', icon: FolderOpen, action: 'open', divider: true },
        { label: 'Rename', icon: Edit2, action: 'rename' },
        { label: 'Move to…', icon: Move, action: 'move', divider: true },
        { label: (item as DriveFolder).isStarred ? 'Remove star' : 'Add to starred', icon: (item as DriveFolder).isStarred ? StarOff : Star, action: 'star' },
        { label: 'Share…', icon: Share2, action: 'share', divider: true },
        { label: 'Move to trash', icon: Trash2, action: 'trash', danger: true },
      ];

  const menuItems = type === 'file' ? fileMenuItems : folderMenuItems;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] bg-white rounded-xl shadow-dropdown border border-slate-100 py-1 animate-fade-in"
      style={menuStyle}
    >
      {menuItems.map((menuItem, i) => (
        <div key={menuItem.action}>
          {menuItem.divider && <div className="my-1 border-t border-slate-100" />}
          <button
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left ${
              menuItem.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
            }`}
            onClick={() => {
              onAction(menuItem.action);
              onClose();
            }}
          >
            <menuItem.icon className="w-4 h-4 flex-shrink-0" />
            {menuItem.label}
          </button>
        </div>
      ))}
    </div>
  );
}
