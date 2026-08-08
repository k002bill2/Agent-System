/** 머지 리퀘스트 도메인 액션. `api/git/merge_requests.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import type { GitState, MergeRequest, MergeRequestStatus } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchMergeRequests(
  set: SetFn,
  _get: GetFn,
  projectId: string,
  status?: MergeRequestStatus
) {
  set({ isLoading: true, error: null })
  try {
    const params = new URLSearchParams()
    if (status) params.set('status', status)

    const data = await apiClient.get<{ merge_requests: MergeRequest[] }>(`/api/git/projects/${projectId}/merge-requests?${params}`)
    set({ mergeRequests: data.merge_requests, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function createMergeRequest(
  set: SetFn,
  get: GetFn,
  projectId: string,
  title: string,
  source: string,
  target: string,
  description = '',
  autoMerge = false
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/merge-requests`, {
      title,
      source_branch: source,
      target_branch: target,
      description,
      auto_merge: autoMerge,
    })
    await get().fetchMergeRequests(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function approveMergeRequest(
  set: SetFn,
  get: GetFn,
  projectId: string,
  mrId: string,
  userId: string
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/merge-requests/${mrId}/approve?user_id=${userId}`)
    await get().fetchMergeRequests(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function mergeMergeRequest(
  set: SetFn,
  get: GetFn,
  projectId: string,
  mrId: string,
  userId: string,
  userRole = 'member'
) {
  set({ isLoading: true, error: null })
  try {
    const data = await apiClient.post<{ merge_request?: unknown; merge_result?: { success: boolean; message?: string } }>(`/api/git/projects/${projectId}/merge-requests/${mrId}/merge?user_id=${userId}&user_role=${userRole}`)
    if (data.merge_result && !data.merge_result.success) {
      set({ error: data.merge_result.message || '머지에 실패했습니다', isLoading: false })
      return false
    }
    await get().fetchMergeRequests(projectId)
    await get().fetchBranches(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function closeMergeRequest(
  set: SetFn,
  get: GetFn,
  projectId: string,
  mrId: string,
  userId: string
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.post(`/api/git/projects/${projectId}/merge-requests/${mrId}/close?user_id=${userId}`)
    await get().fetchMergeRequests(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function deleteMergeRequest(set: SetFn, get: GetFn, projectId: string, mrId: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.delete(`/api/git/projects/${projectId}/merge-requests/${mrId}`)
    await get().fetchMergeRequests(projectId)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}
