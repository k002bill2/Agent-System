/** 등록 저장소 도메인 액션. `api/git/repositories.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import type { GitRepository, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchRepositories(set: SetFn, _get: GetFn) {
  set({ isLoading: true, error: null })
  try {
    const data = await apiClient.get<{ repositories: GitRepository[] }>('/api/git/repositories')
    set({ repositories: data.repositories, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function createRepository(
  set: SetFn,
  get: GetFn,
  name: string,
  path: string,
  description = ''
) {
  set({ isLoading: true, error: null })
  try {
    const repo = await apiClient.post<GitRepository>('/api/git/repositories', { name, path, description })
    await get().fetchRepositories()
    set({ isLoading: false })
    return repo
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}

export async function updateRepository(
  set: SetFn,
  get: GetFn,
  repoId: string,
  updates: { name?: string; path?: string; description?: string }
) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.put(`/api/git/repositories/${repoId}`, updates)
    await get().fetchRepositories()
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function deleteRepository(set: SetFn, get: GetFn, repoId: string) {
  set({ isLoading: true, error: null })
  try {
    await apiClient.delete(`/api/git/repositories/${repoId}`)
    await get().fetchRepositories()
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}
