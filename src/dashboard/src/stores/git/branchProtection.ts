/** 브랜치 보호 규칙 도메인 액션. `api/git/branches.py` 의 보호 규칙 라우트와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import { GIT_LONG_RUNNING_READ_TIMEOUT_MS } from './types'
import type { BranchProtectionRule, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchBranchProtectionRules(set: SetFn, _get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    const data = await apiClient.get<{ rules: BranchProtectionRule[] }>(
      `/api/git/projects/${projectId}/branch-protection`,
      { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
    )
    set({ branchProtectionRules: data.rules, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function createBranchProtectionRule(
  set: SetFn,
  get: GetFn,
  projectId: string,
  rule: Omit<BranchProtectionRule, 'id' | 'project_id' | 'created_at' | 'updated_at'>
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/branch-protection`, rule)
    await get().fetchBranchProtectionRules(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function updateBranchProtectionRule(
  set: SetFn,
  get: GetFn,
  projectId: string,
  ruleId: string,
  updates: Partial<BranchProtectionRule>
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.put(`/api/git/projects/${projectId}/branch-protection/${ruleId}`, updates)
    await get().fetchBranchProtectionRules(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function deleteBranchProtectionRule(
  set: SetFn,
  get: GetFn,
  projectId: string,
  ruleId: string
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.delete(`/api/git/projects/${projectId}/branch-protection/${ruleId}`)
    await get().fetchBranchProtectionRules(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}
