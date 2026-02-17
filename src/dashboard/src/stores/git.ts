import { create } from 'zustand'
import { extractGitHubRepo } from '../utils/gitUtils'
import { analytics } from '../services/analytics'

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
  auto_merge: boolean
  reviewers: string[]
  approved_by: string[]
  created_at: string
  updated_at: string
  merged_at: string | null
  merged_by: string | null
  closed_at: string | null
  closed_by: string | null
}

export interface BranchProtectionRule {
  id: string
  project_id: string
  branch_pattern: string
  require_approvals: number
  require_no_conflicts: boolean
  allowed_merge_roles: string[]
  allow_force_push: boolean
  allow_deletion: boolean
  auto_deploy: boolean
  deploy_workflow: string | null
  enabled: boolean
  created_at: string
  updated_at: string
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

// Conflict Resolution Types
export type ResolutionStrategy = 'ours' | 'theirs' | 'custom'

export interface ConflictResolutionRequest {
  file_path: string
  strategy: ResolutionStrategy
  resolved_content?: string
  source_branch: string
  target_branch: string
}

export interface ConflictResolutionResult {
  success: boolean
  file_path: string
  message: string
  resolved_content?: string
}

export interface MergeStatus {
  merge_in_progress: boolean
  unmerged_files: string[]
  can_commit: boolean
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

export type GitTab = 'changes' | 'branches' | 'merge-requests' | 'pull-requests' | 'history' | 'remotes' | 'protection'

// Working Directory Types
export type FileStatusType = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'staged'

export interface GitStatusFile {
  path: string
  status: FileStatusType
  staged: boolean
  old_path: string | null
}

export interface GitWorkingStatus {
  branch: string
  is_clean: boolean
  staged_files: GitStatusFile[]
  unstaged_files: GitStatusFile[]
  untracked_files: GitStatusFile[]
  total_changes: number
}

export interface AddResult {
  success: boolean
  staged_files: string[]
  message: string
}

export interface CommitCreateResult {
  success: boolean
  commit_sha: string | null
  message: string
  files_committed: number
}

export interface GitRepository {
  id: string
  name: string
  path: string
  description: string
  is_valid: boolean
  default_branch: string | null
  remote_url: string | null
  created_at: string
}

export interface GitStatus {
  project_id: string
  git_enabled: boolean
  git_path: string | null
  effective_git_path: string
  is_valid_repo: boolean
  current_branch: string | null
  error: string | null
}

// Draft Commits (LLM-based)
export interface DraftCommit {
  message: string
  files: string[]
  type: string
  scope: string | null
}

export interface DraftCommitsResponse {
  drafts: DraftCommit[]
  total_files: number
  token_usage: number | null
}

export interface CommitFile {
  path: string
  status: string // added, modified, deleted, renamed
  additions: number
  deletions: number
  old_path: string | null
}

export interface GitRemote {
  name: string
  url: string
  fetch_url: string | null
  push_url: string | null
}

export interface RemoteOperationResult {
  success: boolean
  message: string
}

// =============================================================================
// State Interface
// =============================================================================

interface GitState {
  // UI State
  activeTab: GitTab
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null

  // Git Status (for project configuration)
  gitStatus: GitStatus | null

  // Working Directory Status
  workingStatus: GitWorkingStatus | null

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

  // Conflict Resolution Data
  conflictFiles: ConflictFile[]
  mergeStatus: MergeStatus | null
  isResolvingConflict: boolean

  // GitHub PR Data
  pullRequests: GitHubPullRequest[]
  selectedPullRequest: GitHubPullRequest | null
  prReviews: GitHubPRReview[]

  // GitHub Config
  githubRepo: string | null // "owner/repo" format

  // Registered Git Repositories
  repositories: GitRepository[]

  // Draft Commits (LLM-based)
  draftCommits: DraftCommit[]
  isGeneratingDrafts: boolean

  // Remote Management
  remotes: GitRemote[]

  // Branch Protection
  branchProtectionRules: BranchProtectionRule[]

  // Commit Detail
  commitFiles: Record<string, CommitFile[]>  // sha -> files
  commitDiff: Record<string, string>  // sha -> diff or sha:path -> diff

  // Actions - UI
  setActiveTab: (tab: GitTab) => void
  setSelectedProject: (projectId: string | null) => void
  setGitHubRepo: (repo: string | null) => void
  clearError: () => void

