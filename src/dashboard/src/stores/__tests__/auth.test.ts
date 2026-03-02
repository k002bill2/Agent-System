import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useAuthStore,
  getGoogleAuthUrl,
  getGitHubAuthUrl,
  authFetch,
  exchangeOAuthCode,
  registerWithEmail,
  loginWithEmail,
} from '../auth'

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

// ── fetchCurrentUser – additional branches ───────────────

describe('fetchCurrentUser – additional branches', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  it('refreshes expired token before fetching user', async () => {
    // Token present but expired
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 60000, // already past
    })

    // First call: refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
    })
    // Second call: /api/auth/me succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    })

    await useAuthStore.getState().fetchCurrentUser()

    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().accessToken).toBe('new-access')
  })

  it('returns early when token is expired and refresh fails', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 60000,
    })

    // Refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false })

    await useAuthStore.getState().fetchCurrentUser()

    // Should have logged out and not set a user
    expect(useAuthStore.getState().user).toBeNull()
    // Only one fetch call (the refresh attempt)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries fetchCurrentUser after 401 when refresh succeeds', async () => {
    useAuthStore.setState({
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() + 600000,
    })

    // First /api/auth/me → 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
        }),
    })
    // Retry /api/auth/me → 200
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    })

    await useAuthStore.getState().fetchCurrentUser()

    expect(useAuthStore.getState().user).toEqual(mockUser)
  })

  it('throws and sets error after 401 when refresh also fails', async () => {
    useAuthStore.setState({
      accessToken: 'valid-token',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() + 600000,
    })

    // First /api/auth/me → 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false })

    await useAuthStore.getState().fetchCurrentUser()

    expect(useAuthStore.getState().error).toBeTruthy()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('sets generic error message when non-Error value is thrown', async () => {
    useAuthStore.setState({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 600000,
    })

    // Simulate a non-Error rejection (e.g. a plain string)
    mockFetch.mockRejectedValueOnce('plain string error')

    await useAuthStore.getState().fetchCurrentUser()

    expect(useAuthStore.getState().error).toBe('Failed to fetch user')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})

// ── authFetch ─────────────────────────────────────────────

describe('authFetch', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  it('adds Authorization header when accessToken exists', async () => {
    useAuthStore.setState({
      accessToken: 'my-token',
      expiresAt: Date.now() + 600000,
    })

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    await authFetch('http://localhost:8000/api/test')

    const [, calledOptions] = mockFetch.mock.calls[0]
    const headers: Headers = calledOptions.headers
    expect(headers.get('Authorization')).toBe('Bearer my-token')
  })

  it('does not add Authorization header when no accessToken', async () => {
    // No token in store
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    await authFetch('http://localhost:8000/api/test')

    const [, calledOptions] = mockFetch.mock.calls[0]
    const headers: Headers = calledOptions.headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('refreshes expired token before fetching', async () => {
    useAuthStore.setState({
      accessToken: 'old-token',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 60000, // expired
    })

    // Refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
    })
    // Actual request
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    await authFetch('http://localhost:8000/api/protected')

    // Second fetch should use the refreshed token
    const [, actualOptions] = mockFetch.mock.calls[1]
    const headers: Headers = actualOptions.headers
    expect(headers.get('Authorization')).toBe('Bearer new-token')
  })

  it('throws when token is expired and refresh fails', async () => {
    useAuthStore.setState({
      accessToken: 'old-token',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 60000,
    })

    // Refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false })

    await expect(authFetch('http://localhost:8000/api/protected')).rejects.toThrow(
      'Session expired. Please login again.'
    )
  })

  it('passes through method and body options', async () => {
    useAuthStore.setState({
      accessToken: 'token',
      expiresAt: Date.now() + 600000,
    })

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    await authFetch('http://localhost:8000/api/resource', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    })

    const [url, calledOptions] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/resource')
    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.body).toBe(JSON.stringify({ key: 'value' }))
  })

  it('retries on 401 with refreshed token when refresh succeeds', async () => {
    useAuthStore.setState({
      accessToken: 'initial-token',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() + 600000,
    })

    // First request → 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'retried-token',
          refresh_token: 'retried-refresh',
          expires_in: 3600,
        }),
    })
    // Retry request → 200
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const response = await authFetch('http://localhost:8000/api/protected')

    expect(response.status).toBe(200)
    // Third fetch (index 2) should carry the new token
    const [, retryOptions] = mockFetch.mock.calls[2]
    const headers: Headers = retryOptions.headers
    expect(headers.get('Authorization')).toBe('Bearer retried-token')
  })

  it('calls logout and returns 401 response when refresh fails after 401', async () => {
    useAuthStore.setState({
      accessToken: 'initial-token',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() + 600000,
      user: mockUser,
    })

    // First request → 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false })

    const response = await authFetch('http://localhost:8000/api/protected')

    // Should return the original 401 response
    expect(response.status).toBe(401)
    // Store should have been logged out
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})

