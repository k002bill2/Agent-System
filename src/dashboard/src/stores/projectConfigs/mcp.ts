/** MCP 서버 도메인 액션 (토글·모달 UI 상태·CRUD·복사). */
import { apiClient } from '../../services/apiClient'
import type { MCPServerConfig, ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function toggleMCPServer(set: SetFn, get: GetFn, projectId: string, serverId: string, enabled: boolean) {
  const { togglingServers } = get()
  const key = `${projectId}:${serverId}`

  // Prevent double-toggle
  if (togglingServers.has(key)) return

  set({ togglingServers: new Set([...togglingServers, key]) })

  try {
    const endpoint = enabled ? 'enable' : 'disable'
    await apiClient.post(`/api/project-configs/${projectId}/mcp/${serverId}/${endpoint}`)

    // Update local state
    set((state) => {
      if (!state.selectedProject) return state

      return {
        selectedProject: {
          ...state.selectedProject,
          mcp_servers: state.selectedProject.mcp_servers.map((s) =>
            s.server_id === serverId ? { ...s, disabled: !enabled } : s
          ),
        },
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
  } finally {
    set((state) => {
      const newSet = new Set(state.togglingServers)
      newSet.delete(key)
      return { togglingServers: newSet }
    })
  }
}

export function openMCPModal(set: SetFn, _get: GetFn, mode: 'create' | 'edit', server?: MCPServerConfig) {
  set({
    mcpModalMode: mode,
    editingMCPServer: server || null,
  })
}

export function closeMCPModal(set: SetFn, _get: GetFn) {
  set({
    mcpModalMode: null,
    editingMCPServer: null,
  })
}

export async function createMCPServer(
  set: SetFn,
  get: GetFn,
  projectId: string,
  data: {
    server_id: string
    command: string
    args: string[]
    env: Record<string, string>
    disabled: boolean
    note: string
  }
) {
  set({ savingMCP: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/mcp`, data)

    // Refresh project data
    await get().fetchProjectSummary(projectId)
    set({ mcpModalMode: null, editingMCPServer: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingMCP: false })
  }
}

export async function updateMCPServer(
  set: SetFn,
  get: GetFn,
  projectId: string,
  serverId: string,
  data: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
    note?: string
  }
) {
  set({ savingMCP: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/mcp/${serverId}`, data)

    // Refresh project data
    await get().fetchProjectSummary(projectId)
    set({ mcpModalMode: null, editingMCPServer: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingMCP: false })
  }
}

export async function deleteMCPServer(set: SetFn, get: GetFn, projectId: string, serverId: string) {
  const key = `${projectId}:${serverId}`
  set((state) => ({ deletingMCP: new Set([...state.deletingMCP, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/mcp/${serverId}`)

    // Refresh project data
    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingMCP)
      newSet.delete(key)
      return { deletingMCP: newSet }
    })
  }
}

export async function copyMCPServer(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  serverId: string,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/mcp/${serverId}/copy`, { server_id: serverId, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
