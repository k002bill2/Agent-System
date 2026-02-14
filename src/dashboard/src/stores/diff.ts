/**
 * Diff Store - Manages file changes for the diff viewer
 */

import { create } from 'zustand';

export type DiffStatus = 'pending' | 'applied' | 'rejected';

export interface DiffEntry {
  id: string;
  taskId: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  status: DiffStatus;
  createdAt: string;
  appliedAt?: string;
}

interface DiffState {
  // State
  entries: DiffEntry[];
  selectedEntryId: string | null;
  viewMode: 'split' | 'unified';

  // Actions
  addEntry: (entry: Omit<DiffEntry, 'id' | 'createdAt'>) => void;
  removeEntry: (id: string) => void;
  clearEntries: () => void;
  updateEntryStatus: (id: string, status: DiffStatus) => void;
  selectEntry: (id: string | null) => void;
  setViewMode: (mode: 'split' | 'unified') => void;

  // Computed
  getEntryById: (id: string) => DiffEntry | undefined;
  getEntriesByTaskId: (taskId: string) => DiffEntry[];
  getPendingEntries: () => DiffEntry[];
}

/** 파일 변경 사항(Diff) 관리 스토어. */
export const useDiffStore = create<DiffState>((set, get) => ({
  // Initial state
  entries: [],
  selectedEntryId: null,
  viewMode: 'split',

  // Actions
  addEntry: (entry) => {
    const newEntry: DiffEntry = {
      ...entry,
      id: `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
    }));
  },

  removeEntry: (id) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      selectedEntryId: state.selectedEntryId === id ? null : state.selectedEntryId,
    }));
  },

  clearEntries: () => {
    set({
      entries: [],
      selectedEntryId: null,
    });
  },

  updateEntryStatus: (id, status) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? {
              ...e,
              status,
              appliedAt: status === 'applied' ? new Date().toISOString() : e.appliedAt,
            }
          : e
      ),
    }));
  },

  selectEntry: (id) => {
    set({ selectedEntryId: id });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  // Computed
  getEntryById: (id) => {
    return get().entries.find((e) => e.id === id);
  },

  getEntriesByTaskId: (taskId) => {
    return get().entries.filter((e) => e.taskId === taskId);
  },

  getPendingEntries: () => {
    return get().entries.filter((e) => e.status === 'pending');
  },
}));

/**
 * Helper to process file_changed WebSocket events
 */
export function processFileChangedEvent(
  taskId: string,
  filePath: string,
  oldContent: string,
  newContent: string
) {
  const { addEntry } = useDiffStore.getState();

  addEntry({
    taskId,
    filePath,
    oldContent,
    newContent,
    status: 'pending',
  });
}
