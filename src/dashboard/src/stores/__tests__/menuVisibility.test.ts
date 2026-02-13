import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock authFetch before importing the store
vi.mock('../auth', () => ({
  authFetch: vi.fn(),
}))

import { useMenuVisibilityStore } from '../menuVisibility'
import { authFetch } from '../auth'

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
    vi.mocked(authFetch).mockReset()
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
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(state.visibility).toEqual(data.visibility)
      expect(state.menuOrder).toEqual(['dashboard', 'admin'])
      expect(state.isLoaded).toBe(true)
    })

    it('skips fetch if already loaded', async () => {
      useMenuVisibilityStore.setState({ isLoaded: true })

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(authFetch).not.toHaveBeenCalled()
    })

    it('keeps defaults on fetch failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
      } as Response)

      await useMenuVisibilityStore.getState().fetchVisibility()

      const state = useMenuVisibilityStore.getState()
      expect(state.visibility).toEqual({})
      expect(state.isLoaded).toBe(false)
    })

    it('keeps defaults on network error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network error'))

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().visibility).toEqual({})
      expect(useMenuVisibilityStore.getState().isLoaded).toBe(false)
    })

    it('handles missing menu_order in response', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ visibility: { nav: { home: true } } }),
      } as Response)

      await useMenuVisibilityStore.getState().fetchVisibility()

      expect(useMenuVisibilityStore.getState().menuOrder).toEqual([])
    })
  })
})
