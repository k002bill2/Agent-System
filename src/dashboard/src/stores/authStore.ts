/**
 * Auth Store (슬라이스 패턴)
 *
 * 인증 관련 상태를 관리하는 도메인 스토어.
 * 기존 auth.ts에서 분리된 슬라이스 래퍼.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'manager' | 'admin'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  oauth_provider: 'google' | 'github' | 'email'
  is_admin: boolean
  role: UserRole
}

interface AuthState {
  // State
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  setUser: (user: AuthUser | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
  reset: () => void
}

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      logout: () => set({ ...initialState }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

export const selectIsAdmin = (state: AuthState): boolean =>
  state.user?.is_admin ?? false

export const selectUserRole = (state: AuthState): UserRole =>
  state.user?.role ?? 'user'

export const selectDisplayName = (state: AuthState): string =>
  state.user?.name ?? state.user?.email ?? ''

export const selectHasError = (state: AuthState): boolean => state.error !== null
