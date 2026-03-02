/* eslint-disable @typescript-eslint/no-explicit-any */
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

    it('keeps defaults on fetch failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Fetch failed'))

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(state.visibility).toEqual({})
      expect(state.isLoaded).toBe(false)
    })

    it('keeps defaults on network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().visibility).toEqual({})
      expect(useMenuVisibilityStore.getState().isLoaded).toBe(false)
    })

    it('handles missing menu_order in response', async () => {
      mockApiClient.get.mockResolvedValueOnce({ visibility: { nav: { home: true } } })

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().menuOrder).toEqual([])
    })
  })
})
