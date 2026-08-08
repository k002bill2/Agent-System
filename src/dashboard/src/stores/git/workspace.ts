/** UI 상태·워크트리·git 상태 도메인 액션. `api/git/working_tree.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import { appendWorktreePath, GIT_LONG_RUNNING_READ_TIMEOUT_MS } from './types'
import type { GitState, GitStatus, GitTab, GitWorkingStatus, GitWorktree } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export function setActiveTab(set: SetFn, _get: GetFn, tab: GitTab) {
  return set({ activeTab: tab })
}

export function setSelectedProject(set: SetFn, _get: GetFn, projectId: string | null) {
  return set({ selectedProjectId: projectId, gitStatus: null, worktrees: [], selectedWorktreePath: null })
}

export function setGitHubRepo(set: SetFn, _get: GetFn, repo: string | null) {
  return set({ githubRepo: repo })
}

export function clearError(set: SetFn, _get: GetFn) {
  return set({ error: null })
}

export async function fetchWorktrees(set: SetFn, _get: GetFn, projectId: string) {
  try {
    const data = await apiClient.get<{ worktrees: GitWorktree[]; total: number }>(
      `/api/git/projects/${projectId}/worktrees`,
      { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
    )
    set({ worktrees: data.worktrees })
  } catch {
    // Worktree listing is non-critical; silently ignore
    set({ worktrees: [] })
  }
}

export function setSelectedWorktree(set: SetFn, _get: GetFn, path: string | null) {
  return set({ selectedWorktreePath: path })
}

export async function fetchGitStatus(set: SetFn, _get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    const status = await apiClient.get<GitStatus>(`/api/git/projects/${projectId}/status`)
    set({ gitStatus: status, isLoading: false })
    return status
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}

export async function updateGitPath(set: SetFn, _get: GetFn, projectId: string, gitPath: string | null) {
  set({ isLoading: true, error: null })
  try {
    const status = await apiClient.put<GitStatus>(`/api/git/projects/${projectId}/git-path`, { git_path: gitPath })
    set({ gitStatus: status, isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function fetchWorkingStatus(set: SetFn, get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/working-status`, get().selectedWorktreePath)
    const status = await apiClient.get<GitWorkingStatus>(url, {
      timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS,
    })
    set({ workingStatus: status, isLoading: false })
    return status
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}
