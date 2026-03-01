/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGitStore } from '../git'

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useGitStore.setState({
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
    conflictFiles: [],
    mergeStatus: null,
    isResolvingConflict: false,
    pullRequests: [],
    selectedPullRequest: null,
    prReviews: [],
    githubRepo: null,
    repositories: [],
    draftCommits: [],
    isGeneratingDrafts: false,
    remotes: [],
    branchProtectionRules: [],
    commitFiles: {},
    commitDiff: {},
  })
}

describe('git store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has changes as default tab', () => {
      expect(useGitStore.getState().activeTab).toBe('changes')
    })

    it('has no selected project', () => {
      expect(useGitStore.getState().selectedProjectId).toBeNull()
    })

    it('has default protected branches', () => {
      expect(useGitStore.getState().protectedBranches).toEqual(['main', 'master'])
    })

    it('has no github repo', () => {
      expect(useGitStore.getState().githubRepo).toBeNull()
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setActiveTab', () => {
      useGitStore.getState().setActiveTab('branches')
      expect(useGitStore.getState().activeTab).toBe('branches')
    })

    it('setSelectedProject clears gitStatus', () => {
      useGitStore.setState({ gitStatus: { project_id: 'p1' } as any })
      useGitStore.getState().setSelectedProject('p2')
      expect(useGitStore.getState().selectedProjectId).toBe('p2')
      expect(useGitStore.getState().gitStatus).toBeNull()
    })

    it('setGitHubRepo', () => {
      useGitStore.getState().setGitHubRepo('owner/repo')
      expect(useGitStore.getState().githubRepo).toBe('owner/repo')
    })

    it('clearError', () => {
      useGitStore.setState({ error: 'some error' })
      useGitStore.getState().clearError()
      expect(useGitStore.getState().error).toBeNull()
    })

    it('clearMergePreview', () => {
      useGitStore.setState({ mergePreview: {} as any })
      useGitStore.getState().clearMergePreview()
      expect(useGitStore.getState().mergePreview).toBeNull()
    })

    it('clearDraftCommits', () => {
      useGitStore.setState({ draftCommits: [{ message: 'test' } as any] })
      useGitStore.getState().clearDraftCommits()
      expect(useGitStore.getState().draftCommits).toEqual([])
    })

    it('clearConflictState', () => {
      useGitStore.setState({
        conflictFiles: [{ path: 'a.ts' } as any],
        mergeStatus: {} as any,
        isResolvingConflict: true,
      })
      useGitStore.getState().clearConflictState()
      expect(useGitStore.getState().conflictFiles).toEqual([])
      expect(useGitStore.getState().mergeStatus).toBeNull()
      expect(useGitStore.getState().isResolvingConflict).toBe(false)
    })
  })

  // ── fetchGitStatus ─────────────────────────────────────

  describe('fetchGitStatus', () => {
    it('fetches and stores git status', async () => {
      const status = { project_id: 'p1', git_enabled: true, is_valid_repo: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(status),
      })

      const result = await useGitStore.getState().fetchGitStatus('p1')

      expect(result).toEqual(status)
      expect(useGitStore.getState().gitStatus).toEqual(status)
      expect(useGitStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useGitStore.getState().fetchGitStatus('p1')

      expect(result).toBeNull()
      expect(useGitStore.getState().error).toBe('Not found')
    })
  })

  // ── updateGitPath ──────────────────────────────────────

  describe('updateGitPath', () => {
    it('updates git path and returns validity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ is_valid_repo: true, project_id: 'p1' }),
      })

      const result = await useGitStore.getState().updateGitPath('p1', '/new/path')

      expect(result).toBe(true)
      expect(useGitStore.getState().gitStatus?.is_valid_repo).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid path' }),
      })

      const result = await useGitStore.getState().updateGitPath('p1', '/bad')

      expect(result).toBe(false)
    })
  })

  // ── fetchWorkingStatus ─────────────────────────────────

  describe('fetchWorkingStatus', () => {
    it('fetches working status', async () => {
      const status = { branch: 'main', is_clean: true, total_changes: 0 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(status),
      })

      const result = await useGitStore.getState().fetchWorkingStatus('p1')

      expect(result).toEqual(status)
      expect(useGitStore.getState().workingStatus).toEqual(status)
    })
  })

  // ── stageFiles ─────────────────────────────────────────

  describe('stageFiles', () => {
    it('stages files and refreshes status', async () => {
      // stageFiles POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      // fetchWorkingStatus called after
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branch: 'main', is_clean: false }),
      })

      const result = await useGitStore.getState().stageFiles('p1', ['file.ts'])

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'Stage error' }),
      })

      const result = await useGitStore.getState().stageFiles('p1', ['bad.ts'])

      expect(result).toBe(false)
      expect(useGitStore.getState().error).toBe('Stage error')
    })
  })

  // ── commitChanges ──────────────────────────────────────

  describe('commitChanges', () => {
    it('commits and refreshes status + commits', async () => {
      // commit POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      // fetchWorkingStatus
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branch: 'main' }),
      })
      // fetchCommits
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ commits: [] }),
      })

      const result = await useGitStore.getState().commitChanges('p1', 'feat: add x')

      expect(result).toBe(true)
      expect(useGitStore.getState().draftCommits).toEqual([])
    })
  })

  // ── generateDraftCommits ───────────────────────────────

  describe('generateDraftCommits', () => {
    it('generates and stores drafts', async () => {
      const drafts = [{ message: 'feat: add feature', files: ['a.ts'], type: 'feat', scope: null }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ drafts, total_files: 1 }),
      })

      const result = await useGitStore.getState().generateDraftCommits('p1')

      expect(result).toEqual(drafts)
      expect(useGitStore.getState().draftCommits).toEqual(drafts)
      expect(useGitStore.getState().isGeneratingDrafts).toBe(false)
    })

    it('returns empty on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Error' }),
      })

      const result = await useGitStore.getState().generateDraftCommits('p1')

      expect(result).toEqual([])
    })
  })

  // ── fetchRepositories ──────────────────────────────────

  describe('fetchRepositories', () => {
    it('fetches repositories', async () => {
      const repos = [{ id: 'r1', name: 'Repo 1' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ repositories: repos }),
      })

      await useGitStore.getState().fetchRepositories()

      expect(useGitStore.getState().repositories).toEqual(repos)
    })
  })

  // ── createRepository ───────────────────────────────────

  describe('createRepository', () => {
    it('creates repo and refreshes list', async () => {
      const newRepo = { id: 'r1', name: 'New' }
      // create POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newRepo),
      })
      // fetchRepositories
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ repositories: [newRepo] }),
      })

      const result = await useGitStore.getState().createRepository('New', '/path')

      expect(result).toEqual(newRepo)
    })

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Already exists' }),
      })

      const result = await useGitStore.getState().createRepository('Dup', '/path')

      expect(result).toBeNull()
    })
  })

  // ── fetchBranches ──────────────────────────────────────

  describe('fetchBranches', () => {
    it('fetches branches and current branch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          branches: [{ name: 'main' }, { name: 'dev' }],
          current_branch: 'main',
          protected_branches: ['main'],
        }),
      })

      await useGitStore.getState().fetchBranches('p1')

      expect(useGitStore.getState().branches).toHaveLength(2)
      expect(useGitStore.getState().currentBranch).toBe('main')
      expect(useGitStore.getState().protectedBranches).toEqual(['main'])
    })
  })

  // ── createBranch ───────────────────────────────────────

  describe('createBranch', () => {
    it('creates branch and refreshes', async () => {
      // create POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      // fetchBranches
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().createBranch('p1', 'feature/test')

      expect(result).toBe(true)
    })
  })

  // ── deleteBranch ───────────────────────────────────────

  describe('deleteBranch', () => {
    it('deletes branch and refreshes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().deleteBranch('p1', 'old-branch', true)

      expect(result).toBe(true)
    })
  })

  // ── fetchCommits ───────────────────────────────────────

  describe('fetchCommits', () => {
    it('fetches commits', async () => {
      const commits = [{ sha: 'abc123', message: 'init' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ commits }),
      })

      await useGitStore.getState().fetchCommits('p1', 'main')

      expect(useGitStore.getState().commits).toEqual(commits)
    })
  })

  // ── fetchCommitFiles ───────────────────────────────────

  describe('fetchCommitFiles', () => {
    it('fetches and caches commit files', async () => {
      const files = [{ path: 'file.ts', status: 'modified', additions: 5, deletions: 2 }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(files),
      })

      const result = await useGitStore.getState().fetchCommitFiles('p1', 'abc123')

      expect(result).toEqual(files)
      expect(useGitStore.getState().commitFiles['abc123']).toEqual(files)
    })

    it('returns cached files', async () => {
      useGitStore.setState({
        commitFiles: { abc123: [{ path: 'cached.ts' }] as any },
      })

      const result = await useGitStore.getState().fetchCommitFiles('p1', 'abc123')

      expect(result).toEqual([{ path: 'cached.ts' }])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ── fetchCommitDiff ────────────────────────────────────

  describe('fetchCommitDiff', () => {
    it('fetches and caches diff', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ diff: '--- a/file.ts\n+++ b/file.ts' }),
      })

      const result = await useGitStore.getState().fetchCommitDiff('p1', 'abc123')

      expect(result).toContain('file.ts')
      expect(useGitStore.getState().commitDiff['abc123']).toBeTruthy()
    })

    it('uses key with filePath', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ diff: 'diff content' }),
      })

      await useGitStore.getState().fetchCommitDiff('p1', 'abc123', 'src/file.ts')

      expect(useGitStore.getState().commitDiff['abc123:src/file.ts']).toBe('diff content')
    })

    it('returns cached diff', async () => {
      useGitStore.setState({ commitDiff: { abc123: 'cached diff' } })

      const result = await useGitStore.getState().fetchCommitDiff('p1', 'abc123')

      expect(result).toBe('cached diff')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ── previewMerge ───────────────────────────────────────

  describe('previewMerge', () => {
    it('fetches merge preview', async () => {
      const preview = { can_merge: true, files_changed: 5 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(preview),
      })

      const result = await useGitStore.getState().previewMerge('p1', 'feature', 'main')

      expect(result).toEqual(preview)
      expect(useGitStore.getState().mergePreview).toEqual(preview)
    })
  })

  // ── executeMerge ───────────────────────────────────────

  describe('executeMerge', () => {
    it('executes merge and refreshes branches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().executeMerge('p1', 'feature', 'main')

      expect(result).toBe(true)
      expect(useGitStore.getState().mergePreview).toBeNull()
    })
  })

  // ── Conflict Resolution ────────────────────────────────

  describe('conflict resolution', () => {
    it('fetchConflictFiles', async () => {
      const files = [{ path: 'conflict.ts', conflict_type: 'both_modified' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(files),
      })

      const result = await useGitStore.getState().fetchConflictFiles('p1', 'feature', 'main')

      expect(result).toEqual(files)
      expect(useGitStore.getState().conflictFiles).toEqual(files)
    })

    it('fetchMergeStatus', async () => {
      const status = { merge_in_progress: true, unmerged_files: ['a.ts'], can_commit: false }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(status),
      })

      const result = await useGitStore.getState().fetchMergeStatus('p1')

      expect(result).toEqual(status)
      expect(useGitStore.getState().mergeStatus).toEqual(status)
    })

    it('resolveConflict removes file from list', async () => {
      useGitStore.setState({
        conflictFiles: [
          { path: 'a.ts' } as any,
          { path: 'b.ts' } as any,
        ],
      })
      // resolve POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      // fetchMergeStatus
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ merge_in_progress: true }),
      })

      const result = await useGitStore.getState().resolveConflict('p1', {
        file_path: 'a.ts',
        strategy: 'ours',
        source_branch: 'feature',
        target_branch: 'main',
      })

      expect(result).toBe(true)
      expect(useGitStore.getState().conflictFiles).toHaveLength(1)
      expect(useGitStore.getState().conflictFiles[0].path).toBe('b.ts')
    })

    it('abortMerge clears conflict state', async () => {
      useGitStore.setState({
        conflictFiles: [{ path: 'a.ts' } as any],
        mergeStatus: {} as any,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await useGitStore.getState().abortMerge('p1')

      expect(result).toBe(true)
      expect(useGitStore.getState().conflictFiles).toEqual([])
      expect(useGitStore.getState().mergeStatus).toBeNull()
    })

    it('completeMerge clears state and refreshes branches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().completeMerge('p1', 'merge commit')

      expect(result).toBe(true)
    })
  })

  // ── Merge Requests ─────────────────────────────────────

  describe('merge requests', () => {
    it('fetchMergeRequests', async () => {
      const mrs = [{ id: 'mr-1', title: 'Feature' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ merge_requests: mrs }),
      })

      await useGitStore.getState().fetchMergeRequests('p1')

      expect(useGitStore.getState().mergeRequests).toEqual(mrs)
    })

    it('createMergeRequest', async () => {
      // create POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      // fetchMergeRequests
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ merge_requests: [] }),
      })

      const result = await useGitStore.getState().createMergeRequest(
        'p1', 'Feature', 'feature', 'main', 'desc'
      )

      expect(result).toBe(true)
    })

    it('approveMergeRequest', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ merge_requests: [] }),
      })

      const result = await useGitStore.getState().approveMergeRequest('p1', 'mr-1', 'u-1')

      expect(result).toBe(true)
    })
  })

  // ── GitHub PRs ─────────────────────────────────────────

  describe('GitHub PRs', () => {
    it('fetchPullRequests sets error without repo', async () => {
      await useGitStore.getState().fetchPullRequests()

      expect(useGitStore.getState().error).toContain('not configured')
    })

    it('fetchPullRequests fetches PRs', async () => {
      useGitStore.setState({ githubRepo: 'owner/repo' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pull_requests: [{ number: 1 }] }),
      })

      await useGitStore.getState().fetchPullRequests()

      expect(useGitStore.getState().pullRequests).toHaveLength(1)
    })

    it('fetchPullRequest', async () => {
      useGitStore.setState({ githubRepo: 'owner/repo' })
      const pr = { number: 1, title: 'PR' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(pr),
      })

      const result = await useGitStore.getState().fetchPullRequest(1)

      expect(result).toEqual(pr)
      expect(useGitStore.getState().selectedPullRequest).toEqual(pr)
    })

    it('fetchPullRequest returns null without repo', async () => {
      const result = await useGitStore.getState().fetchPullRequest(1)

      expect(result).toBeNull()
    })

    it('mergePullRequest', async () => {
      useGitStore.setState({ githubRepo: 'owner/repo' })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pull_requests: [] }),
      })

      const result = await useGitStore.getState().mergePullRequest(1, 'squash')

      expect(result).toBe(true)
    })

    it('createPRReview', async () => {
      useGitStore.setState({ githubRepo: 'owner/repo' })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      const result = await useGitStore.getState().createPRReview(1, 'LGTM', 'APPROVE')

      expect(result).toBe(true)
    })
  })

  // ── Remote Management ──────────────────────────────────

  describe('remote management', () => {
    it('fetchRemotes stores remotes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          remotes: [{ name: 'origin', url: 'https://github.com/owner/repo.git' }],
        }),
      })

      await useGitStore.getState().fetchRemotes('p1')

      expect(useGitStore.getState().remotes).toHaveLength(1)
      // Auto-detects github repo
      expect(useGitStore.getState().githubRepo).toBe('owner/repo')
    })

    it('addRemote', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ remotes: [] }),
      })

      const result = await useGitStore.getState().addRemote('p1', 'upstream', 'https://example.com/repo.git')

      expect(result).toBe(true)
    })

    it('removeRemote', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ remotes: [] }),
      })

      const result = await useGitStore.getState().removeRemote('p1', 'upstream')

      expect(result).toBe(true)
    })
  })

  // ── Remote Operations ──────────────────────────────────

  describe('remote operations', () => {
    it('fetchRemote', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().fetchRemote('p1')

      expect(result).toBe(true)
    })

    it('pullRemote refreshes branches and commits', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ commits: [] }),
      })

      const result = await useGitStore.getState().pullRemote('p1', 'main')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('pushRemote', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ branches: [], current_branch: 'main', protected_branches: [] }),
      })

      const result = await useGitStore.getState().pushRemote('p1', 'main')

      expect(result).toBe(true)
    })

    it('fetchRemote handles failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'Remote not found' }),
      })

      const result = await useGitStore.getState().fetchRemote('p1', 'nonexistent')

      expect(result).toBe(false)
      expect(useGitStore.getState().error).toBe('Remote not found')
    })
  })

  // ── Branch Protection ──────────────────────────────────

  describe('branch protection', () => {
    it('fetchBranchProtectionRules', async () => {
      const rules = [{ id: 'rule-1', branch_pattern: 'main' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rules }),
      })

      await useGitStore.getState().fetchBranchProtectionRules('p1')

      expect(useGitStore.getState().branchProtectionRules).toEqual(rules)
    })

    it('createBranchProtectionRule', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rules: [] }),
      })

      const result = await useGitStore.getState().createBranchProtectionRule('p1', {
        branch_pattern: 'main',
        require_approvals: 1,
        require_no_conflicts: true,
        allowed_merge_roles: ['admin'],
        allow_force_push: false,
        allow_deletion: false,
        auto_deploy: false,
        deploy_workflow: null,
        enabled: true,
      })

      expect(result).toBe(true)
    })

    it('updateBranchProtectionRule', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rules: [] }),
      })

      const result = await useGitStore.getState().updateBranchProtectionRule(
        'p1', 'rule-1', { require_approvals: 2 }
      )

      expect(result).toBe(true)
    })

    it('deleteBranchProtectionRule', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rules: [] }),
      })

      const result = await useGitStore.getState().deleteBranchProtectionRule('p1', 'rule-1')

      expect(result).toBe(true)
    })
  })
})
