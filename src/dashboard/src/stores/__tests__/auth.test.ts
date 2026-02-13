import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore, getGoogleAuthUrl, getGitHubAuthUrl } from '../auth'

// Mock cookieStorage module
vi.mock('../../lib/cookieStorage', () => ({
  createSyncedCookieStorage: () => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }),
  migrateLocalStorageToCookie: () => false,
  clearAllAuthStorage: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    isLoading: false,
    error: null,
    _hasHydrated: false,
  })
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null,
  oauth_provider: 'email' as const,
  is_admin: false,
  role: 'user' as const,
}

describe('auth store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has no user', () => {
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('has no tokens', () => {
      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.refreshToken).toBeNull()
    })

    it('is not loading', () => {
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('has no error', () => {
      expect(useAuthStore.getState().error).toBeNull()
    })
  })

  // ── setTokens ──────────────────────────────────────────

  describe('setTokens', () => {
    it('stores tokens and calculates expiry', () => {
      const before = Date.now()
      useAuthStore.getState().setTokens('access-123', 'refresh-456', 3600)

      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('access-123')
      expect(state.refreshToken).toBe('refresh-456')
      expect(state.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
      expect(state.error).toBeNull()
    })
  })

  // ── setUser ────────────────────────────────────────────

  describe('setUser', () => {
    it('stores user and clears error', () => {
      useAuthStore.setState({ error: 'old error' })
      useAuthStore.getState().setUser(mockUser)

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.error).toBeNull()
    })
  })

  // ── logout ─────────────────────────────────────────────

  describe('logout', () => {
    it('clears all auth state', () => {
      useAuthStore.setState({
        user: mockUser,
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 100000,
      })

      useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.accessToken).toBeNull()
      expect(state.refreshToken).toBeNull()
      expect(state.expiresAt).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  // ── isAuthenticated ────────────────────────────────────

  describe('isAuthenticated', () => {
    it('returns false with no tokens', () => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    })

    it('returns true with accessToken', () => {
      useAuthStore.setState({ accessToken: 'token' })
      expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    })

    it('returns true with refreshToken only', () => {
      useAuthStore.setState({ refreshToken: 'refresh' })
      expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    })
  })

  // ── isTokenExpired ─────────────────────────────────────

  describe('isTokenExpired', () => {
    it('returns true when no expiresAt', () => {
      expect(useAuthStore.getState().isTokenExpired()).toBe(true)
    })

    it('returns true when token is expired', () => {
      useAuthStore.setState({ expiresAt: Date.now() - 60000 })
      expect(useAuthStore.getState().isTokenExpired()).toBe(true)
    })

    it('returns true within 30s safety margin', () => {
      useAuthStore.setState({ expiresAt: Date.now() + 15000 }) // 15s left
      expect(useAuthStore.getState().isTokenExpired()).toBe(true)
    })

    it('returns false when token is valid', () => {
      useAuthStore.setState({ expiresAt: Date.now() + 600000 }) // 10 min left
      expect(useAuthStore.getState().isTokenExpired()).toBe(false)
    })
  })

  // ── refreshAccessToken ─────────────────────────────────

  describe('refreshAccessToken', () => {
    it('returns false and logs out when no refresh token', async () => {
      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
    })

    it('refreshes token successfully', async () => {
      useAuthStore.setState({ refreshToken: 'old-refresh' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      })

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(true)
      expect(useAuthStore.getState().accessToken).toBe('new-access')
      expect(useAuthStore.getState().refreshToken).toBe('new-refresh')
    })

    it('logs out on refresh failure', async () => {
      useAuthStore.setState({
        refreshToken: 'expired-refresh',
        accessToken: 'old-access',
      })
      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
    })

    it('logs out on network error', async () => {
      useAuthStore.setState({ refreshToken: 'refresh' })
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(false)
    })
  })

  // ── fetchCurrentUser ───────────────────────────────────

  describe('fetchCurrentUser', () => {
    it('does nothing without accessToken', async () => {
      await useAuthStore.getState().fetchCurrentUser()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('fetches user successfully', async () => {
      useAuthStore.setState({
        accessToken: 'valid-token',
        expiresAt: Date.now() + 600000,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      })

      await useAuthStore.getState().fetchCurrentUser()

      expect(useAuthStore.getState().user).toEqual(mockUser)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('sets error on fetch failure', async () => {
      useAuthStore.setState({
        accessToken: 'valid-token',
        expiresAt: Date.now() + 600000,
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await useAuthStore.getState().fetchCurrentUser()

      expect(useAuthStore.getState().error).toBeTruthy()
    })
  })

  // ── setHasHydrated ─────────────────────────────────────

  describe('setHasHydrated', () => {
    it('sets hydration flag', () => {
      useAuthStore.getState().setHasHydrated(true)
      expect(useAuthStore.getState()._hasHydrated).toBe(true)
    })
  })
})

// ── OAuth Helpers ────────────────────────────────────────

describe('OAuth helpers', () => {
  it('getGoogleAuthUrl returns correct URL', () => {
    expect(getGoogleAuthUrl()).toContain('/api/auth/google')
  })

  it('getGitHubAuthUrl returns correct URL', () => {
    expect(getGitHubAuthUrl()).toContain('/api/auth/github')
  })
})
