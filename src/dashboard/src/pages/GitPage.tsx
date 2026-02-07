import { useEffect, useState } from 'react'
import {
  GitBranch,
  GitPullRequest,
  GitMerge,
  History,
  RefreshCw,
  Download,
  Upload,
  AlertCircle,
  FileEdit,
  Cloud,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useGitStore, GitTab } from '../stores/git'
import { useProjectsStore } from '../stores/projects'
import { useAuthStore } from '../stores/auth'
import { useOrganizationsStore, MemberRole } from '../stores/organizations'
import {
  BranchList,
  MergeRequestList,
  MergePreviewPanel,
  PullRequestList,
  PRReviewPanel,
  CommitHistory,
  GitSetup,
  WorkingDirectory,
  RemoteList,
} from '../components/git'

const tabs: { id: GitTab; label: string; icon: typeof GitBranch }[] = [
  { id: 'changes', label: 'Changes', icon: FileEdit },
  { id: 'branches', label: 'Branches', icon: GitBranch },
  { id: 'merge-requests', label: 'Merge Requests', icon: GitMerge },
  { id: 'pull-requests', label: 'Pull Requests', icon: GitPullRequest },
  { id: 'history', label: 'History', icon: History },
  { id: 'remotes', label: 'Remotes', icon: Cloud },
]

