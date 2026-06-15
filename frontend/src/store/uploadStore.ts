import { create } from 'zustand';
import { UploadItem, ChunkedUploadState } from '../types';

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STORAGE_KEY = 'ds_pending_uploads';

function savePendingUploads(items: UploadItem[]) {
  const pending = items
    .filter((u) => u.status === 'paused' && u.chunked)
    .map((u) => ({ id: u.id, name: u.chunked!.name, size: u.chunked!.size, mimeType: u.chunked!.mimeType, chunked: u.chunked }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch { /* quota exceeded — ignore */ }
}

export function loadPendingUploads(): { id: string; name: string; size: number; mimeType: string; chunked: ChunkedUploadState }[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

export function clearPendingUpload(fileId: string) {
  const items = loadPendingUploads().filter((u) => u.chunked.fileId !== fileId);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

interface UploadState {
  uploads: UploadItem[];
  isVisible: boolean;
  addUpload: (file: File) => string;
  updateUpload: (id: string, updates: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  setVisible: (visible: boolean) => void;
  restoreFromStorage: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  uploads: [],
  isVisible: false,

  addUpload: (file) => {
    const id = generateId();
    set((state) => ({
      uploads: [...state.uploads, { id, file, progress: 0, status: 'pending' }],
      isVisible: true,
    }));
    return id;
  },

  updateUpload: (id, updates) => {
    set((state) => {
      const uploads = state.uploads.map((u) => (u.id === id ? { ...u, ...updates } : u));
      savePendingUploads(uploads);
      return { uploads };
    });
  },

  removeUpload: (id) => {
    set((state) => {
      const uploads = state.uploads.filter((u) => u.id !== id);
      savePendingUploads(uploads);
      return { uploads };
    });
  },

  clearCompleted: () => {
    set((state) => {
      const uploads = state.uploads.filter((u) => u.status !== 'complete' && u.status !== 'error');
      savePendingUploads(uploads);
      return { uploads };
    });
  },

  setVisible: (isVisible) => set({ isVisible }),

  restoreFromStorage: () => {
    const pending = loadPendingUploads();
    if (pending.length === 0) return;
    set((state) => {
      const existingFileIds = new Set(
        state.uploads.filter((u) => u.chunked).map((u) => u.chunked!.fileId),
      );
      const toRestore = pending.filter((p) => !existingFileIds.has(p.chunked.fileId));
      if (toRestore.length === 0) return state;
      const restoredItems: UploadItem[] = toRestore.map((p) => ({
        id: p.id,
        file: null,
        progress: p.chunked.totalChunks > 0
          ? Math.round((p.chunked.completedParts.length / p.chunked.totalChunks) * 95)
          : 0,
        status: 'paused' as const,
        chunked: p.chunked,
      }));
      return { uploads: [...state.uploads, ...restoredItems], isVisible: true };
    });
  },
}));
