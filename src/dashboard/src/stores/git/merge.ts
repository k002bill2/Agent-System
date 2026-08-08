/** 머지 미리보기·충돌 해소 도메인 액션. `api/git/merge.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import type { ConflictFile, ConflictResolutionRequest, GitState, MergePreview, MergeStatus } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function previewMerge(
  set: SetFn,
  _get: GetFn,
  projectId: string,
  source: string,
  target: string
) {
  set({ isLoading: true, error: null, mergePreview: null })
  try {
    const params = new URLSearchParams({
      source_branch: source,
      target_branch: target,
    })
    const preview = await apiClient.post<MergePreview>(`/api/git/projects/${projectId}/merge/preview?${params}`)
    set({ mergePreview: preview, isLoading: false })
    return preview
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}

export async function executeMerge(
  set: SetFn,
  get: GetFn,
  projectId: string,
  source: string,
  target: string,
  message?: string,
  userRole = 'member'
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams({ user_role: userRole })
    await apiClient.post(`/api/git/projects/${projectId}/merge?${params}`, {
      source_branch: source,
      target_branch: target,
      message,
    })
    await get().fetchBranches(projectId)
    set({ isLoading: false, mergePreview: null })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export function clearMergePreview(set: SetFn, _get: GetFn) {
  return set({ mergePreview: null })
}

export async function fetchConflictFiles(
  set: SetFn,
  _get: GetFn,
  projectId: string,
  source: string,
  target: string
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams({
      source_branch: source,
      target_branch: target,
    })
    const files = await apiClient.get<ConflictFile[]>(`/api/git/projects/${projectId}/merge/conflicts?${params}`)
    set({ conflictFiles: files, isLoading: false })
    return files
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return []
  }
}

export async function fetchMergeStatus(set: SetFn, _get: GetFn, projectId: string) {
  try {
    const status = await apiClient.get<MergeStatus>(`/api/git/projects/${projectId}/merge/status`)
    set({ mergeStatus: status })
    return status
  } catch (error) {
    set({ error: (error as Error).message })
    return null
  }
}

export async function resolveConflict(
  set: SetFn,
  get: GetFn,
  projectId: string,
  request: ConflictResolutionRequest
) {
  set({ isResolvingConflict: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/merge/resolve`, request)
    // Refresh merge status after resolving
    await get().fetchMergeStatus(projectId)
    // Update conflict files list - remove resolved file
    const currentFiles = get().conflictFiles
    set({
      conflictFiles: currentFiles.filter(f => f.path !== request.file_path),
      isResolvingConflict: false,
    })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isResolvingConflict: false })
    return false
  }
}

export async function abortMerge(set: SetFn, _get: GetFn, projectId: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/merge/abort`)
    set({
      isLoading: false,
      conflictFiles: [],
      mergeStatus: null,
      mergePreview: null,
    })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function completeMerge(set: SetFn, get: GetFn, projectId: string, message?: string) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (message) params.set('message', message)

    await apiClient.post(`/api/git/projects/${projectId}/merge/complete?${params}`)
    // Refresh branches after merge completion
    await get().fetchBranches(projectId)
    set({
      isLoading: false,
      conflictFiles: [],
      mergeStatus: null,
      mergePreview: null,
    })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export function clearConflictState(set: SetFn, _get: GetFn) {
  return set({
    conflictFiles: [],
    mergeStatus: null,
    isResolvingConflict: false,
  })
}