  // Actions - Git Status
  fetchGitStatus: (projectId: string) => Promise<GitStatus | null>
  updateGitPath: (projectId: string, gitPath: string | null) => Promise<boolean>

  // Actions - Working Directory
  fetchWorkingStatus: (projectId: string) => Promise<GitWorkingStatus | null>
  stageFiles: (projectId: string, paths?: string[], all?: boolean) => Promise<boolean>
  commitChanges: (projectId: string, message: string, authorName?: string, authorEmail?: string) => Promise<boolean>
  commitAndPush: (projectId: string, message: string, authorName?: string, authorEmail?: string) => Promise<boolean>

  // Actions - Draft Commits (LLM-based)
  generateDraftCommits: (projectId: string, stagedOnly?: boolean) => Promise<DraftCommit[]>
  clearDraftCommits: () => void

  // Actions - Git Repositories
  fetchRepositories: () => Promise<void>
  createRepository: (name: string, path: string, description?: string) => Promise<GitRepository | null>
  updateRepository: (repoId: string, updates: { name?: string; path?: string; description?: string }) => Promise<boolean>
  deleteRepository: (repoId: string) => Promise<boolean>

  // Actions - Branches
  fetchBranches: (projectId: string) => Promise<void>
  createBranch: (projectId: string, name: string, startPoint?: string) => Promise<boolean>
  checkoutBranch: (projectId: string, name: string) => Promise<boolean>
  deleteBranch: (projectId: string, name: string, force?: boolean, deleteRemote?: boolean) => Promise<boolean>

  // Actions - Commits
  fetchCommits: (projectId: string, branch?: string, limit?: number) => Promise<void>
  fetchCommitFiles: (projectId: string, sha: string) => Promise<CommitFile[]>
  fetchCommitDiff: (projectId: string, sha: string, filePath?: string) => Promise<string>

  // Actions - Merge Preview
  previewMerge: (projectId: string, source: string, target: string) => Promise<MergePreview | null>
  executeMerge: (projectId: string, source: string, target: string, message?: string, userRole?: string) => Promise<boolean>
  clearMergePreview: () => void

  // Actions - Conflict Resolution
  fetchConflictFiles: (projectId: string, source: string, target: string) => Promise<ConflictFile[]>
  fetchMergeStatus: (projectId: string) => Promise<MergeStatus | null>
  resolveConflict: (projectId: string, request: ConflictResolutionRequest) => Promise<boolean>
  abortMerge: (projectId: string) => Promise<boolean>
  completeMerge: (projectId: string, message?: string) => Promise<boolean>
  clearConflictState: () => void

  // Actions - Merge Requests
  fetchMergeRequests: (projectId: string, status?: MergeRequestStatus) => Promise<void>
  createMergeRequest: (
    projectId: string,
    title: string,
    source: string,
    target: string,
    description?: string,
    autoMerge?: boolean
  ) => Promise<boolean>
  approveMergeRequest: (projectId: string, mrId: string, userId: string) => Promise<boolean>
  mergeMergeRequest: (projectId: string, mrId: string, userId: string, userRole?: string) => Promise<boolean>
  closeMergeRequest: (projectId: string, mrId: string, userId: string) => Promise<boolean>

  // Actions - GitHub PRs
  fetchPullRequests: (state?: string, base?: string) => Promise<void>
  fetchPullRequest: (prNumber: number) => Promise<GitHubPullRequest | null>
  fetchPRReviews: (prNumber: number) => Promise<void>
  mergePullRequest: (prNumber: number, method?: string) => Promise<boolean>
  createPRReview: (prNumber: number, body: string, event: string) => Promise<boolean>

  // Actions - Remote Management
  fetchRemotes: (projectId: string) => Promise<void>
  addRemote: (projectId: string, name: string, url: string) => Promise<boolean>
  removeRemote: (projectId: string, remoteName: string) => Promise<boolean>
  updateRemote: (projectId: string, remoteName: string, updates: { new_name?: string; url?: string }) => Promise<boolean>

  // Actions - Remote Operations
  fetchRemote: (projectId: string, remote?: string) => Promise<boolean>
  pullRemote: (projectId: string, branch?: string, remote?: string) => Promise<boolean>
  pushRemote: (projectId: string, branch?: string, remote?: string) => Promise<boolean>

