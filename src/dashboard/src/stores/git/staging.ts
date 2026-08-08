/** 스테이징·커밋·초안 커밋 도메인 액션. `api/git/working_tree.py` 와 대칭이다. */
import { analytics } from '../../services/analytics'
import { apiClient } from '../../services/apiClient'
import { appendWorktreePath, GIT_DRAFT_COMMITS_TIMEOUT_MS } from './types'
import type { DiffHunk, DraftCommitsResponse, FileDiffResponse, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function stageFiles(
  set: SetFn,
  get: GetFn,
  projectId: string,
  paths: string[] = [],
  all = false
) {
  set({ isLoading: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/add`, get().selectedWorktreePath)
    await apiClient.post(url, { paths, all })
    await get().fetchWorkingStatus(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function unstageFiles(
  set: SetFn,
  get: GetFn,
  projectId: string,
  paths: string[] = [],
  all = false
) {
  set({ isLoading: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/unstage`, get().selectedWorktreePath)
    await apiClient.post(url, { paths, all })
    await get().fetchWorkingStatus(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function commitChanges(
  set: SetFn,
  get: GetFn,
  projectId: string,
  message: string,
  authorName?: string,
  authorEmail?: string
) {
  set({ isLoading: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/commit`, get().selectedWorktreePath)
    await apiClient.post(url, {
      message,
      author_name: authorName,
      author_email: authorEmail,
    })
    await get().fetchWorkingStatus(projectId)
    await get().fetchCommits(projectId)
    // Clear draft commits after successful commit
    set({ isLoading: false, draftCommits: [] })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function commitAndPush(
  set: SetFn,
  get: GetFn,
  projectId: string,
  message: string,
  authorName?: string,
  authorEmail?: string
) {
  set({ isLoading: true, error: null })
  try {
    // 1. Commit
    const commitSuccess = await get().commitChanges(projectId, message, authorName, authorEmail)
    if (!commitSuccess) {
      return false
    }

    // 2. Push
    const pushSuccess = await get().pushRemote(projectId)
    if (!pushSuccess) {
      set({ error: 'Commit succeeded but push failed' })
      return false
    }

    analytics.track('git_commit_pushed', { project_id: projectId })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function fetchFileDiff(
  set: SetFn,
  get: GetFn,
  projectId: string,
  filePath: string,
  staged = false
) {
  set({ isLoadingDiff: true })
  try {
    const params = new URLSearchParams({ file_path: filePath, staged: String(staged) })
    const url = appendWorktreePath(`/api/git/projects/${projectId}/file-diff?${params}`, get().selectedWorktreePath)
    const data = await apiClient.get<FileDiffResponse>(url)
    set((state) => ({
      fileDiffs: { ...state.fileDiffs, [`${filePath}:${staged}`]: data.diff },
      isLoadingDiff: false,
    }))
    return data.diff
  } catch (error) {
    set({ isLoadingDiff: false, error: (error as Error).message })
    return ''
  }
}

export function clearFileDiffs(set: SetFn, _get: GetFn) {
  return set({ fileDiffs: {}, stagedDiff: null, fileHunks: {} })
}

export async function fetchStagedDiff(set: SetFn, get: GetFn, projectId: string) {
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/staged-diff`, get().selectedWorktreePath)
    const data = await apiClient.get<{ diff: string | null }>(url)
    set({ stagedDiff: data.diff })
    return data.diff
  } catch (error) {
    set({ error: (error as Error).message })
    return null
  }
}

export async function fetchFileHunks(
  set: SetFn,
  get: GetFn,
  projectId: string,
  filePath: string,
  staged = false
) {
  try {
    const params = new URLSearchParams({ file_path: filePath, staged: String(staged) })
    const url = appendWorktreePath(`/api/git/projects/${projectId}/file-hunks?${params}`, get().selectedWorktreePath)
    const data = await apiClient.get<{ hunks: DiffHunk[] }>(url)
    set((state) => ({
      fileHunks: { ...state.fileHunks, [filePath]: data.hunks },
    }))
    return data.hunks
  } catch (error) {
    set({ error: (error as Error).message })
    return []
  }
}

export async function stageHunks(
  set: SetFn,
  get: GetFn,
  projectId: string,
  filePath: string,
  hunkIndices: number[]
) {
  set({ isLoading: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/stage-hunks`, get().selectedWorktreePath)
    await apiClient.post(url, { file_path: filePath, hunk_indices: hunkIndices })
    await get().fetchWorkingStatus(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function generateDraftCommits(
  set: SetFn,
  get: GetFn,
  projectId: string,
  stagedOnly = false
) {
  set({ isGeneratingDrafts: true, error: null })
  try {
    const url = appendWorktreePath(`/api/git/projects/${projectId}/draft-commits`, get().selectedWorktreePath)
    const data = await apiClient.post<DraftCommitsResponse>(
      url,
      { staged_only: stagedOnly },
      { timeout: GIT_DRAFT_COMMITS_TIMEOUT_MS }
    )
    set({ draftCommits: data.drafts, isGeneratingDrafts: false })
    return data.drafts
  } catch (error) {
    set({ error: (error as Error).message, isGeneratingDrafts: false })
    return []
  }
}

export function clearDraftCommits(set: SetFn, _get: GetFn) {
  return set({ draftCommits: [] })
}
