/** git 스토어의 타입 정의.
 *
 * `GitState` 는 패키지 내부 전용이지만, 액션을 모듈로 승격할 때(Task 5)
 * 각 도메인 모듈이 `SetFn`/`GetFn` 대신 이것을 직접 참조하므로 export 한다.
 * 타임아웃 상수 3개와 `appendWorktreePath` 헬퍼도 액션 모듈들이 공유하므로
 * 여기 둔다.
 */
export const GIT_LONG_RUNNING_READ_TIMEOUT_MS = 120_000
export const GIT_REMOTE_OPERATION_TIMEOUT_MS = 180_000
export const GIT_DRAFT_COMMITS_TIMEOUT_MS = 180_000

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

// =============================================================================
// Prune Merged Branches Types
// =============================================================================

export interface PruneCandidate {
  branch: string
  pr_number: number
  pr_url: string
  pr_title: string
  merged_at: string
  last_commit_sha: string
}

export type PruneSkipReason =
  | 'default_branch'
  | 'current_head'
  | 'unpushed_commits'
  | 'no_matching_pr'
  | 'protected_rule'

export interface PruneSkipped {
  branch: string
  reason: PruneSkipReason
}

export interface PruneExecuteResult {
  candidates: PruneCandidate[]
  skipped: PruneSkipped[]
  deleted: string[]
  errors: Array<{ branch: string; error: string }>
  // Set when the GitHub PR lookup itself failed (repo unresolved, bad token,
  // network) — distinguishes a real failure from a genuine "nothing to prune".
  scan_error?: string | null
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

export interface GitWorktree {
  path: string
  branch: string | null
  head_sha: string
  is_main: boolean
  is_detached: boolean
  is_locked: boolean
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

// Staging Area Enhancement Types
export interface FileDiffResponse {
  file_path: string
  diff: string
  staged: boolean
}

export interface DiffHunk {
  index: number
  header: string
  content: string
  old_start: number
  old_count: number
  new_start: number
  new_count: number
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

export interface GitState {
  // UI State
  activeTab: GitTab
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null

  // Git Status (for project configuration)
  gitStatus: GitStatus | null

  // Worktree
  worktrees: GitWorktree[]
  selectedWorktreePath: string | null

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

  // Staging Area Enhancement
  fileDiffs: Record<string, string>  // path -> diff content
  isLoadingDiff: boolean
  stagedDiff: string | null
  fileHunks: Record<string, DiffHunk[]>  // path -> hunks

  // Commit Detail
  commitFiles: Record<string, CommitFile[]>  // sha -> files
  commitDiff: Record<string, string>  // sha -> diff or sha:path -> diff

  // Actions - UI
  setActiveTab: (tab: GitTab) => void
  setSelectedProject: (projectId: string | null) => void
  setGitHubRepo: (repo: string | null) => void
  clearError: () => void

  // Actions - Worktree
  fetchWorktrees: (projectId: string) => Promise<void>
  setSelectedWorktree: (path: string | null) => void

  // Actions - Git Status
  fetchGitStatus: (projectId: string) => Promise<GitStatus | null>
  updateGitPath: (projectId: string, gitPath: string | null) => Promise<boolean>

  // Actions - Working Directory
  fetchWorkingStatus: (projectId: string) => Promise<GitWorkingStatus | null>
  stageFiles: (projectId: string, paths?: string[], all?: boolean) => Promise<boolean>
  unstageFiles: (projectId: string, paths?: string[], all?: boolean) => Promise<boolean>
  commitChanges: (projectId: string, message: string, authorName?: string, authorEmail?: string) => Promise<boolean>
  commitAndPush: (projectId: string, message: string, authorName?: string, authorEmail?: string) => Promise<boolean>

  // Actions - Staging Area Enhancement
  fetchFileDiff: (projectId: string, filePath: string, staged?: boolean) => Promise<string>
  clearFileDiffs: () => void
  fetchStagedDiff: (projectId: string) => Promise<string | null>
  fetchFileHunks: (projectId: string, filePath: string, staged?: boolean) => Promise<DiffHunk[]>
  stageHunks: (projectId: string, filePath: string, hunkIndices: number[]) => Promise<boolean>

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
  deleteBranch: (projectId: string, name: string, force?: boolean, deleteRemote?: boolean, removeWorktree?: boolean) => Promise<boolean>
  pruneMergedBranches: (projectId: string, dryRun: boolean, extraProtected?: string[]) => Promise<PruneExecuteResult | null>

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
  deleteMergeRequest: (projectId: string, mrId: string) => Promise<boolean>

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
// Store
// =============================================================================

/** Append worktree_path query parameter to a URL if a worktree is selected. */
export function appendWorktreePath(url: string, worktreePath: string | null): string {
  if (!worktreePath) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}worktree_path=${encodeURIComponent(worktreePath)}`
}