export function GitPage() {
  const {
    activeTab,
    setActiveTab,
    selectedProjectId,
    setSelectedProject,
    isLoading,
    error,
    clearError,
    // Git Status
    gitStatus,
    fetchGitStatus,
    updateGitPath,
    // Branches
    branches,
    currentBranch,
    protectedBranches,
    fetchBranches,
    createBranch,
    deleteBranch,
    // Commits
    commits,
    fetchCommits,
    fetchCommitFiles,
    fetchCommitDiff,
    commitFiles,
    commitDiff,
    // Merge
    mergePreview,
    previewMerge,
    executeMerge,
    clearMergePreview,
    // Merge Requests
    mergeRequests,
    fetchMergeRequests,
    createMergeRequest,
    approveMergeRequest,
    mergeMergeRequest,
    closeMergeRequest,
    // GitHub PRs
    pullRequests,
    selectedPullRequest,
    prReviews,
    githubRepo,
    setGitHubRepo,
    fetchPullRequests,
    fetchPullRequest,
    fetchPRReviews,
    mergePullRequest,
    createPRReview,
    // Remote Management
    remotes,
    fetchRemotes,
    addRemote,
    removeRemote,
    updateRemote,
    // Remote Operations
    fetchRemote,
    pullRemote,
    pushRemote,
    // Working Directory
    workingStatus,
    fetchWorkingStatus,
    stageFiles,
    commitChanges,
    // Draft Commits (LLM-based)
    draftCommits,
    isGeneratingDrafts,
    generateDraftCommits,
    clearDraftCommits,
  } = useGitStore()

  const { projects, fetchProjects, selectedProjectId: globalSelectedProjectId } = useProjectsStore()
  const { user } = useAuthStore()
  const {
    currentOrganization,
    fetchUserMemberships,
    getCurrentUserRole,
  } = useOrganizationsStore()

  const [showMergePreview, setShowMergePreview] = useState(false)
  const [mergeSource, setMergeSource] = useState<string | null>(null)
  const [showCreateMR, setShowCreateMR] = useState(false)
  const [showPRReview, setShowPRReview] = useState(false)
  const [userRole, setUserRole] = useState<MemberRole>('viewer')

  // Current user info
  const currentUserId = user?.id || 'anonymous'

  // Fetch user memberships and determine role from organization
  useEffect(() => {
    if (user?.id) {
      fetchUserMemberships(user.id)
    }
  }, [user?.id, fetchUserMemberships])

  // Update userRole when organization or user changes
  useEffect(() => {
    if (user?.id && currentOrganization) {
      const role = getCurrentUserRole(currentOrganization.id, user.id)
      setUserRole(role || 'viewer')
    } else {
      // If no organization context, default to 'admin' to allow all git operations
      // This supports personal projects without organization setup
      setUserRole('admin')
    }
  }, [user?.id, currentOrganization, getCurrentUserRole])

  // Initialize
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Auto-select project
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProject(globalSelectedProjectId || projects[0].id)
    }
  }, [selectedProjectId, projects, globalSelectedProjectId, setSelectedProject])

  // Fetch git status when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchGitStatus(selectedProjectId)
    }
  }, [selectedProjectId, fetchGitStatus])

  // Load data when project changes and git is enabled
  useEffect(() => {
    if (selectedProjectId && gitStatus?.is_valid_repo) {
      fetchBranches(selectedProjectId)
      fetchMergeRequests(selectedProjectId)
      fetchCommits(selectedProjectId)
      fetchWorkingStatus(selectedProjectId)
      fetchRemotes(selectedProjectId)
    }
  }, [selectedProjectId, gitStatus?.is_valid_repo, fetchBranches, fetchMergeRequests, fetchCommits, fetchWorkingStatus, fetchRemotes])

  // Handle merge click from branch list
  const handleMergeClick = async (source: string) => {
    if (!selectedProjectId) return
    setMergeSource(source)
    await previewMerge(selectedProjectId, source, 'main')
    setShowMergePreview(true)
  }

  // Handle merge execution
  const handleMerge = async (message?: string) => {
    if (!selectedProjectId || !mergeSource) return false
    return executeMerge(selectedProjectId, mergeSource, 'main', message, userRole)
  }

  // Handle create MR from merge preview
  const handleCreateMRFromPreview = async (title: string, description: string) => {
    if (!selectedProjectId || !mergeSource) return false
    return createMergeRequest(selectedProjectId, title, mergeSource, 'main', description)
  }

  // Handle remote operations
  const handleFetch = () => selectedProjectId && fetchRemote(selectedProjectId)
  const handlePull = () => selectedProjectId && pullRemote(selectedProjectId)
  const handlePush = () => selectedProjectId && pushRemote(selectedProjectId)

  // Handle PR view details
  const handleViewPRDetails = async (prNumber: number) => {
    await fetchPullRequest(prNumber)
    await fetchPRReviews(prNumber)
    setShowPRReview(true)
  }

  // Handle PR merge
  const handleMergePR = async (prNumber: number) => {
    return mergePullRequest(prNumber)
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          {/* Project Selector */}
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Select Project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {selectedProject && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Current: <span className="font-mono">{currentBranch}</span>
            </span>
          )}
        </div>

        {/* Remote Operations */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetch}
            disabled={isLoading || !selectedProjectId || !gitStatus?.is_valid_repo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Fetch from remote"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Fetch
          </button>
          <button
            onClick={handlePull}
            disabled={isLoading || !selectedProjectId || !gitStatus?.is_valid_repo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Pull from remote"
          >
            <Download className="w-4 h-4" />
            Pull
          </button>
          <button
            onClick={handlePush}
            disabled={isLoading || !selectedProjectId || !gitStatus?.is_valid_repo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Push to remote"
          >
            <Upload className="w-4 h-4" />
            Push
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs - only show when git is enabled */}
      {gitStatus?.is_valid_repo && (
        <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/10'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedProjectId ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>프로젝트를 선택하세요</p>
          </div>
        ) : !gitStatus?.is_valid_repo ? (
          /* Show Git Setup when git is not configured */
          <GitSetup
            projectId={selectedProjectId}
            projectName={selectedProject?.name || selectedProjectId}
            projectPath={selectedProject?.path || ''}
            gitStatus={gitStatus}
            isLoading={isLoading}
            onUpdateGitPath={(gitPath) => updateGitPath(selectedProjectId, gitPath)}
          />
        ) : (
          <>
            {activeTab === 'changes' && (
              <WorkingDirectory
                workingStatus={workingStatus}
                isLoading={isLoading}
                onRefresh={() => fetchWorkingStatus(selectedProjectId)}
                onStageFiles={(paths) => stageFiles(selectedProjectId, paths)}
                onStageAll={() => stageFiles(selectedProjectId, [], true)}
                onCommit={(message) => commitChanges(selectedProjectId, message)}
                // LLM Draft Commits
                draftCommits={draftCommits}
                isGeneratingDrafts={isGeneratingDrafts}
                onGenerateDrafts={() => generateDraftCommits(selectedProjectId)}
                onClearDrafts={clearDraftCommits}
              />
            )}

            {activeTab === 'branches' && (
              <BranchList
                branches={branches}
                currentBranch={currentBranch}
                protectedBranches={protectedBranches}
                isLoading={isLoading}
                onCreateBranch={(name, startPoint) =>
                  createBranch(selectedProjectId, name, startPoint)
                }
                onDeleteBranch={(name, force) => deleteBranch(selectedProjectId, name, force)}
                onMergeClick={handleMergeClick}
                onRefresh={() => fetchBranches(selectedProjectId)}
              />
            )}

            {activeTab === 'merge-requests' && (
              <MergeRequestList
                mergeRequests={mergeRequests}
                currentUserId={currentUserId}
                userRole={userRole}
                onApprove={(mrId) => approveMergeRequest(selectedProjectId, mrId, currentUserId)}
                onMerge={(mrId) => mergeMergeRequest(selectedProjectId, mrId, currentUserId)}
                onClose={(mrId) => closeMergeRequest(selectedProjectId, mrId, currentUserId)}
                onCreateNew={() => setShowCreateMR(true)}
              />
            )}

            {activeTab === 'pull-requests' && (
              <PullRequestList
                pullRequests={pullRequests}
                isLoading={isLoading}
                githubRepo={githubRepo}
                onSetRepo={setGitHubRepo}
                onRefresh={fetchPullRequests}
                onViewDetails={handleViewPRDetails}
                onMerge={handleMergePR}
              />
            )}

            {activeTab === 'history' && (
              <CommitHistory
                commits={commits}
                branch={currentBranch}
                isLoading={isLoading}
                hasMore={commits.length >= 50}
                onLoadMore={() => fetchCommits(selectedProjectId, undefined, commits.length + 50)}
                onFetchFiles={(sha) => fetchCommitFiles(selectedProjectId, sha)}
                onFetchDiff={(sha, filePath) => fetchCommitDiff(selectedProjectId, sha, filePath)}
                commitFiles={commitFiles}
                commitDiff={commitDiff}
              />
            )}

            {activeTab === 'remotes' && (
              <RemoteList
                remotes={remotes}
                isLoading={isLoading}
                onAddRemote={(name, url) => addRemote(selectedProjectId, name, url)}
                onRemoveRemote={(name) => removeRemote(selectedProjectId, name)}
                onUpdateRemote={(name, updates) => updateRemote(selectedProjectId, name, updates)}
                onFetch={(remote) => fetchRemote(selectedProjectId, remote)}
                onPull={(branch, remote) => pullRemote(selectedProjectId, branch, remote)}
                onPush={(branch, remote) => pushRemote(selectedProjectId, branch, remote)}
                onRefresh={() => fetchRemotes(selectedProjectId)}
              />
            )}
          </>
        )}
      </div>

      {/* Merge Preview Modal */}
      {showMergePreview && mergeSource && (
        <MergePreviewPanel
          preview={mergePreview}
          isLoading={isLoading}
          canMerge={['owner', 'admin'].includes(userRole)}
          onMerge={handleMerge}
          onClose={() => {
            setShowMergePreview(false)
            setMergeSource(null)
            clearMergePreview()
          }}
          onCreateMR={handleCreateMRFromPreview}
        />
      )}

      {/* Create MR Modal */}
      {showCreateMR && selectedProjectId && (
        <CreateMergeRequestModal
          branches={branches.filter((b) => !b.is_remote)}
          currentBranch={currentBranch}
          onSubmit={async (title, source, target, description) => {
            const success = await createMergeRequest(
              selectedProjectId,
              title,
              source,
              target,
              description
            )
            if (success) {
              setShowCreateMR(false)
            }
            return success
          }}
          onClose={() => setShowCreateMR(false)}
        />
      )}

      {/* PR Review Modal */}
      {showPRReview && selectedPullRequest && (
        <PRReviewPanel
          pr={selectedPullRequest}
          reviews={prReviews}
          onClose={() => setShowPRReview(false)}
          onCreateReview={(body, event) => createPRReview(selectedPullRequest.number, body, event)}
          onMerge={(method) => mergePullRequest(selectedPullRequest.number, method)}
        />
      )}
    </div>
  )
}

// Create Merge Request Modal Component
interface CreateMergeRequestModalProps {
  branches: { name: string; is_current: boolean }[]
  currentBranch: string
  onSubmit: (title: string, source: string, target: string, description: string) => Promise<boolean>
  onClose: () => void
}

function CreateMergeRequestModal({
  branches,
  currentBranch,
  onSubmit,
  onClose,
}: CreateMergeRequestModalProps) {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState(currentBranch)
  const [target, setTarget] = useState('main')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit(title.trim(), source, target, description.trim())
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          New Merge Request
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Merge feature into main"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source Branch
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Branch
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {submitting ? 'Creating...' : 'Create MR'}
          </button>
        </div>
      </div>
    </div>
  )
}
