/** 커맨드 도메인 액션 (모달 UI 상태·조회·CRUD·복사). */
import { apiClient } from '../../services/apiClient'
import type { CommandConfig, ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export function openCommandModal(set: SetFn, get: GetFn, mode: 'create' | 'edit', command?: CommandConfig) {
  set({
    commandModalMode: mode,
    editingCommand: command || null,
    commandContent: null,
  })
  if (mode === 'edit' && command) {
    get().fetchCommandContent(command.project_id, command.command_id)
  }
}

export function closeCommandModal(set: SetFn, _get: GetFn) {
  set({
    commandModalMode: null,
    editingCommand: null,
    commandContent: null,
  })
}

export async function fetchCommandContent(set: SetFn, _get: GetFn, projectId: string, commandId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/commands/${commandId}/content`)
    set({ commandContent: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function createCommand(set: SetFn, get: GetFn, projectId: string, commandId: string, content: string) {
  set({ savingCommand: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/commands`, { command_id: commandId, content })

    await get().fetchProjectSummary(projectId)
    set({ commandModalMode: null, editingCommand: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingCommand: false })
  }
}

export async function updateCommand(set: SetFn, get: GetFn, projectId: string, commandId: string, content: string) {
  set({ savingCommand: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/commands/${commandId}`, { content })

    await get().fetchProjectSummary(projectId)
    set({ commandModalMode: null, editingCommand: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingCommand: false })
  }
}

export async function deleteCommand(set: SetFn, get: GetFn, projectId: string, commandId: string) {
  const key = `${projectId}:${commandId}`
  set((state) => ({ deletingCommands: new Set([...state.deletingCommands, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/commands/${commandId}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingCommands)
      newSet.delete(key)
      return { deletingCommands: newSet }
    })
  }
}

export async function copyCommand(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  commandId: string,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/commands/${commandId}/copy`, { command_id: commandId, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
