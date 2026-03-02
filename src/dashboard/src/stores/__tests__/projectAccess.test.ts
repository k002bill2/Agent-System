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

import { useProjectAccessStore } from '../projectAccess'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

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
    vi.clearAllMocks()
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
      mockApiClient.get.mockResolvedValueOnce(members)

      await useProjectAccessStore.getState().fetchMembers('p1')

      expect(useProjectAccessStore.getState().members).toEqual(members)
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Access denied'))

      await useProjectAccessStore.getState().fetchMembers('p1')

      expect(useProjectAccessStore.getState().error).toBe('Access denied')
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })
  })

  // ── addMember ──────────────────────────────────────────

  describe('addMember', () => {
    it('adds member to list', async () => {
      const newMember = { id: 'm-1', project_id: 'p1', user_id: 'u1', role: 'editor' }
      mockApiClient.post.mockResolvedValueOnce(newMember)

      await useProjectAccessStore.getState().addMember('p1', 'u1', 'editor')

      expect(useProjectAccessStore.getState().members).toContainEqual(newMember)
      expect(useProjectAccessStore.getState().loading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('User not found'))

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
      mockApiClient.put.mockResolvedValueOnce(updated)

      await useProjectAccessStore.getState().updateRole('p1', 'u1', 'editor')

      expect(useProjectAccessStore.getState().members[0].role).toBe('editor')
    })

    it('sets error on failure', async () => {
      mockApiClient.put.mockRejectedValueOnce(new Error('Cannot change owner role'))

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
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useProjectAccessStore.getState().removeMember('p1', 'u1')

      const members = useProjectAccessStore.getState().members
      expect(members).toHaveLength(1)
      expect(members[0].user_id).toBe('u2')
    })

    it('sets error on failure', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('Cannot remove owner'))

      await useProjectAccessStore.getState().removeMember('p1', 'u1')

      expect(useProjectAccessStore.getState().error).toBe('Cannot remove owner')
    })
  })

  // ── fetchMyAccess ──────────────────────────────────────

  describe('fetchMyAccess', () => {
    it('fetches and stores my access', async () => {
      const access = { project_id: 'p1', role: 'editor', has_access: true }
      mockApiClient.get.mockResolvedValueOnce(access)

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toEqual(access)
    })

    it('sets null on failure', async () => {
      useProjectAccessStore.setState({
        myAccess: { project_id: 'p1', role: 'editor', has_access: true },
      })
      mockApiClient.get.mockRejectedValueOnce(new Error('Forbidden'))

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toBeNull()
    })

    it('sets null on network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network'))

      await useProjectAccessStore.getState().fetchMyAccess('p1')

      expect(useProjectAccessStore.getState().myAccess).toBeNull()
    })
  })
})
