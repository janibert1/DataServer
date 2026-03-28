import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ChevronRight, Folder, FolderOpen, Home, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/axios';
import { DriveFolder } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetFolderId: string | null) => void;
  isPending: boolean;
  /** IDs to exclude from the tree (the item being moved + its current parent) */
  excludeIds?: string[];
  itemName?: string;
}

interface TreeNode {
  folder: DriveFolder;
  children: TreeNode[] | null; // null = not loaded yet
  expanded: boolean;
}

export function MoveModal({ open, onClose, onConfirm, isPending, excludeIds = [], itemName }: Props) {
  const [selected, setSelected] = useState<string | null>(null); // null = root
  const [rootFolders, setRootFolders] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, TreeNode[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setSelected(null);
      setExpanded({});
      setLoading({});
      loadChildren('root');
    }
  }, [open]);

  async function loadChildren(parentId: string) {
    setLoading((l) => ({ ...l, [parentId]: true }));
    try {
      const res = await api.get('/folders', { params: { parentId } });
      const folders = (res.data.folders as DriveFolder[]).filter(
        (f) => !excludeIds.includes(f.id)
      );
      const nodes = folders.map((f) => ({ folder: f, children: null, expanded: false }));
      if (parentId === 'root') {
        setRootFolders(nodes);
      } else {
        setExpanded((e) => ({ ...e, [parentId]: nodes }));
      }
    } catch {
      // silently fail
    }
    setLoading((l) => ({ ...l, [parentId]: false }));
  }

  async function toggleExpand(folderId: string) {
    if (expanded[folderId]) {
      setExpanded((e) => {
        const copy = { ...e };
        delete copy[folderId];
        return copy;
      });
    } else {
      await loadChildren(folderId);
    }
  }

  function renderNode(node: TreeNode, depth: number): JSX.Element {
    const isExpanded = !!expanded[node.folder.id];
    const isSelected = selected === node.folder.id;
    const children = expanded[node.folder.id] ?? [];
    const isLoading = loading[node.folder.id];

    return (
      <div key={node.folder.id}>
        <button
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors rounded-lg',
            isSelected ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
          )}
          style={{ paddingLeft: 12 + depth * 20 }}
          onClick={() => setSelected(node.folder.id)}
        >
          <button
            className="p-0.5 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.folder.id); }}
          >
            <ChevronRight className={clsx('w-3.5 h-3.5 text-slate-400 transition-transform', isExpanded && 'rotate-90')} />
          </button>
          {isExpanded
            ? <FolderOpen className="w-4 h-4 text-brand-500 flex-shrink-0" />
            : <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
          }
          <span className="truncate">{node.folder.name}</span>
        </button>
        {isExpanded && (
          <div>
            {isLoading && (
              <div className="py-1 text-xs text-slate-400" style={{ paddingLeft: 32 + depth * 20 }}>Loading…</div>
            )}
            {children.map((child) => renderNode(child, depth + 1))}
            {!isLoading && children.length === 0 && (
              <div className="py-1 text-xs text-slate-400" style={{ paddingLeft: 32 + depth * 20 }}>Empty</div>
            )}
          </div>
        )}
      </div>
    );
  }

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
            <Dialog.Panel className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <Dialog.Title className="text-base font-semibold text-slate-900">
                  Move {itemName ? `"${itemName}"` : 'item'}
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3 pb-3 max-h-72 overflow-y-auto">
                {/* Root / My Drive option */}
                <button
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors rounded-lg',
                    selected === null ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  )}
                  onClick={() => setSelected(null)}
                >
                  <Home className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span>My Drive</span>
                </button>

                {loading['root'] && (
                  <div className="py-2 text-xs text-slate-400 pl-10">Loading…</div>
                )}
                {rootFolders.map((node) => renderNode(node, 0))}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onConfirm(selected)}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Moving…' : 'Move here'}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
