import { create } from 'zustand'
import type { GitState } from './types'
import * as branchProtection from './branchProtection'
import * as branches from './branches'
import * as commits from './commits'
import * as github from './github'
import * as merge from './merge'
import * as mergeRequests from './mergeRequests'
import * as remotes from './remotes'
import * as repositories from './repositories'
import * as staging from './staging'
import * as workspace from './workspace'

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
  setActiveTab: (tab) => workspace.setActiveTab(set, get, tab),
  setSelectedProject: (projectId) => workspace.setSelectedProject(set, get, projectId),
  setGitHubRepo: (repo) => workspace.setGitHubRepo(set, get, repo),
  clearError: () => workspace.clearError(set, get),

  // Worktree Actions
  fetchWorktrees: (projectId) => workspace.fetchWorktrees(set, get, projectId),
  setSelectedWorktree: (path) => workspace.setSelectedWorktree(set, get, path),

  // Git Status Actions
  fetchGitStatus: (projectId) => workspace.fetchGitStatus(set, get, projectId),
  updateGitPath: (projectId, gitPath) => workspace.updateGitPath(set, get, projectId, gitPath),

  // Working Directory Actions
  fetchWorkingStatus: (projectId) => workspace.fetchWorkingStatus(set, get, projectId),

  stageFiles: (projectId, paths, all) => staging.stageFiles(set, get, projectId, paths, all),
  unstageFiles: (projectId, paths, all) => staging.unstageFiles(set, get, projectId, paths, all),
  commitChanges: (projectId, message, authorName, authorEmail) =>
    staging.commitChanges(set, get, projectId, message, authorName, authorEmail),
  commitAndPush: (projectId, message, authorName, authorEmail) =>
    staging.commitAndPush(set, get, projectId, message, authorName, authorEmail),

  // Staging Area Enhancement Actions
  fetchFileDiff: (projectId, filePath, staged) => staging.fetchFileDiff(set, get, projectId, filePath, staged),
  clearFileDiffs: () => staging.clearFileDiffs(set, get),
  fetchStagedDiff: (projectId) => staging.fetchStagedDiff(set, get, projectId),
  fetchFileHunks: (projectId, filePath, staged) => staging.fetchFileHunks(set, get, projectId, filePath, staged),
  stageHunks: (projectId, filePath, hunkIndices) => staging.stageHunks(set, get, projectId, filePath, hunkIndices),

  // Draft Commits Actions (LLM-based)
  generateDraftCommits: (projectId, stagedOnly) => staging.generateDraftCommits(set, get, projectId, stagedOnly),
  clearDraftCommits: () => staging.clearDraftCommits(set, get),

  // Git Repository Actions
  fetchRepositories: () => repositories.fetchRepositories(set, get),
  createRepository: (name, path, description) => repositories.createRepository(set, get, name, path, description),
  updateRepository: (repoId, updates) => repositories.updateRepository(set, get, repoId, updates),
  deleteRepository: (repoId) => repositories.deleteRepository(set, get, repoId),

  // Branch Actions
  fetchBranches: (projectId) => branches.fetchBranches(set, get, projectId),
  createBranch: (projectId, name, startPoint) => branches.createBranch(set, get, projectId, name, startPoint),
  checkoutBranch: (projectId, name) => branches.checkoutBranch(set, get, projectId, name),
  deleteBranch: (projectId, name, force, deleteRemote, removeWorktree) =>
    branches.deleteBranch(set, get, projectId, name, force, deleteRemote, removeWorktree),
  pruneMergedBranches: (projectId, dryRun, extraProtected) =>
    branches.pruneMergedBranches(set, get, projectId, dryRun, extraProtected),

  // Commit Actions
  fetchCommits: (projectId, branch, limit) => commits.fetchCommits(set, get, projectId, branch, limit),
  fetchCommitFiles: (projectId, sha) => commits.fetchCommitFiles(set, get, projectId, sha),
  fetchCommitDiff: (projectId, sha, filePath) => commits.fetchCommitDiff(set, get, projectId, sha, filePath),

  // Merge Preview Actions
  previewMerge: (projectId, source, target) => merge.previewMerge(set, get, projectId, source, target),
  executeMerge: (projectId, source, target, message, userRole) =>
    merge.executeMerge(set, get, projectId, source, target, message, userRole),
  clearMergePreview: () => merge.clearMergePreview(set, get),

  // Conflict Resolution Actions
  fetchConflictFiles: (projectId, source, target) => merge.fetchConflictFiles(set, get, projectId, source, target),
  fetchMergeStatus: (projectId) => merge.fetchMergeStatus(set, get, projectId),
  resolveConflict: (projectId, request) => merge.resolveConflict(set, get, projectId, request),
  abortMerge: (projectId) => merge.abortMerge(set, get, projectId),
  completeMerge: (projectId, message) => merge.completeMerge(set, get, projectId, message),
  clearConflictState: () => merge.clearConflictState(set, get),

  // Merge Request Actions
  fetchMergeRequests: (projectId, status) => mergeRequests.fetchMergeRequests(set, get, projectId, status),
  createMergeRequest: (projectId, title, source, target, description, autoMerge) =>
    mergeRequests.createMergeRequest(set, get, projectId, title, source, target, description, autoMerge),
  approveMergeRequest: (projectId, mrId, userId) =>
    mergeRequests.approveMergeRequest(set, get, projectId, mrId, userId),
  mergeMergeRequest: (projectId, mrId, userId, userRole) =>
    mergeRequests.mergeMergeRequest(set, get, projectId, mrId, userId, userRole),
  closeMergeRequest: (projectId, mrId, userId) =>
    mergeRequests.closeMergeRequest(set, get, projectId, mrId, userId),
  deleteMergeRequest: (projectId, mrId) => mergeRequests.deleteMergeRequest(set, get, projectId, mrId),

  // GitHub PR Actions
  fetchPullRequests: (state, base) => github.fetchPullRequests(set, get, state, base),
  fetchPullRequest: (prNumber) => github.fetchPullRequest(set, get, prNumber),
  fetchPRReviews: (prNumber) => github.fetchPRReviews(set, get, prNumber),
  mergePullRequest: (prNumber, method) => github.mergePullRequest(set, get, prNumber, method),
  createPRReview: (prNumber, body, event) => github.createPRReview(set, get, prNumber, body, event),

  // Remote Management
  fetchRemotes: (projectId) => remotes.fetchRemotes(set, get, projectId),
  addRemote: (projectId, name, url) => remotes.addRemote(set, get, projectId, name, url),
  removeRemote: (projectId, remoteName) => remotes.removeRemote(set, get, projectId, remoteName),
  updateRemote: (projectId, remoteName, updates) => remotes.updateRemote(set, get, projectId, remoteName, updates),

  // Remote Operations
  fetchRemote: (projectId, remote) => remotes.fetchRemote(set, get, projectId, remote),
  pullRemote: (projectId, branch, remote) => remotes.pullRemote(set, get, projectId, branch, remote),
  pushRemote: (projectId, branch, remote) => remotes.pushRemote(set, get, projectId, branch, remote),

  // Branch Protection
  fetchBranchProtectionRules: (projectId) => branchProtection.fetchBranchProtectionRules(set, get, projectId),
  createBranchProtectionRule: (projectId, rule) =>
    branchProtection.createBranchProtectionRule(set, get, projectId, rule),
  updateBranchProtectionRule: (projectId, ruleId, updates) =>
    branchProtection.updateBranchProtectionRule(set, get, projectId, ruleId, updates),
  deleteBranchProtectionRule: (projectId, ruleId) =>
    branchProtection.deleteBranchProtectionRule(set, get, projectId, ruleId),
}))