  // Actions - Branch Protection
  fetchBranchProtectionRules: (projectId: string) => Promise<void>
  createBranchProtectionRule: (projectId: string, rule: Omit<BranchProtectionRule, 'id' | 'project_id' | 'created_at' | 'updated_at'>) => Promise<boolean>
  updateBranchProtectionRule: (projectId: string, ruleId: string, updates: Partial<BranchProtectionRule>) => Promise<boolean>
  deleteBranchProtectionRule: (projectId: string, ruleId: string) => Promise<boolean>
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
  activeTab: 'changes',
  selectedProjectId: null,
  isLoading: false,
  error: null,

  gitStatus: null,
  workingStatus: null,

  branches: [],
  currentBranch: '',
  protectedBranches: ['main', 'master'],

  commits: [],

  mergeRequests: [],
  selectedMergeRequest: null,
  mergePreview: null,

  // Conflict Resolution
  conflictFiles: [],
  mergeStatus: null,
  isResolvingConflict: false,

  pullRequests: [],
  selectedPullRequest: null,
  prReviews: [],

  githubRepo: null,

  repositories: [],

  // Draft Commits
  draftCommits: [],
  isGeneratingDrafts: false,

  // Remote Management
  remotes: [],

  // Branch Protection
  branchProtectionRules: [],

  // Commit Detail
  commitFiles: {},
  commitDiff: {},

  // UI Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProject: (projectId) => set({ selectedProjectId: projectId, gitStatus: null }),
  setGitHubRepo: (repo) => set({ githubRepo: repo }),
  clearError: () => set({ error: null }),

