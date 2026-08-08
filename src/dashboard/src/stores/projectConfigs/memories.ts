/** 메모리 도메인 액션 (모달 UI 상태·조회·CRUD·인덱스). */
import { apiClient } from '../../services/apiClient'
import type { MemoryConfig, ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export function openMemoryModal(set: SetFn, get: GetFn, mode: 'create' | 'edit', memory?: MemoryConfig) {
  set({
    memoryModalMode: mode,
    editingMemory: memory || null,
    memoryContent: null,
  })
  if (mode === 'edit' && memory) {
    get().fetchMemoryContent(memory.project_id, memory.memory_id)
  }
}

export function closeMemoryModal(set: SetFn, _get: GetFn) {
  set({
    memoryModalMode: null,
    editingMemory: null,
    memoryContent: null,
  })
}

export async function fetchMemoryContent(set: SetFn, _get: GetFn, projectId: string, memoryId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/memories/${memoryId}/content`)
    set({ memoryContent: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function fetchMemoryIndex(set: SetFn, _get: GetFn, projectId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/memories/index`)
    set({ memoryIndex: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function createMemory(set: SetFn, get: GetFn, projectId: string, memoryId: string, content: string) {
  set({ savingMemory: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/memories`, { memory_id: memoryId, content })

    await get().fetchProjectSummary(projectId)
    set({ memoryModalMode: null, editingMemory: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingMemory: false })
  }
}

export async function updateMemory(set: SetFn, get: GetFn, projectId: string, memoryId: string, content: string) {
  set({ savingMemory: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/memories/${memoryId}`, { content })

    await get().fetchProjectSummary(projectId)
    set({ memoryModalMode: null, editingMemory: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingMemory: false })
  }
}

export async function deleteMemory(set: SetFn, get: GetFn, projectId: string, memoryId: string) {
  const key = `${projectId}:${memoryId}`
  set((state) => ({ deletingMemories: new Set([...state.deletingMemories, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/memories/${memoryId}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingMemories)
      newSet.delete(key)
      return { deletingMemories: newSet }
    })
  }
}

export async function updateMemoryIndex(set: SetFn, _get: GetFn, projectId: string, content: string) {
  set({ savingMemory: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/memories/index`, { content })

    set({ memoryIndex: content })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingMemory: false })
  }
}
