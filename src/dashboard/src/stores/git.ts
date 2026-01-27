import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_URL || ''

// =============================================================================
// Types
// =============================================================================

export type MergeRequestStatus = 'draft' | 'open' | 'merged' | 'closed'
export type ConflictStatus = 'unknown' | 'no_conflicts' | 'has_conflicts'

export interface GitBranch {
  name: string
  is_current: boolean
  is_remote: boolean
  is_protected: boolean
  commit_sha: string
  commit_message: string
  commit_author: string
  commit_date: string | null
  ahead: number
  behind: number
  tracking_branch: string | null
}

export interface GitCommit {
  sha: string
  short_sha: string
  message: string
  author_name: string
  author_email: string
  authored_date: string
  committer_name: string
  committer_email: string
  committed_date: string
  parent_shas: string[]
}

export interface MergeRequest {
  id: string
  project_id: string
  title: string
  description: string
  source_branch: string
  target_branch: string
  status: MergeRequestStatus
  author_id: string
  author_name: string
  author_email: string
  conflict_status: ConflictStatus
  reviewers: string[]
  approved_by: string[]
  created_at: string
  updated_at: string
  merged_at: string | null
  merged_by: string | null
  closed_at: string | null
  closed_by: string | null
}

export interface MergePreview {
  source_branch: string
  target_branch: string
  can_merge: boolean
  conflict_status: ConflictStatus
  conflicting_files: string[]
  files_changed: number
  insertions: number
  deletions: number
  commits_to_merge: number
}

export interface ConflictFile {
  path: string
  conflict_type: string
  our_content: string
  their_content: string
  base_content: string
}

export interface GitHubPullRequest {
  number: number
  title: string
  body: string
  state: string
  draft: boolean
  mergeable: boolean | null
  mergeable_state: string | null
  head_ref: string
  head_sha: string
  base_ref: string
  base_sha: string
  user_login: string
  user_avatar_url: string | null
  html_url: string
  diff_url: string
  commits: number
  additions: number
  deletions: number
  changed_files: number
  review_comments: number
  labels: string[]
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
}

export interface GitHubPRReview {
  id: number
  user_login: string
  user_avatar_url: string | null
  state: string
  body: string
  submitted_at: string | null
  commit_id: string | null
}

export type GitTab = 'branches' | 'merge-requests' | 'pull-requests' | 'history'

// =============================================================================
// State Interface
// =============================================================================

interface GitState {
  // UI State
  activeTab: GitTab
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null

  // Branch Data
  branches: GitBranch[]
  currentBranch: string
  protectedBranches: string[]

  // Commit Data
  commits: GitCommit[]

  // Merge Request Data
  mergeRequests: MergeRequest[]
  selectedMergeRequest: MergeRequest | null
  mergePreview: MergePreview | null

  // GitHub PR Data
  pullRequests: GitHubPullRequest[]
  selectedPullRequest: GitHubPullRequest | null
  prReviews: GitHubPRReview[]

  // GitHub Config
  githubRepo: string | null // "owner/repo" format

  // Actions - UI
  setActiveTab: (tab: GitTab) => void
  setSelectedProject: (projectId: string | null) => void
  setGitHubRepo: (repo: string | null) => void
  clearError: () => void

  // Actions - Branches
  fetchBranches: (projectId: string) => Promise<void>
  createBranch: (projectId: string, name: string, startPoint?: string) => Promise<boolean>
  deleteBranch: (projectId: string, name: string, force?: boolean) => Promise<boolean>

  // Actions - Commits
  fetchCommits: (projectId: string, branch?: string, limit?: number) => Promise<void>

  // Actions - Merge Preview
  previewMerge: (projectId: string, source: string, target: string) => Promise<MergePreview | null>
  executeMerge: (projectId: string, source: string, target: string, message?: string) => Promise<boolean>
  clearMergePreview: () => void

  // Actions - Merge Requests
  fetchMergeRequests: (projectId: string, status?: MergeRequestStatus) => Promise<void>
  createMergeRequest: (
    projectId: string,
    title: string,
    source: string,
    target: string,
    description?: string
  ) => Promise<boolean>
  approveMergeRequest: (projectId: string, mrId: string, userId: string) => Promise<boolean>
  mergeMergeRequest: (projectId: string, mrId: string, userId: string) => Promise<boolean>
  closeMergeRequest: (projectId: string, mrId: string, userId: string) => Promise<boolean>

  // Actions - GitHub PRs
  fetchPullRequests: (state?: string, base?: string) => Promise<void>
  fetchPullRequest: (prNumber: number) => Promise<GitHubPullRequest | null>
  fetchPRReviews: (prNumber: number) => Promise<void>
  mergePullRequest: (prNumber: number, method?: string) => Promise<boolean>
  createPRReview: (prNumber: number, body: string, event: string) => Promise<boolean>

  // Actions - Remote Operations
  fetchRemote: (projectId: string) => Promise<boolean>
  pullRemote: (projectId: string, branch?: string) => Promise<boolean>
  pushRemote: (projectId: string, branch?: string) => Promise<boolean>
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const obj = detail as Record<string, unknown>
    if (obj.message && typeof obj.message === 'string') return obj.message
    if (obj.msg && typeof obj.msg === 'string') return obj.msg
    if (obj.detail && typeof obj.detail === 'string') return obj.detail
    return JSON.stringify(detail)
  }
  return fallback
}

