import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  createSyncedCookieStorage,
  migrateLocalStorageToCookie,
  clearAllAuthStorage,
} from '../lib/cookieStorage'
import { analytics } from '../services/analytics'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const AUTH_COOKIE_NAME = 'aos-auth'
const AUTH_LOCAL_STORAGE_KEY = 'auth-storage'
const AUTH_COOKIE_EXPIRATION_DAYS = 7 // refreshToken 수명과 동기화

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'manager' | 'admin'

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  oauth_provider: 'google' | 'github' | 'email'
  is_admin: boolean
  role: UserRole
  is_org_admin?: boolean
  admin_org_ids?: string[]
}

interface AuthState {
  // State
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null // Unix timestamp
  isLoading: boolean
  error: string | null
  _hasHydrated: boolean

  // Actions
  setTokens: (accessToken: string, refreshToken: string, expiresIn: number) => void
  setUser: (user: User) => void
  logout: () => void
  refreshAccessToken: () => Promise<boolean>
  fetchCurrentUser: () => Promise<void>
  setHasHydrated: (value: boolean) => void

  // Computed
  isAuthenticated: () => boolean
  isTokenExpired: () => boolean
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

/** 인증 상태 관리 스토어 (OAuth, 토큰 갱신, 세션 유지). */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isLoading: false,
      error: null,
      _hasHydrated: false,

      // Set tokens after OAuth callback
      setTokens: (accessToken, refreshToken, expiresIn) => {
        const expiresAt = Date.now() + expiresIn * 1000
        set({
          accessToken,
          refreshToken,
          expiresAt,
          error: null,
        })
      },

      // Set user info
      setUser: (user) => {
        set({ user, error: null })
        analytics.identify(user.id, {
          email: user.email,
          name: user.name,
          role: user.role,
          is_admin: user.is_admin,
        })
        analytics.track('user_logged_in', { provider: user.oauth_provider })
      },

      // Logout
      logout: () => {
        analytics.track('user_logged_out')
        analytics.reset()
        // 상태 초기화
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          error: null,
        })
        // 쿠키와 localStorage 모두 명시적으로 삭제
        clearAllAuthStorage(AUTH_LOCAL_STORAGE_KEY, AUTH_COOKIE_NAME)
      },

      // Refresh access token
      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) {
          get().logout()
          return false
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          })

          if (!response.ok) {
            // Refresh token is invalid or expired
            get().logout()
            return false
          }

          const data = await response.json()
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
            error: null,
          })
          return true
        } catch (error) {
          console.error('Failed to refresh token:', error)
          get().logout()
          return false
        }
      },

      // Fetch current user info
      fetchCurrentUser: async () => {
        const { accessToken, isTokenExpired, refreshAccessToken } = get()

        if (!accessToken) {
          return
        }

        // Check if token is expired and refresh if needed
        if (isTokenExpired()) {
          const refreshed = await refreshAccessToken()
          if (!refreshed) {
            return
          }
        }

        set({ isLoading: true, error: null })

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${get().accessToken}`,
            },
          })

          if (!response.ok) {
            if (response.status === 401) {
              // Try to refresh token
              const refreshed = await refreshAccessToken()
              if (refreshed) {
                // Retry with new token
                return get().fetchCurrentUser()
              }
            }
            throw new Error('Failed to fetch user info')
          }

          const user = await response.json()
          set({ user, isLoading: false })
        } catch (error) {
          console.error('Failed to fetch user:', error)
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch user',
            isLoading: false,
          })
        }
      },

      // Hydration callback
      setHasHydrated: (value) => {
        set({ _hasHydrated: value })
      },

      // Computed: check if authenticated
      isAuthenticated: () => {
        const { accessToken, refreshToken } = get()
        return !!(accessToken || refreshToken)
      },

      // Computed: check if access token is expired
      isTokenExpired: () => {
        const { expiresAt } = get()
        if (!expiresAt) return true
        // Consider expired 30 seconds before actual expiry for safety
        return Date.now() > expiresAt - 30000
      },
    }),
    {
      name: AUTH_LOCAL_STORAGE_KEY,
      // 쿠키 스토리지 사용 (localStorage 대신)
      storage: createJSONStorage(() =>
        createSyncedCookieStorage(AUTH_COOKIE_NAME, AUTH_COOKIE_EXPIRATION_DAYS)
      ),
      // Only persist auth-related data
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        // 앱 시작 시 localStorage → 쿠키 마이그레이션 시도
        migrateLocalStorageToCookie(
          AUTH_LOCAL_STORAGE_KEY,
          AUTH_COOKIE_NAME,
          AUTH_COOKIE_EXPIRATION_DAYS
        )
        state?.setHasHydrated(true)
      },
    }
  )
)

// ─────────────────────────────────────────────────────────────
// Auth Fetch Wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Fetch wrapper that automatically adds Authorization header and handles token refresh.
 * Use this for all authenticated API calls.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const state = useAuthStore.getState()

  // Check if we need to refresh the token
  if (state.isTokenExpired() && state.refreshToken) {
    const refreshed = await state.refreshAccessToken()
    if (!refreshed) {
      throw new Error('Session expired. Please login again.')
    }
  }

  const { accessToken } = useAuthStore.getState()

  // Add authorization header if we have a token
  const headers = new Headers(options.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle 401 by trying to refresh token once
  if (response.status === 401 && state.refreshToken) {
    const refreshed = await state.refreshAccessToken()
    if (refreshed) {
      // Retry with new token
      const newHeaders = new Headers(options.headers)
      newHeaders.set('Authorization', `Bearer ${useAuthStore.getState().accessToken}`)
      return fetch(url, { ...options, headers: newHeaders })
    }
    // Refresh failed, logout
    state.logout()
  }

  return response
}

// ─────────────────────────────────────────────────────────────
// OAuth Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get Google OAuth redirect URL
 */
export function getGoogleAuthUrl(): string {
  return `${API_BASE_URL}/api/auth/google`
}

/**
 * Get GitHub OAuth redirect URL
 */
export function getGitHubAuthUrl(): string {
  return `${API_BASE_URL}/api/auth/github`
}

/**
 * Exchange OAuth code for tokens
 */
export async function exchangeOAuthCode(
  provider: 'google' | 'github',
  code: string,
  redirectUri: string
): Promise<{ user: User; accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/${provider}/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to authenticate')
  }

  const data = await response.json()
  return {
    user: data.user,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

// ─────────────────────────────────────────────────────────────
// Email/Password Authentication
// ─────────────────────────────────────────────────────────────

/**
 * Register a new user with email/password
 */
export async function registerWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ user: User; accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '회원가입에 실패했습니다')
  }

  const data = await response.json()
  return {
    user: data.user,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Login with email/password
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ user: User; accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '로그인에 실패했습니다')
  }

  const data = await response.json()
  return {
    user: data.user,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}
