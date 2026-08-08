/** 커밋 도메인 액션. `api/git/commits.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import { GIT_LONG_RUNNING_READ_TIMEOUT_MS } from './types'
import type { CommitFile, GitCommit, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchCommits(
  set: SetFn,
  _get: GetFn,
  projectId: string,
  branch?: string,
  limit = 50
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (branch) params.set('branch', branch)
    params.set('limit', String(limit))

    const data = await apiClient.get<{ commits: GitCommit[] }>(
      `/api/git/projects/${projectId}/commits?${params}`,
      { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
    )
    set({ commits: data.commits, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function fetchCommitFiles(set: SetFn, get: GetFn, projectId: string, sha: string) {
  // Return cached if available
  const cached = get().commitFiles[sha]
  if (cached) return cached

  try {
    const files = await apiClient.get<CommitFile[]>(`/api/git/projects/${projectId}/commits/${sha}/files`)
    set({ commitFiles: { ...get().commitFiles, [sha]: files } })
    return files
  } catch (error) {
    set({ error: (error as Error).message })
    return []
  }
}

export async function fetchCommitDiff(
  set: SetFn,
  get: GetFn,
  projectId: string,
  sha: string,
  filePath?: string
) {
  const key = filePath ? `${sha}:${filePath}` : sha
  const cached = get().commitDiff[key]
  if (cached) return cached

  try {
    const params = new URLSearchParams()
    if (filePath) params.set('file_path', filePath)

    const data = await apiClient.get<{ diff: string }>(`/api/git/projects/${projectId}/commits/${sha}/diff?${params}`)
    set({ commitDiff: { ...get().commitDiff, [key]: data.diff } })
    return data.diff
  } catch (error) {
    set({ error: (error as Error).message })
    return ''
  }
}
