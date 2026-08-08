/** 훅 도메인 액션 (추가·삭제·복사). */
import { apiClient } from '../../services/apiClient'
import type { ProjectConfigsState } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function addHookEntry(
  set: SetFn,
  get: GetFn,
  projectId: string,
  event: string,
  matcher: string,
  hooks: { type: string; command: string }[]
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/hooks/events/${event}`, { matcher, hooks })

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function deleteHook(set: SetFn, get: GetFn, projectId: string, event: string, index: number) {
  set({ error: null })

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/hooks/${event}/${index}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}

export async function copyHook(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  event: string,
  index: number,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/hooks/${event}/${index}/copy`, { event, index, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
