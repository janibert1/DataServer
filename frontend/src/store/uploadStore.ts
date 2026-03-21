import { create } from 'zustand';
import { UploadItem } from '../types';

// Simple UUID polyfill for frontend
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface UploadState {
  uploads: UploadItem[];
  isVisible: boolean;
  addUpload: (file: File) => string;
  updateUpload: (id: string, updates: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  setVisible: (visible: boolean) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
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
    set((state) => ({
      uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    }));
  },

  removeUpload: (id) => {
    set((state) => ({
      uploads: state.uploads.filter((u) => u.id !== id),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      uploads: state.uploads.filter((u) => u.status !== 'complete' && u.status !== 'error'),
    }));
  },

  setVisible: (isVisible) => set({ isVisible }),
}));
