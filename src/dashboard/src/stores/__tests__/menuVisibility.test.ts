import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const authState = {
  isAuthenticated: () => true,
  isTokenExpired: () => false,
}

vi.mock('../auth', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}))

import { useMenuVisibilityStore } from '../menuVisibility'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

function resetStore() {
  useMenuVisibilityStore.setState({
    visibility: {},
    menuOrder: [],
    isLoaded: false,
  })
}

describe('menuVisibility store', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    // 각 테스트마다 인증 상태 초기화 (비인증 테스트가 흐름을 오염시키지 않도록)
    authState.isAuthenticated = () => true
    authState.isTokenExpired = () => false
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty visibility', () => {
      expect(useMenuVisibilityStore.getState().visibility).toEqual({})
    })

    it('has empty menuOrder', () => {
      expect(useMenuVisibilityStore.getState().menuOrder).toEqual([])
    })

    it('is not loaded', () => {
      expect(useMenuVisibilityStore.getState().isLoaded).toBe(false)
    })
  })

  // ── fetchVisibility ────────────────────────────────────

  describe('fetchVisibility', () => {
    it('fetches and stores visibility data', async () => {
      const data = {
        visibility: { admin: { users: true, settings: false } },
        menu_order: ['dashboard', 'admin'],
      }
      mockApiClient.get.mockResolvedValueOnce(data)

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(state.visibility).toEqual(data.visibility)
      expect(state.menuOrder).toEqual(['dashboard', 'admin'])
      expect(state.isLoaded).toBe(true)
    })

    it('skips fetch if already loaded', async () => {
      useMenuVisibilityStore.setState({ isLoaded: true })

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('marks loaded as true on fetch failure to avoid permanent skeleton', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Fetch failed'))

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(state.visibility).toEqual({})
      expect(state.isLoaded).toBe(true)
    })

    it('marks loaded as true on network error to avoid permanent skeleton', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().visibility).toEqual({})
      expect(useMenuVisibilityStore.getState().isLoaded).toBe(true)
    })

    it('handles missing menu_order in response', async () => {
      mockApiClient.get.mockResolvedValueOnce({ visibility: { nav: { home: true } } })

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().menuOrder).toEqual([])
    })

    it('marks loaded as true when unauthenticated (no API call)', async () => {
      authState.isAuthenticated = () => false

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(mockApiClient.get).not.toHaveBeenCalled()
      expect(state.isLoaded).toBe(true)
    })

    it('marks loaded as true when token expired (no API call)', async () => {
      authState.isTokenExpired = () => true

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(mockApiClient.get).not.toHaveBeenCalled()
      expect(state.isLoaded).toBe(true)
    })
  })
})
