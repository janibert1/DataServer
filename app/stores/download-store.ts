import { create } from 'zustand';

export interface DownloadItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

interface DownloadState {
  downloads: DownloadItem[];
  isVisible: boolean;
  addDownload: (fileName: string, fileSize?: number) => string;
  updateDownload: (id: string, update: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;
  setVisible: (visible: boolean) => void;
}

let nextId = 0;

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: [],
  isVisible: false,

  addDownload: (fileName, fileSize = 0) => {
    const id = `download-${++nextId}`;
    set((state) => ({
      downloads: [
        ...state.downloads,
        { id, fileName, fileSize, progress: 0, status: 'pending' },
      ],
      isVisible: true,
    }));
    return id;
  },

  updateDownload: (id, update) =>
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, ...update } : d)),
    })),

  removeDownload: (id) =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    })),

  clearCompleted: () =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.status !== 'complete' && d.status !== 'error'),
    })),

  setVisible: (isVisible) => set({ isVisible }),
}));
