/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock authFetch before importing the store
vi.mock('../auth', () => ({
  authFetch: vi.fn(),
}))

import { useProjectAccessStore } from '../projectAccess'
import { authFetch } from '../auth'

function resetStore() {
  useProjectAccessStore.setState({
    members: [],
    myAccess: null,
    loading: false,
    error: null,
  })
}

describe('projectAccess store', () => {
  beforeEach(() => {
    resetStore()
    vi.mocked(authFetch).mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty members', () => {
      expect(useProjectAccessStore.getState().members).toEqual([])
    })

    it('has null myAccess', () => {
      expect(useProjectAccessStore.getState().myAccess).toBeNull()
    })

    it('is not loading', () => {
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })
  })

  // ── clearError ─────────────────────────────────────────

  describe('clearError', () => {
    it('clears error', () => {
      useProjectAccessStore.setState({ error: 'some error' })
      useProjectAccessStore.getState().clearError()
      expect(useProjectAccessStore.getState().error).toBeNull()
    })
  })

  // ── fetchMembers ───────────────────────────────────────

  describe('fetchMembers', () => {
    it('fetches and stores members', async () => {
      const members = [
        { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'owner' },
        { id: 'm-2', project_id: 'p1', user_id: 'u2', role: 'viewer' },
      ]
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(members),
      } as Response)

      await useProjectAccessStore.getState().fetchMembers('p1')

      expect(useProjectAccessStore.getState().members).toEqual(members)
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ detail: 'Access denied' }),
      } as any)

      await useProjectAccessStore.getState().fetchMembers('p1')

      expect(useProjectAccessStore.getState().error).toBe('Access denied')
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })

    it('falls back to statusText when json fails', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
        json: () => Promise.reject(new Error('parse error')),
      } as any)

      await useProjectAccessStore.getState().fetchMembers('p1')

      expect(useProjectAccessStore.getState().error).toBe('Server Error')
    })
  })

  // ── addMember ──────────────────────────────────────────

  describe('addMember', () => {
    it('adds member to list', async () => {
      const newMember = { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'editor' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newMember),
      } as Response)

      await useProjectAccessStore.getState().addMember('p1', 'u1', 'editor')

      expect(useProjectAccessStore.getState().members).toContainEqual(newMember)
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })

    it('sends correct request body', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'm-1' }),
      } as Response)

      await useProjectAccessStore.getState().addMember('p1', 'u1', 'viewer')

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/p1/access'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user_id: 'u1', role: 'viewer' }),
        })
      )
    })

    it('sets error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ detail: 'User not found' }),
      } as any)

      await useProjectAccessStore.getState().addMember('p1', 'u1', 'editor')

      expect(useProjectAccessStore.getState().error).toBe('User not found')
    })
  })

  // ── updateRole ─────────────────────────────────────────

  describe('updateRole', () => {
    it('updates member role in list', async () => {
      useProjectAccessStore.setState({
        members: [
          { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'viewer' } as any,
        ],
      })
      const updated = { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'editor' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updated),
      } as Response)

      await useProjectAccessStore.getState().updateRole('p1', 'u1', 'editor')

      expect(useProjectAccessStore.getState().members[0].role).toBe('editor')
    })

    it('sets error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ detail: 'Cannot change owner role' }),
      } as any)

      await useProjectAccessStore.getState().updateRole('p1', 'u1', 'viewer')

      expect(useProjectAccessStore.getState().error).toBe('Cannot change owner role')
    })
  })

  // ── removeMember ───────────────────────────────────────

  describe('removeMember', () => {
    it('removes member from list', async () => {
      useProjectAccessStore.setState({
        members: [
          { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'editor' } as any,
          { id: 'm-2', project_id: 'p1', user_id: 'u2', role: 'viewer' } as any,
        ],
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      await useProjectAccessStore.getState().removeMember('p1', 'u1')

      const members = useProjectAccessStore.getState().members
      expect(members).toHaveLength(1)
      expect(members[0].user_id).toBe('u2')
    })

    it('sets error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ detail: 'Cannot remove owner' }),
      } as any)

      await useProjectAccessStore.getState().removeMember('p1', 'u1')

      expect(useProjectAccessStore.getState().error).toBe('Cannot remove owner')
    })
  })

  // ── fetchMyAccess ──────────────────────────────────────

  describe('fetchMyAccess', () => {
    it('fetches and stores my access', async () => {
      const access = { project_id: 'p1', role: 'editor', has_access: true }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(access),
      } as Response)

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toEqual(access)
    })

    it('sets null on failure', async () => {
      useProjectAccessStore.setState({
        myAccess: { project_id: 'p1', role: 'editor', has_access: true },
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toBeNull()
    })

    it('sets null on network error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network'))

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toBeNull()
    })
  })
})
