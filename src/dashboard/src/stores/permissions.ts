import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

// Permission types matching backend
export type AgentPermission =
  | 'execute_bash'
  | 'write_file'
  | 'read_file'
  | 'delete_file'
  | 'network_access'
  | 'mcp_tool_call'
  | 'create_session'
  | 'modify_tasks'
  | 'approve_operations'

export interface PermissionInfo {
  permission: AgentPermission
  enabled: boolean
  title: string
  description: string
  risk: 'low' | 'medium' | 'high' | 'unknown'
}

export interface SessionPermissions {
  session_id: string
  permissions: PermissionInfo[]
  disabled_agents: string[]
  agent_overrides: Record<string, AgentPermission[]>
}

interface PermissionsState {
  // State
  permissions: PermissionInfo[]
  disabledAgents: string[]
  agentOverrides: Record<string, AgentPermission[]>
  loading: boolean
  error: string | null

  // Actions
  fetchPermissions: (sessionId: string) => Promise<void>
  togglePermission: (sessionId: string, permission: AgentPermission) => Promise<boolean>
  toggleAgent: (sessionId: string, agentId: string) => Promise<boolean>
  updatePermissions: (
    sessionId: string,
    enabledPermissions: AgentPermission[]
  ) => Promise<boolean>
  reset: () => void
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  // Initial state
  permissions: [],
  disabledAgents: [],
  agentOverrides: {},
  loading: false,
  error: null,

  // Fetch permissions for a session
  fetchPermissions: async (sessionId: string) => {
    set({ loading: true, error: null })

    try {
      const data = await apiClient.get<SessionPermissions>(`/api/sessions/${sessionId}/permissions`)
      set({
        permissions: data.permissions,
        disabledAgents: data.disabled_agents,
        agentOverrides: data.agent_overrides,
        loading: false,
      })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Unknown error',
        loading: false,
      })
    }
  },

  // Toggle a single permission
  togglePermission: async (sessionId: string, permission: AgentPermission) => {
    try {
      const data = await apiClient.post<{ enabled: boolean }>(
        `/api/sessions/${sessionId}/permissions/toggle/${permission}`
      )

      // Update local state
      set((state) => ({
        permissions: state.permissions.map((p) =>
          p.permission === permission ? { ...p, enabled: data.enabled } : p
        ),
      }))

      return true
    } catch (e) {
      console.error('Failed to toggle permission:', e)
      return false
    }
  },

  // Toggle an agent enabled/disabled
  toggleAgent: async (sessionId: string, agentId: string) => {
    try {
      const data = await apiClient.post<{ enabled: boolean }>(
        `/api/sessions/${sessionId}/permissions/agents/${agentId}/toggle`
      )

      // Update local state
      set((state) => ({
        disabledAgents: data.enabled
          ? state.disabledAgents.filter((id) => id !== agentId)
          : [...state.disabledAgents, agentId],
      }))

      return true
    } catch (e) {
      console.error('Failed to toggle agent:', e)
      return false
    }
  },

  // Update multiple permissions at once
  updatePermissions: async (
    sessionId: string,
    enabledPermissions: AgentPermission[]
  ) => {
    try {
      const data = await apiClient.put<SessionPermissions>(
        `/api/sessions/${sessionId}/permissions`,
        { enabled_permissions: enabledPermissions }
      )
      set({
        permissions: data.permissions,
        disabledAgents: data.disabled_agents,
        agentOverrides: data.agent_overrides,
      })

      return true
    } catch (e) {
      console.error('Failed to update permissions:', e)
      return false
    }
  },

  // Reset state
  reset: () => {
    set({
      permissions: [],
      disabledAgents: [],
      agentOverrides: {},
      loading: false,
      error: null,
    })
  },
}))