// ── exchangeOAuthCode ──────────────────────────────────────

describe('exchangeOAuthCode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns user and tokens on successful exchange', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: mockUser,
          access_token: 'access-abc',
          refresh_token: 'refresh-abc',
          expires_in: 3600,
        }),
    })

    const result = await exchangeOAuthCode('google', 'auth-code', 'http://localhost:5173/callback')

    expect(result.user).toEqual(mockUser)
    expect(result.accessToken).toBe('access-abc')
    expect(result.refreshToken).toBe('refresh-abc')
    expect(result.expiresIn).toBe(3600)
  })

  it('throws with detail message on error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Invalid OAuth code' }),
    })

    await expect(
      exchangeOAuthCode('github', 'bad-code', 'http://localhost:5173/callback')
    ).rejects.toThrow('Invalid OAuth code')
  })

  it('throws with fallback message when error has no detail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    })

    await expect(
      exchangeOAuthCode('google', 'bad-code', 'http://localhost:5173/callback')
    ).rejects.toThrow('Failed to authenticate')
  })
})

// ── registerWithEmail ──────────────────────────────────────

describe('registerWithEmail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns user and tokens on successful registration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: mockUser,
          access_token: 'access-reg',
          refresh_token: 'refresh-reg',
          expires_in: 3600,
        }),
    })

    const result = await registerWithEmail('test@example.com', 'password123', 'Test User')

    expect(result.user).toEqual(mockUser)
    expect(result.accessToken).toBe('access-reg')
    expect(result.refreshToken).toBe('refresh-reg')
    expect(result.expiresIn).toBe(3600)
  })

  it('throws with detail message on error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Email already registered' }),
    })

    await expect(
      registerWithEmail('existing@example.com', 'password123')
    ).rejects.toThrow('Email already registered')
  })

  it('throws Korean fallback message when error has no detail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    })

    await expect(
      registerWithEmail('test@example.com', 'password123')
    ).rejects.toThrow('회원가입에 실패했습니다')
  })
})

// ── loginWithEmail ─────────────────────────────────────────

describe('loginWithEmail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns user and tokens on successful login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: mockUser,
          access_token: 'access-login',
          refresh_token: 'refresh-login',
          expires_in: 7200,
        }),
    })

    const result = await loginWithEmail('test@example.com', 'password123')

    expect(result.user).toEqual(mockUser)
    expect(result.accessToken).toBe('access-login')
    expect(result.refreshToken).toBe('refresh-login')
    expect(result.expiresIn).toBe(7200)
  })

  it('throws with detail message on error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Invalid credentials' }),
    })

    await expect(
      loginWithEmail('test@example.com', 'wrong-password')
    ).rejects.toThrow('Invalid credentials')
  })

  it('throws Korean fallback message when error has no detail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    })

    await expect(
      loginWithEmail('test@example.com', 'password123')
    ).rejects.toThrow('로그인에 실패했습니다')
  })
})
