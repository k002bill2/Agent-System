import { create } from 'zustand'
import { extractGitHubRepo } from '../../utils/gitUtils'
import { analytics } from '../../services/analytics'
import { apiClient } from '../../services/apiClient'
import {
  appendWorktreePath,
  GIT_DRAFT_COMMITS_TIMEOUT_MS,
  GIT_LONG_RUNNING_READ_TIMEOUT_MS,
  GIT_REMOTE_OPERATION_TIMEOUT_MS,
} from './types'
import type {
  BranchProtectionRule,
  CommitFile,
  ConflictFile,
  DiffHunk,
  DraftCommitsResponse,
  FileDiffResponse,
  GitBranch,
  GitCommit,
  GitHubPRReview,
  GitHubPullRequest,
  GitRemote,
  GitRepository,
  GitState,
  GitStatus,
  GitWorkingStatus,
  GitWorktree,
  MergePreview,
  MergeRequest,
  MergeStatus,
  PruneExecuteResult,
} from './types'

// 소비자 실측(2026-08-08): 브리프의 22개 목록 + tsc가 잡아낸 누락 4개
// (PruneCandidate · PruneSkipReason · PruneSkipped · ResolutionStrategy).
export type {
  BranchProtectionRule,
  CommitFile,
  ConflictFile,
  ConflictStatus,
  DiffHunk,
  DraftCommit,
  FileStatusType,
  GitBranch,
  GitCommit,
  GitHubPRReview,
  GitHubPullRequest,
  GitRemote,
  GitStatus,
  GitStatusFile,
  GitTab,
  GitWorkingStatus,
  GitWorktree,
  MergePreview,
  MergeRequest,
  MergeRequestStatus,
  MergeStatus,
  PruneCandidate,
  PruneExecuteResult,
  PruneSkipReason,
  PruneSkipped,
  ResolutionStrategy,
} from './types'

