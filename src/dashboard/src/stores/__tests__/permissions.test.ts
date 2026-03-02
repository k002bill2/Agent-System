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

import { usePermissionsStore } from '../permissions'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

function resetStore() {
  usePermissionsStore.setState({
    permissions: [],
    disabledAgents: [],
    agentOverrides: {},
    loading: false,
    error: null,
  })
}

describe('permissions store', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty permissions', () => {
      expect(usePermissionsStore.getState().permissions).toEqual([])
    })

    it('has empty disabled agents', () => {
      expect(usePermissionsStore.getState().disabledAgents).toEqual([])
    })

    it('is not loading', () => {
      expect(usePermissionsStore.getState().loading).toBe(false)
    })
  })

  // ── reset ──────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state', () => {
      usePermissionsStore.setState({
        permissions: [{ permission: 'read_file', enabled: true, title: 'Read', description: '', risk: 'low' }],
        disabledAgents: ['agent-1'],
        error: 'some error',
        loading: true,
      })

      usePermissionsStore.getState().reset()

      const state = usePermissionsStore.getState()
      expect(state.permissions).toEqual([])
      expect(state.disabledAgents).toEqual([])
      expect(state.error).toBeNull()
      expect(state.loading).toBe(false)
    })
  })

  // ── fetchPermissions ───────────────────────────────────

  describe('fetchPermissions', () => {
    it('fetches and stores permissions', async () => {
      const data = {
        session_id: 's-1',
        permissions: [
          { permission: 'read_file', enabled: true, title: 'Read', description: 'Read files', risk: 'low' },
          { permission: 'execute_bash', enabled: false, title: 'Bash', description: 'Execute bash', risk: 'high' },
        ],
        disabled_agents: ['agent-x'],
        agent_overrides: { 'agent-1': ['read_file'] },
      }
      mockApiClient.get.mockResolvedValueOnce(data)

      await usePermissionsStore.getState().fetchPermissions('s-1')

      const state = usePermissionsStore.getState()
      expect(state.permissions).toHaveLength(2)
      expect(state.disabledAgents).toEqual(['agent-x'])
      expect(state.agentOverrides).toEqual({ 'agent-1': ['read_file'] })
      expect(state.loading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch permissions'))

      await usePermissionsStore.getState().fetchPermissions('s-1')

      expect(usePermissionsStore.getState().error).toBe('Failed to fetch permissions')
      expect(usePermissionsStore.getState().loading).toBe(false)
    })
  })

  // ── togglePermission ───────────────────────────────────

  describe('togglePermission', () => {
    it('toggles a permission and updates local state', async () => {
      usePermissionsStore.setState({
        permissions: [
          { permission: 'read_file', enabled: true, title: 'Read', description: '', risk: 'low' },
          { permission: 'write_file', enabled: false, title: 'Write', description: '', risk: 'medium' },
        ],
      })

      mockApiClient.post.mockResolvedValueOnce({ enabled: false })

      const result = await usePermissionsStore.getState().togglePermission('s-1', 'read_file')

      expect(result).toBe(true)
      const perms = usePermissionsStore.getState().permissions
      expect(perms.find(p => p.permission === 'read_file')?.enabled).toBe(false)
      expect(perms.find(p => p.permission === 'write_file')?.enabled).toBe(false) // unchanged
    })

    it('returns false on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed'))

      const result = await usePermissionsStore.getState().togglePermission('s-1', 'read_file')

      expect(result).toBe(false)
    })
  })

  // ── toggleAgent ────────────────────────────────────────

  describe('toggleAgent', () => {
    it('enables an agent (removes from disabled list)', async () => {
      usePermissionsStore.setState({
        disabledAgents: ['agent-1', 'agent-2'],
      })

      mockApiClient.post.mockResolvedValueOnce({ enabled: true })

      const result = await usePermissionsStore.getState().toggleAgent('s-1', 'agent-1')

      expect(result).toBe(true)
      expect(usePermissionsStore.getState().disabledAgents).toEqual(['agent-2'])
    })

    it('disables an agent (adds to disabled list)', async () => {
      usePermissionsStore.setState({
        disabledAgents: [],
      })

      mockApiClient.post.mockResolvedValueOnce({ enabled: false })

      const result = await usePermissionsStore.getState().toggleAgent('s-1', 'agent-1')

      expect(result).toBe(true)
      expect(usePermissionsStore.getState().disabledAgents).toContain('agent-1')
    })

    it('returns false on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed'))

      const result = await usePermissionsStore.getState().toggleAgent('s-1', 'agent-1')

      expect(result).toBe(false)
    })
  })

  // ── updatePermissions ──────────────────────────────────

  describe('updatePermissions', () => {
    it('updates permissions and stores response', async () => {
      const responseData = {
        permissions: [
          { permission: 'read_file', enabled: true, title: 'Read', description: '', risk: 'low' },
        ],
        disabled_agents: [],
        agent_overrides: {},
      }
      mockApiClient.put.mockResolvedValueOnce(responseData)

      const result = await usePermissionsStore.getState().updatePermissions('s-1', ['read_file'])

      expect(result).toBe(true)
      expect(usePermissionsStore.getState().permissions).toHaveLength(1)
    })

    it('returns false on failure', async () => {
      mockApiClient.put.mockRejectedValueOnce(new Error('Failed'))

      const result = await usePermissionsStore.getState().updatePermissions('s-1', [])

      expect(result).toBe(false)
    })
  })
})