// =============================================================================
// Store
// =============================================================================

export const useGitStore = create<GitState>((set, get) => ({
  // Initial State
  activeTab: 'branches',
  selectedProjectId: null,
  isLoading: false,
  error: null,

  branches: [],
  currentBranch: '',
  protectedBranches: ['main', 'master'],

  commits: [],

  mergeRequests: [],
  selectedMergeRequest: null,
  mergePreview: null,

  pullRequests: [],
  selectedPullRequest: null,
  prReviews: [],

  githubRepo: null,

  // UI Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProject: (projectId) => set({ selectedProjectId: projectId }),
  setGitHubRepo: (repo) => set({ githubRepo: repo }),
  clearError: () => set({ error: null }),

  // Branch Actions
  fetchBranches: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/branches`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch branches'))
      }
      const data = await response.json()
      set({
        branches: data.branches,
        currentBranch: data.current_branch,
        protectedBranches: data.protected_branches,
        isLoading: false,
      })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createBranch: async (projectId, name, startPoint = 'HEAD') => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, start_point: startPoint }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create branch'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  deleteBranch: async (projectId, name, force = false) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}?force=${force}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to delete branch'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Commit Actions
  fetchCommits: async (projectId, branch, limit = 50) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      params.set('limit', String(limit))

      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/commits?${params}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch commits'))
      }
      const data = await response.json()
      set({ commits: data.commits, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  // Merge Preview Actions
  previewMerge: async (projectId, source, target) => {
    set({ isLoading: true, error: null, mergePreview: null })
    try {
      const params = new URLSearchParams({
        source_branch: source,
        target_branch: target,
      })
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge/preview?${params}`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to preview merge'))
      }
      const preview = await response.json()
      set({ mergePreview: preview, isLoading: false })
      return preview
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  executeMerge: async (projectId, source, target, message) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_branch: source,
          target_branch: target,
          message,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to execute merge'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false, mergePreview: null })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  clearMergePreview: () => set({ mergePreview: null }),

  // Merge Request Actions
  fetchMergeRequests: async (projectId, status) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)

      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge-requests?${params}`
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch merge requests'))
      }
      const data = await response.json()
      set({ mergeRequests: data.merge_requests, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createMergeRequest: async (projectId, title, source, target, description = '') => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          source_branch: source,
          target_branch: target,
          description,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create merge request'))
      }
      await get().fetchMergeRequests(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  approveMergeRequest: async (projectId, mrId, userId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge-requests/${mrId}/approve?user_id=${userId}`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to approve merge request'))
      }
      await get().fetchMergeRequests(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  mergeMergeRequest: async (projectId, mrId, userId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge-requests/${mrId}/merge?user_id=${userId}`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to merge'))
      }
      await get().fetchMergeRequests(projectId)
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  closeMergeRequest: async (projectId, mrId, userId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge-requests/${mrId}/close?user_id=${userId}`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to close merge request'))
      }
      await get().fetchMergeRequests(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // GitHub PR Actions
  fetchPullRequests: async (state = 'open', base) => {
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

      const response = await fetch(`${API_BASE}/api/git/github/${owner}/${repo}/pulls?${params}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch pull requests'))
      }
      const data = await response.json()
      set({ pullRequests: data.pull_requests, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  fetchPullRequest: async (prNumber) => {
    const { githubRepo } = get()
    if (!githubRepo) {
      set({ error: 'GitHub repository not configured' })
      return null
    }

    set({ isLoading: true, error: null })
    try {
      const [owner, repo] = githubRepo.split('/')
      const response = await fetch(`${API_BASE}/api/git/github/${owner}/${repo}/pulls/${prNumber}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch pull request'))
      }
      const pr = await response.json()
      set({ selectedPullRequest: pr, isLoading: false })
      return pr
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  fetchPRReviews: async (prNumber) => {
    const { githubRepo } = get()
    if (!githubRepo) {
      set({ error: 'GitHub repository not configured' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const [owner, repo] = githubRepo.split('/')
      const response = await fetch(
        `${API_BASE}/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch reviews'))
      }
      const reviews = await response.json()
      set({ prReviews: reviews, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  mergePullRequest: async (prNumber, method = 'merge') => {
    const { githubRepo } = get()
    if (!githubRepo) {
      set({ error: 'GitHub repository not configured' })
      return false
    }

    set({ isLoading: true, error: null })
    try {
      const [owner, repo] = githubRepo.split('/')
      const response = await fetch(
        `${API_BASE}/api/git/github/${owner}/${repo}/pulls/${prNumber}/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merge_method: method }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to merge pull request'))
      }
      await get().fetchPullRequests()
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  createPRReview: async (prNumber, body, event) => {
    const { githubRepo } = get()
    if (!githubRepo) {
      set({ error: 'GitHub repository not configured' })
      return false
    }

    set({ isLoading: true, error: null })
    try {
      const [owner, repo] = githubRepo.split('/')
      const response = await fetch(
        `${API_BASE}/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, event }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create review'))
      }
      await get().fetchPRReviews(prNumber)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Remote Operations
  fetchRemote: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/fetch`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch from remote'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  pullRemote: async (projectId, branch) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)

      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/pull?${params}`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to pull from remote'))
      }
      await get().fetchBranches(projectId)
      await get().fetchCommits(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  pushRemote: async (projectId, branch) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)

      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/push?${params}`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to push to remote'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },
}))
