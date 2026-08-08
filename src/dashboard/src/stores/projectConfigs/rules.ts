/** 룰 도메인 액션 (모달 UI 상태·조회·프로젝트/전역 CRUD·복사). */
import { apiClient } from '../../services/apiClient'
import type { ProjectConfigsState, RuleConfig } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export function openRuleModal(set: SetFn, get: GetFn, mode: 'create' | 'edit', rule?: RuleConfig) {
  set({
    ruleModalMode: mode,
    editingRule: rule || null,
    ruleContent: null,
  })
  if (mode === 'edit' && rule) {
    if (rule.is_global) {
      get().fetchGlobalRuleContent(rule.rule_id)
    } else {
      get().fetchRuleContent(rule.project_id, rule.rule_id)
    }
  }
}

export function closeRuleModal(set: SetFn, _get: GetFn) {
  set({
    ruleModalMode: null,
    editingRule: null,
    ruleContent: null,
  })
}

export async function fetchRuleContent(set: SetFn, _get: GetFn, projectId: string, ruleId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/rules/${ruleId}/content`)
    set({ ruleContent: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function fetchGlobalRuleContent(set: SetFn, _get: GetFn, ruleId: string) {
  set({ isLoadingContent: true })

  try {
    const data = await apiClient.get<{ content: string }>(`/api/project-configs/global/rules/${ruleId}/content`)
    set({ ruleContent: data.content, isLoadingContent: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingContent: false })
  }
}

export async function createRule(set: SetFn, get: GetFn, projectId: string, ruleId: string, content: string) {
  set({ savingRule: true, error: null })

  try {
    await apiClient.post(`/api/project-configs/${projectId}/rules`, { rule_id: ruleId, content })

    await get().fetchProjectSummary(projectId)
    set({ ruleModalMode: null, editingRule: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingRule: false })
  }
}

export async function updateRule(set: SetFn, get: GetFn, projectId: string, ruleId: string, content: string) {
  set({ savingRule: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/${projectId}/rules/${ruleId}`, { content })

    await get().fetchProjectSummary(projectId)
    set({ ruleModalMode: null, editingRule: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingRule: false })
  }
}

export async function deleteRule(set: SetFn, get: GetFn, projectId: string, ruleId: string) {
  const key = `${projectId}:${ruleId}`
  set((state) => ({ deletingRules: new Set([...state.deletingRules, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/${projectId}/rules/${ruleId}`)

    await get().fetchProjectSummary(projectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingRules)
      newSet.delete(key)
      return { deletingRules: newSet }
    })
  }
}

export async function createGlobalRule(set: SetFn, get: GetFn, ruleId: string, content: string) {
  set({ savingRule: true, error: null })

  try {
    await apiClient.post('/api/project-configs/global/rules', { rule_id: ruleId, content })

    await get().fetchGlobalConfigs()
    set({ ruleModalMode: null, editingRule: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingRule: false })
  }
}

export async function updateGlobalRule(set: SetFn, get: GetFn, ruleId: string, content: string) {
  set({ savingRule: true, error: null })

  try {
    await apiClient.put(`/api/project-configs/global/rules/${ruleId}`, { content })

    await get().fetchGlobalConfigs()
    set({ ruleModalMode: null, editingRule: null })
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set({ savingRule: false })
  }
}

export async function deleteGlobalRule(set: SetFn, get: GetFn, ruleId: string) {
  const key = `global:${ruleId}`
  set((state) => ({ deletingRules: new Set([...state.deletingRules, key]) }))

  try {
    await apiClient.delete(`/api/project-configs/global/rules/${ruleId}`)

    await get().fetchGlobalConfigs()
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  } finally {
    set((state) => {
      const newSet = new Set(state.deletingRules)
      newSet.delete(key)
      return { deletingRules: newSet }
    })
  }
}

export async function copyRule(
  set: SetFn,
  get: GetFn,
  sourceProjectId: string,
  ruleId: string,
  targetProjectId: string
) {
  set({ error: null })

  try {
    await apiClient.post(`/api/project-configs/${sourceProjectId}/rules/${ruleId}/copy`, { rule_id: ruleId, target_project_id: targetProjectId })

    await get().fetchProjects()
    await get().fetchProjectSummary(targetProjectId)
    return true
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage })
    return false
  }
}
