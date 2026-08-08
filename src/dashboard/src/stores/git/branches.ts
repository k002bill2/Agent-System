/** 브랜치 도메인 액션. `api/git/branches.py` 와 대칭이다. */
import { analytics } from '../../services/analytics'
import { apiClient } from '../../services/apiClient'
import { GIT_LONG_RUNNING_READ_TIMEOUT_MS } from './types'
import type { GitBranch, GitState, PruneExecuteResult } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchBranches(set: SetFn, _get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    const data = await apiClient.get<{ branches: GitBranch[]; current_branch: string; protected_branches: string[] }>(
      `/api/git/projects/${projectId}/branches`,
      { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
    )
    set({
      branches: data.branches,
      currentBranch: data.current_branch,
      protectedBranches: data.protected_branches,
      isLoading: false,
    })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function createBranch(
  set: SetFn,
  get: GetFn,
  projectId: string,
  name: string,
  startPoint = 'HEAD'
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/branches`, { name, start_point: startPoint })
    await get().fetchBranches(projectId)
    set({ isLoading: false })
    analytics.track('git_branch_created', { project_id: projectId, branch_name: name })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function checkoutBranch(set: SetFn, get: GetFn, projectId: string, name: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}/checkout`)
    await get().fetchBranches(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function deleteBranch(
  set: SetFn,
  get: GetFn,
  projectId: string,
  name: string,
  force = false,
  deleteRemote = false,
  removeWorktree = false
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams({
      force: String(force),
      delete_remote: String(deleteRemote),
      remove_worktree: String(removeWorktree),
    })
    await apiClient.delete(`/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}?${params}`)
    await Promise.all([
      get().fetchBranches(projectId),
      get().fetchWorktrees(projectId),
    ])
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function pruneMergedBranches(
  set: SetFn,
  get: GetFn,
  projectId: string,
  dryRun: boolean,
  extraProtected: string[] = []
) {
  set({ isLoading: true, error: null })
  try {
    const result = await apiClient.post<PruneExecuteResult>(
      `/api/git/projects/${projectId}/branches/prune-merged`,
      { dry_run: dryRun, extra_protected: extraProtected },
    )
    if (!dryRun) {
      await get().fetchBranches(projectId)
    }
    set({ isLoading: false })
    return result
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}
