/**
 * Task Store (슬라이스 패턴)
 *
 * 태스크 관련 상태를 관리하는 도메인 스토어.
 * 기존 orchestration.ts에서 태스크 관련 로직을 분리한 슬라이스.
 */

import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'paused'

export interface TaskItem {
  id: string
  title: string
  description: string
  status: TaskStatus
  parentId: string | null
  children: string[]
  result?: unknown
  error?: string
  isDeleted?: boolean
  createdAt?: string
  updatedAt?: string
  retryCount?: number
}

interface TaskStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  failed: number
  cancelled: number
}

interface TaskState {
  // State
  tasks: Record<string, TaskItem>
  selectedTaskId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  setTasks: (tasks: Record<string, TaskItem>) => void
  addTask: (task: TaskItem) => void
  updateTask: (id: string, updates: Partial<TaskItem>) => void
  removeTask: (id: string) => void
  selectTask: (id: string | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void

  // Computed
  getStats: () => TaskStats
  getActiveTasks: () => TaskItem[]
}

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────

const initialState = {
  tasks: {},
  selectedTaskId: null,
  isLoading: false,
  error: null,
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useTaskStore = create<TaskState>()((set, get) => ({
  ...initialState,

  setTasks: (tasks) => set({ tasks, error: null }),

  addTask: (task) =>
    set((state) => ({
      tasks: { ...state.tasks, [task.id]: task },
    })),

  updateTask: (id, updates) =>
    set((state) => {
      const existing = state.tasks[id]
      if (!existing) return state
      return {
        tasks: {
          ...state.tasks,
          [id]: { ...existing, ...updates, updatedAt: new Date().toISOString() },
        },
      }
    }),

  removeTask: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.tasks
      return {
        tasks: rest,
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }
    }),

  selectTask: (id) => set({ selectedTaskId: id }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () => set({ ...initialState }),

  getStats: () => {
    const tasks = Object.values(get().tasks).filter((t) => !t.isDeleted)
    return tasks.reduce(
      (acc, task) => {
        acc.total++
        switch (task.status) {
          case 'pending':
            acc.pending++
            break
          case 'in_progress':
            acc.inProgress++
            break
          case 'completed':
            acc.completed++
            break
          case 'failed':
            acc.failed++
            break
          case 'cancelled':
            acc.cancelled++
            break
        }
        return acc
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0 }
    )
  },

  getActiveTasks: () => Object.values(get().tasks).filter((t) => !t.isDeleted),
}))

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

export const selectTaskById = (state: TaskState, id: string): TaskItem | undefined =>
  state.tasks[id]

export const selectTasksByStatus = (state: TaskState, status: TaskStatus): TaskItem[] =>
  Object.values(state.tasks).filter((t) => t.status === status && !t.isDeleted)

export const selectRootTasks = (state: TaskState): TaskItem[] =>
  Object.values(state.tasks).filter((t) => t.parentId === null && !t.isDeleted)
