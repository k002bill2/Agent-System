/** 스킬 도메인 액션 (조회·모달 UI 상태·CRUD·복사). */
import { apiClient } from '../../services/apiClient'
import type { ProjectConfigsState, SkillConfig } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function fetchAllSkills(set: SetFn, _get: GetFn) {
  set({ isLoadingAll: true, error: null })

  try {
    const data = await apiClient.get<SkillConfig[]>('/api/project-configs/skills/all')
    set({
      allSkills: data,
      isLoadingAll: false,
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingAll: false })
  }
}

export async function fetchSkillContent(set: SetFn, _get: GetFn, projectId: string, skillId: string) {
  set({ isLoadingContent: true, skillContent: null, skillReferences: [] })

  try {
    const data = await apiClient.get<{ content: string; references: string[] }>(`/api/project-configs/${projectId}/skills/${skillId}/content`)
    set({
      skillContent: data.content,
      skillReferences: data.references,
      isLoadingContent: false,
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export function openSkillModal(set: SetFn, get: GetFn, mode: 'create' | 'edit', skill?: SkillConfig) {
  set({
    skillModalMode: mode,
    editingSkill: skill || null,
    skillContent: null,
  })
  // If editing, fetch the content
  if (mode === 'edit' && skill) {
    get().fetchSkillContent(skill.project_id, skill.skill_id)
  }
}

export function closeSkillModal(set: SetFn, _get: GetFn) {
  set({
    skillModalMode: null,
    editingSkill: null,
    skillContent: null,
  })
}

export async function createSkill(set: SetFn, get: GetFn, projectId: string, skillId: string, content: string) {
  set({ savingSkill: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/skills`, { skill_id: skillId, content })

    await get().fetchProjectSummary(projectId)
    set({ skillModalMode: null, editingSkill: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingSkill: false })
  }
}

export async function updateSkill(set: SetFn, get: GetFn, projectId: string, skillId: string, content: string) {
  set({ savingSkill: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/skills/${skillId}`, { content })

    await get().fetchProjectSummary(projectId)
    set({ skillModalMode: null, editingSkill: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingSkill: false })
  }
}

export async function deleteSkill(set: SetFn, get: GetFn, projectId: string, skillId: string) {
  const key = `${projectId}:${skillId}`
  set((state) => ({ deletingSkills: new Set([...state.deletingSkills, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/skills/${skillId}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingSkills)
      newSet.delete(key)
      return { deletingSkills: newSet }
    })
  }
}

export async function copySkill(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  skillId: string,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/skills/${skillId}/copy`, { skill_id: skillId, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
