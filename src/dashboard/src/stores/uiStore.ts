/**
 * UI Store (슬라이스 패턴)
 *
 * UI 상태(모달, 토스트, 사이드바, 테마 등)를 관리하는 도메인 스토어.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  description?: string
  duration?: number
}

export interface ModalConfig {
  id: string
  isOpen: boolean
  data?: unknown
}

interface UIState {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void

  // Sidebar
  isSidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Modals
  modals: Record<string, ModalConfig>
  openModal: (id: string, data?: unknown) => void
  closeModal: (id: string) => void
  isModalOpen: (id: string) => boolean
  getModalData: (id: string) => unknown | undefined

  // Toasts
  toasts: ToastMessage[]
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void

  // Loading Overlay
  isGlobalLoading: boolean
  globalLoadingMessage: string | null
  setGlobalLoading: (isLoading: boolean, message?: string) => void

  // Reset
  reset: () => void
}

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────

const initialState = {
  theme: 'system' as Theme,
  isSidebarOpen: true,
  modals: {},
  toasts: [],
  isGlobalLoading: false,
  globalLoadingMessage: null,
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

let toastCounter = 0

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Theme
      setTheme: (theme) => set({ theme }),

      // Sidebar
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),

      // Modals
      openModal: (id, data) =>
        set((state) => ({
          modals: {
            ...state.modals,
            [id]: { id, isOpen: true, data },
          },
        })),

      closeModal: (id) =>
        set((state) => ({
          modals: {
            ...state.modals,
            [id]: { ...state.modals[id], id, isOpen: false },
          },
        })),

      isModalOpen: (id) => get().modals[id]?.isOpen ?? false,

      getModalData: (id) => get().modals[id]?.data,

      // Toasts
      addToast: (toast) => {
        const id = `toast-${++toastCounter}-${Date.now()}`
        const newToast: ToastMessage = { ...toast, id }

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }))

        // Auto-remove after duration
        const duration = toast.duration ?? 5000
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }))
          }, duration)
        }
      },

      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      clearToasts: () => set({ toasts: [] }),

      // Loading Overlay
      setGlobalLoading: (isLoading, message) =>
        set({
          isGlobalLoading: isLoading,
          globalLoadingMessage: message ?? null,
        }),

      // Reset
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        isSidebarOpen: state.isSidebarOpen,
      }),
    }
  )
)

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

export const selectTheme = (state: UIState): Theme => state.theme

export const selectActiveToasts = (state: UIState): ToastMessage[] => state.toasts

export const selectHasToasts = (state: UIState): boolean => state.toasts.length > 0

export const selectIsGlobalLoading = (state: UIState): boolean => state.isGlobalLoading
