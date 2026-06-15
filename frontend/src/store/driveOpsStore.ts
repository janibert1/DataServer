import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DriveOpsJob {
  id: string;
  type: 'zip-to-drive' | 'extract' | 'trash-folder' | 'restore-folder';
  label: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress: { percent: number; message: string } | null;
  result?: any;
  error?: string;
  addedAt: number;
}

interface DriveOpsState {
  jobs: DriveOpsJob[];
  isVisible: boolean;
  addJob: (job: Pick<DriveOpsJob, 'id' | 'type' | 'label'>) => void;
  updateJob: (id: string, updates: Partial<DriveOpsJob>) => void;
  removeJob: (id: string) => void;
  clearDone: () => void;
  cancelJob: (id: string) => void;
  setVisible: (v: boolean) => void;
}

export const useDriveOpsStore = create<DriveOpsState>()(
  persist(
    (set) => ({
      jobs: [],
      isVisible: true,
      addJob: (job) =>
        set((s) => ({
          jobs: [...s.jobs, { ...job, status: 'waiting', progress: null, addedAt: Date.now() }],
          isVisible: true,
        })),
      updateJob: (id, updates) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)) })),
      removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      cancelJob: (id) =>
        set((s) => ({ jobs: s.jobs.map((j) => j.id === id ? { ...j, status: 'failed', error: 'Cancelled' } : j) })),
      clearDone: () =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed') })),
      setVisible: (v) => set({ isVisible: v }),
    }),
    {
      name: 'drive-ops-store',
      partialize: (s) => ({ jobs: s.jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed') }),
    }
  )
);
