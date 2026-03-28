import { create } from 'zustand';
import type { UploadItem, DriveFile } from '@/lib/types';

interface UploadState {
  uploads: UploadItem[];
  isVisible: boolean;
  addUpload: (fileName: string, fileSize: number) => string;
  updateUpload: (id: string, update: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  setVisible: (visible: boolean) => void;
}

let nextId = 0;

export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  isVisible: false,

  addUpload: (fileName, fileSize) => {
    const id = `upload-${++nextId}`;
    set((state) => ({
      uploads: [
        ...state.uploads,
        { id, fileName, fileSize, progress: 0, status: 'pending' },
      ],
      isVisible: true,
    }));
    return id;
  },

  updateUpload: (id, update) =>
    set((state) => ({
      uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...update } : u)),
    })),

  removeUpload: (id) =>
    set((state) => ({
      uploads: state.uploads.filter((u) => u.id !== id),
    })),

  clearCompleted: () =>
    set((state) => ({
      uploads: state.uploads.filter((u) => u.status !== 'complete' && u.status !== 'error'),
    })),

  setVisible: (isVisible) => set({ isVisible }),
}));
