/** GitHub PR 도메인 액션. `api/git/github.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import type { GitHubPRReview, GitHubPullRequest, GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchPullRequests(set: SetFn, get: GetFn, state = 'open', base?: string) {
  const { githubRepo } = get()
  if (!githubRepo) {
    set({ error: 'GitHub repository not configured' })
    return
  }

  set({ isLoading: true, error: null })
  try {
    const [owner, repo] = githubRepo.split('/')
    const params = new URLSearchParams({ state })
    if (base) params.set('base', base)

    const data = await apiClient.get<{ pull_requests: GitHubPullRequest[] }>(`/api/git/github/${owner}/${repo}/pulls?${params}`)
    set({ pullRequests: data.pull_requests, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function fetchPullRequest(set: SetFn, get: GetFn, prNumber: number) {
  const { githubRepo } = get()
  if (!githubRepo) {
    set({ error: 'GitHub repository not configured' })
    return null
  }

  set({ isLoading: true, error: null })
  try {
    const [owner, repo] = githubRepo.split('/')
    const pr = await apiClient.get<GitHubPullRequest>(`/api/git/github/${owner}/${repo}/pulls/${prNumber}`)
    set({ selectedPullRequest: pr, isLoading: false })
    return pr
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return null
  }
}

export async function fetchPRReviews(set: SetFn, get: GetFn, prNumber: number) {
  const { githubRepo } = get()
  if (!githubRepo) {
    set({ error: 'GitHub repository not configured' })
    return
  }

  set({ isLoading: true, error: null })
  try {
    const [owner, repo] = githubRepo.split('/')
    const reviews = await apiClient.get<GitHubPRReview[]>(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`)
    set({ prReviews: reviews, isLoading: false })
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
  }
}

export async function mergePullRequest(set: SetFn, get: GetFn, prNumber: number, method = 'merge') {
  const { githubRepo } = get()
  if (!githubRepo) {
    set({ error: 'GitHub repository not configured' })
    return false
  }

  set({ isLoading: true, error: null })
  try {
    const [owner, repo] = githubRepo.split('/')
    await apiClient.post(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/merge`, { merge_method: method })
    await get().fetchPullRequests()
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}

export async function createPRReview(
  set: SetFn,
  get: GetFn,
  prNumber: number,
  body: string,
  event: string
) {
  const { githubRepo } = get()
  if (!githubRepo) {
    set({ error: 'GitHub repository not configured' })
    return false
  }

  set({ isLoading: true, error: null })
  try {
    const [owner, repo] = githubRepo.split('/')
    await apiClient.post(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`, { body, event })
    await get().fetchPRReviews(prNumber)
    set({ isLoading: false })
    return true
  } catch (error) {
    set({ error: (error as Error).message, isLoading: false })
    return false
  }
}
