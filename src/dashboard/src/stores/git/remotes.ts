/** 리모트 관리·리모트 조작 도메인 액션. `api/git/remotes.py` 와 대칭이다. */
import { extractGitHubRepo } from '../../utils/gitUtils'
import { apiClient } from '../../services/apiClient'
import {
  appendWorktreePath,
  GIT_LONG_RUNNING_READ_TIMEOUT_MS,
  GIT_REMOTE_OPERATION_TIMEOUT_MS,
} from './types'
import type { GitRemote, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchRemotes(set: SetFn, get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    const data = await apiClient.get<{ remotes: GitRemote[] }>(
      `/api/git/projects/${projectId}/remotes`,
      { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
    )
    set({ remotes: data.remotes, isLoading: false })

    // Auto-detect GitHub repo from origin remote
    if (!get().githubRepo) {
      const origin = data.remotes.find((r) => r.name === 'origin')
      if (origin) {
        const detectedRepo = extractGitHubRepo(origin.url)
        if (detectedRepo) {
          set({ githubRepo: detectedRepo })
        }
      }
    }
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function addRemote(set: SetFn, get: GetFn, projectId: string, name: string, url: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/remotes`, { name, url })
    await get().fetchRemotes(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function removeRemote(set: SetFn, get: GetFn, projectId: string, remoteName: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.delete(`/api/git/projects/${projectId}/remotes/${encodeURIComponent(remoteName)}`)
    await get().fetchRemotes(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function updateRemote(
  set: SetFn,
  get: GetFn,
  projectId: string,
  remoteName: string,
  updates: { new_name?: string; url?: string }
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.put(`/api/git/projects/${projectId}/remotes/${encodeURIComponent(remoteName)}`, updates)
    await get().fetchRemotes(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function fetchRemote(set: SetFn, get: GetFn, projectId: string, remote?: string) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (remote) params.set('remote', remote)

    await apiClient.post(`/api/git/projects/${projectId}/fetch?${params}`, undefined, {
      timeout: GIT_REMOTE_OPERATION_TIMEOUT_MS,
    })
    await get().fetchBranches(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function pullRemote(
  set: SetFn,
  get: GetFn,
  projectId: string,
  branch?: string,
  remote?: string
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (branch) params.set('branch', branch)
    if (remote) params.set('remote', remote)

    await apiClient.post(`/api/git/projects/${projectId}/pull?${params}`, undefined, {
      timeout: GIT_REMOTE_OPERATION_TIMEOUT_MS,
    })
    await get().fetchBranches(projectId)
    await get().fetchCommits(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function pushRemote(
  set: SetFn,
  get: GetFn,
  projectId: string,
  branch?: string,
  remote?: string
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (branch) params.set('branch', branch)
    if (remote) params.set('remote', remote)

    const url = appendWorktreePath(`/api/git/projects/${projectId}/push?${params}`, get().selectedWorktreePath)
    await apiClient.post(url, undefined, {
      timeout: GIT_REMOTE_OPERATION_TIMEOUT_MS,
    })
    await get().fetchBranches(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}
