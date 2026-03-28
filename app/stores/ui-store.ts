import { create } from 'zustand';

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'updatedAt' | 'createdAt' | 'size';
export type SortDirection = 'asc' | 'desc';

interface UIState {
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  setViewMode: (mode: ViewMode) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (dir: SortDirection) => void;
  toggleSortDirection: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: 'grid',
  sortField: 'name',
  sortDirection: 'asc',
  setViewMode: (viewMode) => set({ viewMode }),
  setSortField: (sortField) => set({ sortField }),
  setSortDirection: (sortDirection) => set({ sortDirection }),
  toggleSortDirection: () =>
    set((state) => ({ sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' })),
}));