export const useGitStore = create<GitState>((set, get) => ({
  // Initial State
  activeTab: 'changes',
  selectedProjectId: null,
  isLoading: false,
  error: null,

  gitStatus: null,
  worktrees: [],
  selectedWorktreePath: null,
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

  // Staging Area Enhancement
  fileDiffs: {},
  isLoadingDiff: false,
  stagedDiff: null,
  fileHunks: {},

  // Commit Detail
  commitFiles: {},
  commitDiff: {},

  // UI Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProject: (projectId) => set({ selectedProjectId: projectId, gitStatus: null, worktrees: [], selectedWorktreePath: null }),
  setGitHubRepo: (repo) => set({ githubRepo: repo }),
  clearError: () => set({ error: null }),

  // Worktree Actions
  fetchWorktrees: async (projectId) => {
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
  },

  setSelectedWorktree: (path) => set({ selectedWorktreePath: path }),

  // Git Status Actions
  fetchGitStatus: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const status = await apiClient.get<GitStatus>(`/api/git/projects/${projectId}/status`)
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
      const status = await apiClient.put<GitStatus>(`/api/git/projects/${projectId}/git-path`, { git_path: gitPath })
      set({ gitStatus: status, isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Working Directory Actions
  fetchWorkingStatus: async (projectId) => {
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
  },

  stageFiles: async (projectId, paths = [], all = false) => {
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
  },

  unstageFiles: async (projectId, paths = [], all = false) => {
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
  },

  commitChanges: async (projectId, message, authorName, authorEmail) => {
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

  // Staging Area Enhancement Actions
  fetchFileDiff: async (projectId, filePath, staged = false) => {
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
  },

  clearFileDiffs: () => set({ fileDiffs: {}, stagedDiff: null, fileHunks: {} }),

  fetchStagedDiff: async (projectId) => {
    try {
      const url = appendWorktreePath(`/api/git/projects/${projectId}/staged-diff`, get().selectedWorktreePath)
      const data = await apiClient.get<{ diff: string | null }>(url)
      set({ stagedDiff: data.diff })
      return data.diff
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  fetchFileHunks: async (projectId, filePath, staged = false) => {
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
  },

  stageHunks: async (projectId, filePath, hunkIndices) => {
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
  },

  // Draft Commits Actions (LLM-based)
  generateDraftCommits: async (projectId, stagedOnly = false) => {
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
  },

  clearDraftCommits: () => set({ draftCommits: [] }),

  // Git Repository Actions
  fetchRepositories: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<{ repositories: GitRepository[] }>('/api/git/repositories')
      set({ repositories: data.repositories, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createRepository: async (name, path, description = '') => {
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
  },

  updateRepository: async (repoId, updates) => {
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
  },

  deleteRepository: async (repoId) => {
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
  },

  // Branch Actions
  fetchBranches: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<{ branches: GitBranch[]; current_branch: string; protected_branches: string[] }>(
        `/api/git/projects/${projectId}/branches`,
        { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
      )
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
      await apiClient.post(`/api/git/projects/${projectId}/branches`, { name, start_point: startPoint })
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
      await apiClient.post(`/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}/checkout`)
      await get().fetchBranches(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  deleteBranch: async (projectId, name, force = false, deleteRemote = false, removeWorktree = false) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams({
        force: String(force),
        delete_remote: String(deleteRemote),
        remove_worktree: String(removeWorktree),
      })
      await apiClient.delete(`/api/git/projects/${projectId}/branches/${encodeURIComponent(name)}?${params}`)
      await Promise.all([
        get().fetchBranches(projectId),
        get().fetchWorktrees(projectId),
      ])
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  pruneMergedBranches: async (projectId, dryRun, extraProtected = []) => {
    set({ isLoading: true, error: null })
    try {
      const result = await apiClient.post<PruneExecuteResult>(
        `/api/git/projects/${projectId}/branches/prune-merged`,
        { dry_run: dryRun, extra_protected: extraProtected },
      )
      if (!dryRun) {
        await get().fetchBranches(projectId)
      }
      set({ isLoading: false })
      return result
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  // Commit Actions
  fetchCommits: async (projectId, branch, limit = 50) => {
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
  },

  fetchCommitFiles: async (projectId, sha) => {
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
  },

  fetchCommitDiff: async (projectId, sha, filePath) => {
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
  },

  // Merge Preview Actions
  previewMerge: async (projectId, source, target) => {
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
  },

  executeMerge: async (projectId, source, target, message, userRole = 'member') => {
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
      const files = await apiClient.get<ConflictFile[]>(`/api/git/projects/${projectId}/merge/conflicts?${params}`)
      set({ conflictFiles: files, isLoading: false })
      return files
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return []
    }
  },

  fetchMergeStatus: async (projectId) => {
    try {
      const status = await apiClient.get<MergeStatus>(`/api/git/projects/${projectId}/merge/status`)
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
  },

  abortMerge: async (projectId) => {
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
  },

  completeMerge: async (projectId, message) => {
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

      const data = await apiClient.get<{ merge_requests: MergeRequest[] }>(`/api/git/projects/${projectId}/merge-requests?${params}`)
      set({ mergeRequests: data.merge_requests, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createMergeRequest: async (projectId, title, source, target, description = '', autoMerge = false) => {
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
  },

  approveMergeRequest: async (projectId, mrId, userId) => {
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
  },

  mergeMergeRequest: async (projectId, mrId, userId, userRole = 'member') => {
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
  },

  closeMergeRequest: async (projectId, mrId, userId) => {
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
  },

  deleteMergeRequest: async (projectId, mrId) => {
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

      const data = await apiClient.get<{ pull_requests: GitHubPullRequest[] }>(`/api/git/github/${owner}/${repo}/pulls?${params}`)
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
      const pr = await apiClient.get<GitHubPullRequest>(`/api/git/github/${owner}/${repo}/pulls/${prNumber}`)
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
      const reviews = await apiClient.get<GitHubPRReview[]>(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`)
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
      await apiClient.post(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/merge`, { merge_method: method })
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
      await apiClient.post(`/api/git/github/${owner}/${repo}/pulls/${prNumber}/reviews`, { body, event })
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
  },

  addRemote: async (projectId, name, url) => {
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
  },

  removeRemote: async (projectId, remoteName) => {
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
  },

  updateRemote: async (projectId, remoteName, updates) => {
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
  },

  // Remote Operations
  fetchRemote: async (projectId, remote) => {
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
  },

  pullRemote: async (projectId, branch, remote) => {
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
  },

  pushRemote: async (projectId, branch, remote) => {
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
  },

  // Branch Protection
  fetchBranchProtectionRules: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<{ rules: BranchProtectionRule[] }>(
        `/api/git/projects/${projectId}/branch-protection`,
        { timeout: GIT_LONG_RUNNING_READ_TIMEOUT_MS }
      )
      set({ branchProtectionRules: data.rules, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createBranchProtectionRule: async (projectId, rule) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/api/git/projects/${projectId}/branch-protection`, rule)
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
      await apiClient.put(`/api/git/projects/${projectId}/branch-protection/${ruleId}`, updates)
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
      await apiClient.delete(`/api/git/projects/${projectId}/branch-protection/${ruleId}`)
      await get().fetchBranchProtectionRules(projectId)
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },
}))
