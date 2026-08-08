/** 에이전트 도메인 액션 (조회·모달 UI 상태·CRUD·복사). */
import { apiClient } from '../../services/apiClient'
import type { AgentConfig, ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function fetchAllAgents(set: SetFn, _get: GetFn) {
  set({ isLoadingAll: true, error: null })

  try {
    const data = await apiClient.get<AgentConfig[]>('/api/project-configs/agents/all')
    set({
      allAgents: data,
      isLoadingAll: false,
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingAll: false })
  }
}

export function openAgentModal(set: SetFn, get: GetFn, mode: 'create' | 'edit', agent?: AgentConfig) {
  set({
    agentModalMode: mode,
    editingAgent: agent || null,
    agentContent: null,
  })
  // If editing, fetch the content
  if (mode === 'edit' && agent) {
    get().fetchAgentContent(agent.project_id, agent.agent_id)
  }
}

export function closeAgentModal(set: SetFn, _get: GetFn) {
  set({
    agentModalMode: null,
    editingAgent: null,
    agentContent: null,
  })
}

export async function fetchAgentContent(set: SetFn, _get: GetFn, projectId: string, agentId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/agents/${agentId}/content`)
    set({ agentContent: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function createAgent(
  set: SetFn,
  get: GetFn,
  projectId: string,
  agentId: string,
  content: string,
  isShared: boolean
) {
  set({ savingAgent: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/agents`, { agent_id: agentId, content, is_shared: isShared })

    await get().fetchProjectSummary(projectId)
    set({ agentModalMode: null, editingAgent: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingAgent: false })
  }
}

export async function updateAgent(set: SetFn, get: GetFn, projectId: string, agentId: string, content: string) {
  set({ savingAgent: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/agents/${agentId}`, { content })

    await get().fetchProjectSummary(projectId)
    set({ agentModalMode: null, editingAgent: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingAgent: false })
  }
}

export async function deleteAgent(set: SetFn, get: GetFn, projectId: string, agentId: string) {
  const key = `${projectId}:${agentId}`
  set((state) => ({ deletingAgents: new Set([...state.deletingAgents, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/agents/${agentId}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingAgents)
      newSet.delete(key)
      return { deletingAgents: newSet }
    })
  }
}

export async function copyAgent(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  agentId: string,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/agents/${agentId}/copy`, { agent_id: agentId, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