  // Git Status Actions
  fetchGitStatus: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/status`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch git status'))
      }
      const status = await response.json()
      set({ gitStatus: status, isLoading: false })
      return status
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  updateGitPath: async (projectId, gitPath) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/git-path`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ git_path: gitPath }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to update git path'))
      }
      const status = await response.json()
      set({ gitStatus: status, isLoading: false })
      return status.is_valid_repo
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Working Directory Actions
  fetchWorkingStatus: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/working-status`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch working status'))
      }
      const status = await response.json()
      set({ workingStatus: status, isLoading: false })
      return status
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  stageFiles: async (projectId, paths = [], all = false) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, all }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to stage files'))
      }
      await get().fetchWorkingStatus(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  commitChanges: async (projectId, message, authorName, authorEmail) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          author_name: authorName,
          author_email: authorEmail,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create commit'))
      }
      await get().fetchWorkingStatus(projectId)
      await get().fetchCommits(projectId)
      // Clear draft commits after successful commit
      set({ isLoading: false, draftCommits: [] })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  commitAndPush: async (projectId, message, authorName, authorEmail) => {
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
  },

  // Draft Commits Actions (LLM-based)
  generateDraftCommits: async (projectId, stagedOnly = false) => {
    set({ isGeneratingDrafts: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/draft-commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staged_only: stagedOnly }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to generate draft commits'))
      }
      const data: DraftCommitsResponse = await response.json()
      set({ draftCommits: data.drafts, isGeneratingDrafts: false })
      return data.drafts
    } catch (error) {
      set({ error: (error as Error).message, isGeneratingDrafts: false })
      return []
    }
  },

  clearDraftCommits: () => set({ draftCommits: [] }),

  // Git Repository Actions
  fetchRepositories: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/repositories`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch repositories'))
      }
      const data = await response.json()
      set({ repositories: data.repositories, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createRepository: async (name, path, description = '') => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, description }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create repository'))
      }
      const repo = await response.json()
      await get().fetchRepositories()
      set({ isLoading: false })
      return repo
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  updateRepository: async (repoId, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/repositories/${repoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to update repository'))
      }
      await get().fetchRepositories()
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  deleteRepository: async (repoId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/repositories/${repoId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to delete repository'))
      }
      await get().fetchRepositories()
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

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
      analytics.track('git_branch_created', { project_id: projectId, branch_name: name })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  checkoutBranch: async (projectId, name) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}/checkout`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to checkout branch'))
      }
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  deleteBranch: async (projectId, name, force = false, deleteRemote = false) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams({ force: String(force), delete_remote: String(deleteRemote) })
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}?${params}`,
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

  fetchCommitFiles: async (projectId, sha) => {
    // Return cached if available
    const cached = get().commitFiles[sha]
    if (cached) return cached

    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/commits/${sha}/files`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch commit files'))
      }
      const files: CommitFile[] = await response.json()
      set({ commitFiles: { ...get().commitFiles, [sha]: files } })
      return files
    } catch (error) {
      set({ error: (error as Error).message })
      return []
    }
  },

  fetchCommitDiff: async (projectId, sha, filePath) => {
    const key = filePath ? `${sha}:${filePath}` : sha
    const cached = get().commitDiff[key]
    if (cached) return cached

    try {
      const params = new URLSearchParams()
      if (filePath) params.set('file_path', filePath)

      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/commits/${sha}/diff?${params}`
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch commit diff'))
      }
      const data = await response.json()
      set({ commitDiff: { ...get().commitDiff, [key]: data.diff } })
      return data.diff as string
    } catch (error) {
      set({ error: (error as Error).message })
      return ''
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

  executeMerge: async (projectId, source, target, message, userRole = 'member') => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams({ user_role: userRole })
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge?${params}`, {
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

  // Conflict Resolution Actions
  fetchConflictFiles: async (projectId, source, target) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams({
        source_branch: source,
        target_branch: target,
      })
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge/conflicts?${params}`
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch conflict files'))
      }
      const files: ConflictFile[] = await response.json()
      set({ conflictFiles: files, isLoading: false })
      return files
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return []
    }
  },

  fetchMergeStatus: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge/status`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch merge status'))
      }
      const status: MergeStatus = await response.json()
      set({ mergeStatus: status })
      return status
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  resolveConflict: async (projectId, request) => {
    set({ isResolvingConflict: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to resolve conflict'))
      }
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
  },

  abortMerge: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/merge/abort`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to abort merge'))
      }
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
  },

  completeMerge: async (projectId, message) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (message) params.set('message', message)

      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge/complete?${params}`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to complete merge'))
      }
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
  },

  clearConflictState: () => set({
    conflictFiles: [],
    mergeStatus: null,
    isResolvingConflict: false,
  }),

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

  createMergeRequest: async (projectId, title, source, target, description = '', autoMerge = false) => {
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
          auto_merge: autoMerge,
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

  mergeMergeRequest: async (projectId, mrId, userId, userRole = 'member') => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/merge-requests/${mrId}/merge?user_id=${userId}&user_role=${userRole}`,
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

  // Remote Management
  fetchRemotes: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/remotes`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch remotes'))
      }
      const data = await response.json()
      set({ remotes: data.remotes, isLoading: false })

      // Auto-detect GitHub repo from origin remote
      if (!get().githubRepo) {
        const origin = (data.remotes as GitRemote[]).find((r: GitRemote) => r.name === 'origin')
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
  },

  addRemote: async (projectId, name, url) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/remotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to add remote'))
      }
      await get().fetchRemotes(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  removeRemote: async (projectId, remoteName) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/remotes/${encodeURIComponent(remoteName)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to remove remote'))
      }
      await get().fetchRemotes(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  updateRemote: async (projectId, remoteName, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/remotes/${encodeURIComponent(remoteName)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to update remote'))
      }
      await get().fetchRemotes(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Remote Operations
  fetchRemote: async (projectId, remote) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (remote) params.set('remote', remote)

      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/fetch?${params}`, {
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

  pullRemote: async (projectId, branch, remote) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      if (remote) params.set('remote', remote)

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

  pushRemote: async (projectId, branch, remote) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      if (remote) params.set('remote', remote)

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

  // Branch Protection
  fetchBranchProtectionRules: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/branch-protection`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch branch protection rules'))
      }
      const data = await response.json()
      set({ branchProtectionRules: data.rules, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createBranchProtectionRule: async (projectId, rule) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/git/projects/${projectId}/branch-protection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create rule'))
      }
      await get().fetchBranchProtectionRules(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  updateBranchProtectionRule: async (projectId, ruleId, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/branch-protection/${ruleId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to update rule'))
      }
      await get().fetchBranchProtectionRules(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  deleteBranchProtectionRule: async (projectId, ruleId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/api/git/projects/${projectId}/branch-protection/${ruleId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to delete rule'))
      }
      await get().fetchBranchProtectionRules(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },
}))
