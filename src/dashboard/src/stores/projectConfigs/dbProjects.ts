/** DB 등록 프로젝트 도메인 액션 (조회·CRUD·복원·활성 토글). */
import { apiClient } from '../../services/apiClient'
import type { DBProject, ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function fetchDBProjects(set: SetFn, _get: GetFn) {
  set({ isLoadingDBProjects: true, error: null })

  try {
    const data = await apiClient.get<{ projects: DBProject[] }>('/api/project-registry')
    set({
      dbProjects: data.projects,
      isLoadingDBProjects: false,
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingDBProjects: false })
  }
}

export async function fetchAllDBProjects(set: SetFn, _get: GetFn) {
  set({ isLoadingDBProjects: true, error: null })

  try {
    const data = await apiClient.get<{ projects: DBProject[] }>('/api/project-registry/all')
    set({
      dbProjects: data.projects,
      isLoadingDBProjects: false,
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingDBProjects: false })
  }
}

export async function createDBProject(
  set: SetFn,
  get: GetFn,
  data: { name: string; description?: string; path?: string }
) {
  set({ error: null })

  try {
    await apiClient.post('/api/project-registry', data)

    // Refresh both DB projects and config projects
    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function updateDBProject(
  set: SetFn,
  get: GetFn,
  id: string,
  data: { name?: string; description?: string; path?: string }
) {
  set({ error: null })

  try {
    await apiClient.put(`/api/project-registry/${id}`, data)

    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function deleteDBProject(set: SetFn, get: GetFn, id: string) {
  set({ error: null })

  try {
    await apiClient.delete(`/api/project-registry/${id}`)

    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function hardDeleteDBProject(set: SetFn, get: GetFn, id: string) {
  set({ error: null })

  try {
    await apiClient.delete(`/api/project-registry/${id}/permanent`)

    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function restoreDBProject(set: SetFn, get: GetFn, id: string) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-registry/${id}/restore`)

    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function toggleDBProjectActive(set: SetFn, get: GetFn, id: string) {
  set({ error: null })

  try {
    await apiClient.patch(`/api/project-registry/${id}/toggle-active`)

    await get().fetchAllDBProjects()
    await get().fetchProjects()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
