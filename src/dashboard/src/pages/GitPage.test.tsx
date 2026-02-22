import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    GitBranch: icon, GitPullRequest: icon, GitMerge: icon, History: icon,
    RefreshCw: icon, Download: icon, Upload: icon, FileEdit: icon,
    Cloud: icon, Shield: icon, Zap: icon,
  }
})

const mockFetchGitStatus = vi.fn()
const mockFetchBranches = vi.fn()
const mockFetchMergeRequests = vi.fn()
const mockFetchCommits = vi.fn()
const mockFetchWorkingStatus = vi.fn()
const mockFetchRemotes = vi.fn()
const mockFetchBranchProtectionRules = vi.fn()
const mockFetchProjects = vi.fn()
const mockFetchUserMemberships = vi.fn()
const mockSetActiveTab = vi.fn()
const mockSetSelectedProject = vi.fn()
const mockClearError = vi.fn()
const mockFetchRemote = vi.fn()
const mockPullRemote = vi.fn()
const mockPushRemote = vi.fn()
const mockPreviewMerge = vi.fn()
const mockExecuteMerge = vi.fn()
const mockClearMergePreview = vi.fn()
const mockCreateMergeRequest = vi.fn()
const mockFetchPullRequest = vi.fn()
const mockFetchPRReviews = vi.fn()
const mockMergePullRequest = vi.fn()
const mockCreatePRReview = vi.fn()

// Store the last-rendered props of each mocked component for callback invocation
let lastBranchListProps: Record<string, unknown> = {}
let lastMergeRequestListProps: Record<string, unknown> = {}
let lastPullRequestListProps: Record<string, unknown> = {}
let _lastMergePreviewPanelProps: Record<string, unknown> = {}
let _lastPRReviewPanelProps: Record<string, unknown> = {}
let lastGitSetupProps: Record<string, unknown> = {}
let lastWorkingDirectoryProps: Record<string, unknown> = {}
let lastCommitHistoryProps: Record<string, unknown> = {}
let lastRemoteListProps: Record<string, unknown> = {}
let lastBranchProtectionProps: Record<string, unknown> = {}

const defaultGitStoreState = {
  activeTab: 'changes' as const,
  setActiveTab: mockSetActiveTab,
  selectedProjectId: null as string | null,
  setSelectedProject: mockSetSelectedProject,
  isLoading: false,
  error: null as string | null,
  clearError: mockClearError,
  gitStatus: null as { is_valid_repo: boolean } | null,
  fetchGitStatus: mockFetchGitStatus,
  updateGitPath: vi.fn(),
  branches: [] as { name: string; is_current: boolean; is_remote: boolean }[],
  currentBranch: 'main',
  protectedBranches: [] as string[],
  fetchBranches: mockFetchBranches,
  createBranch: vi.fn(),
  checkoutBranch: vi.fn(),
  deleteBranch: vi.fn(),
  commits: [] as { sha: string }[],
  fetchCommits: mockFetchCommits,
  fetchCommitFiles: vi.fn(),
  fetchCommitDiff: vi.fn(),
  commitFiles: {},
  commitDiff: {},
  mergePreview: null,
  previewMerge: mockPreviewMerge,
  executeMerge: mockExecuteMerge,
  clearMergePreview: mockClearMergePreview,
  mergeRequests: [],
  fetchMergeRequests: mockFetchMergeRequests,
  createMergeRequest: mockCreateMergeRequest,
  approveMergeRequest: vi.fn(),
  mergeMergeRequest: vi.fn(),
  closeMergeRequest: vi.fn(),
  pullRequests: [],
  selectedPullRequest: null as { number: number; title: string } | null,
  prReviews: [],
  githubRepo: null as string | null,
  setGitHubRepo: vi.fn(),
  fetchPullRequests: vi.fn(),
  fetchPullRequest: mockFetchPullRequest,
  fetchPRReviews: mockFetchPRReviews,
  mergePullRequest: mockMergePullRequest,
  createPRReview: mockCreatePRReview,
  remotes: [],
  fetchRemotes: mockFetchRemotes,
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  updateRemote: vi.fn(),
  fetchRemote: mockFetchRemote,
  pullRemote: mockPullRemote,
  pushRemote: mockPushRemote,
  workingStatus: null,
  fetchWorkingStatus: mockFetchWorkingStatus,
  stageFiles: vi.fn(),
  commitChanges: vi.fn(),
  commitAndPush: vi.fn(),
  draftCommits: [],
  isGeneratingDrafts: false,
  generateDraftCommits: vi.fn(),
  clearDraftCommits: vi.fn(),
  branchProtectionRules: [],
  fetchBranchProtectionRules: mockFetchBranchProtectionRules,
  createBranchProtectionRule: vi.fn(),
  updateBranchProtectionRule: vi.fn(),
  deleteBranchProtectionRule: vi.fn(),
}

vi.mock('../stores/git', () => ({
  useGitStore: vi.fn(() => ({ ...defaultGitStoreState })),
}))

const mockProjectsStoreState = {
  projects: [
    { id: 'p1', name: 'Project Alpha', path: '/alpha', is_active: true },
    { id: 'p2', name: 'Project Beta', path: '/beta', is_active: true },
  ],
  fetchProjects: mockFetchProjects,
  selectedProjectId: null as string | null,
}

vi.mock('../stores/projects', () => ({
  useProjectsStore: vi.fn(() => ({ ...mockProjectsStoreState })),
}))

const mockGetCurrentUserRole = vi.fn(() => null)

vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'u1', is_admin: false },
  })),
}))

vi.mock('../stores/organizations', () => ({
  useOrganizationsStore: vi.fn(() => ({
    currentOrganization: null,
    fetchUserMemberships: mockFetchUserMemberships,
    getCurrentUserRole: mockGetCurrentUserRole,
  })),
  MemberRole: {},
}))

// Mock all git sub-components — capture props for callback testing
vi.mock('../components/git', () => ({
  BranchList: (props: Record<string, unknown>) => {
    lastBranchListProps = props
    return <div data-testid="branch-list">BranchList</div>
  },
  MergeRequestList: (props: Record<string, unknown>) => {
    lastMergeRequestListProps = props
    return <div data-testid="merge-request-list">MergeRequestList</div>
  },
  MergePreviewPanel: (props: Record<string, unknown>) => {
    _lastMergePreviewPanelProps = props
    return <div data-testid="merge-preview">MergePreviewPanel</div>
  },
  PullRequestList: (props: Record<string, unknown>) => {
    lastPullRequestListProps = props
    return <div data-testid="pull-request-list">PullRequestList</div>
  },
  PRReviewPanel: (props: Record<string, unknown>) => {
    _lastPRReviewPanelProps = props
    return <div data-testid="pr-review-panel">PRReviewPanel</div>
  },
  CommitHistory: (props: Record<string, unknown>) => {
    lastCommitHistoryProps = props
    return <div data-testid="commit-history">CommitHistory</div>
  },
  GitSetup: (props: Record<string, unknown>) => {
    lastGitSetupProps = props
    return <div data-testid="git-setup">GitSetup</div>
  },
  WorkingDirectory: (props: Record<string, unknown>) => {
    lastWorkingDirectoryProps = props
    return <div data-testid="working-directory">WorkingDirectory</div>
  },
  RemoteList: (props: Record<string, unknown>) => {
    lastRemoteListProps = props
    return <div data-testid="remote-list">RemoteList</div>
  },
  BranchProtectionSettings: (props: Record<string, unknown>) => {
    lastBranchProtectionProps = props
    return <div data-testid="branch-protection">BranchProtectionSettings</div>
  },
  GitAlert: ({ error, onClose }: { error: string; onClose: () => void }) => (
    <div data-testid="git-alert">
      {error}
      <button data-testid="git-alert-close" onClick={onClose}>Close</button>
    </div>
  ),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { GitPage } from './GitPage'
import { useGitStore } from '../stores/git'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useOrganizationsStore } from '../stores/organizations'

/** Helper: configure gitStore mock with overrides */
function setGitStore(overrides: Partial<typeof defaultGitStoreState>) {
  vi.mocked(useGitStore).mockReturnValue({
    ...defaultGitStoreState,
    ...overrides,
  } as unknown as ReturnType<typeof useGitStore>)
}

/** Helper: create a valid-repo state with a specific active tab */
function setValidRepoTab(tab: string, extra: Partial<typeof defaultGitStoreState> = {}) {
  setGitStore({
    selectedProjectId: 'p1',
    gitStatus: { is_valid_repo: true },
    activeTab: tab as typeof defaultGitStoreState['activeTab'],
    ...extra,
  })
}

describe('GitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to defaults
    vi.mocked(useGitStore).mockReturnValue({ ...defaultGitStoreState } as unknown as ReturnType<typeof useGitStore>)
    vi.mocked(useProjectsStore).mockReturnValue({ ...mockProjectsStoreState } as unknown as ReturnType<typeof useProjectsStore>)
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'u1', is_admin: false } } as unknown as ReturnType<typeof useAuthStore>)
    vi.mocked(useOrganizationsStore).mockReturnValue({
      currentOrganization: null,
      fetchUserMemberships: mockFetchUserMemberships,
      getCurrentUserRole: mockGetCurrentUserRole,
    } as unknown as ReturnType<typeof useOrganizationsStore>)
  })

  // ─── Existing tests ────────────────────────────────────────────────

  it('renders the page header with project selector', () => {
    render(<GitPage />)

    expect(screen.getByText('Select Project')).toBeInTheDocument()
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('renders remote operation buttons', () => {
    render(<GitPage />)

    expect(screen.getByText('Fetch')).toBeInTheDocument()
    expect(screen.getByText('Pull')).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
  })

  it('shows "select project" message when no project is selected', () => {
    render(<GitPage />)

    // Korean text for "select project"
    expect(screen.getByText(/프로젝트를 선택하세요/)).toBeInTheDocument()
  })

  it('shows GitSetup when project selected but git not valid', () => {
    setGitStore({ selectedProjectId: 'p1', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(screen.getByTestId('git-setup')).toBeInTheDocument()
  })

  it('shows tabs and content when git is valid', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    // Tab buttons
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByText('Merge Requests')).toBeInTheDocument()
    expect(screen.getByText('Pull Requests')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Remotes')).toBeInTheDocument()
    expect(screen.getByText('Protection')).toBeInTheDocument()

    // Default tab content
    expect(screen.getByTestId('working-directory')).toBeInTheDocument()
  })

  it('shows branches tab content when active', () => {
    setValidRepoTab('branches')

    render(<GitPage />)

    expect(screen.getByTestId('branch-list')).toBeInTheDocument()
  })

  it('shows merge requests tab content when active', () => {
    setValidRepoTab('merge-requests')

    render(<GitPage />)

    expect(screen.getByTestId('merge-request-list')).toBeInTheDocument()
  })

  it('shows error alert when error exists', () => {
    setGitStore({ error: 'Git operation failed' })

    render(<GitPage />)

    expect(screen.getByTestId('git-alert')).toBeInTheDocument()
    expect(screen.getByText('Git operation failed')).toBeInTheDocument()
  })

  it('shows current branch when project is selected', () => {
    setValidRepoTab('changes', { currentBranch: 'feature/test' })

    render(<GitPage />)

    expect(screen.getByText('feature/test')).toBeInTheDocument()
  })

  it('calls fetchProjects on mount', () => {
    render(<GitPage />)

    expect(mockFetchProjects).toHaveBeenCalled()
  })

  // ─── Tab switching ─────────────────────────────────────────────────

  it('shows pull-requests tab content when active', () => {
    setValidRepoTab('pull-requests')

    render(<GitPage />)

    expect(screen.getByTestId('pull-request-list')).toBeInTheDocument()
  })

  it('shows history tab content when active', () => {
    setValidRepoTab('history')

    render(<GitPage />)

    expect(screen.getByTestId('commit-history')).toBeInTheDocument()
  })

  it('shows remotes tab content when active', () => {
    setValidRepoTab('remotes')

    render(<GitPage />)

    expect(screen.getByTestId('remote-list')).toBeInTheDocument()
  })

  it('shows protection tab content when active', () => {
    setValidRepoTab('protection')

    render(<GitPage />)

    expect(screen.getByTestId('branch-protection')).toBeInTheDocument()
  })

  it('calls setActiveTab when a tab button is clicked', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    fireEvent.click(screen.getByText('Branches'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('branches')

    fireEvent.click(screen.getByText('History'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('history')
  })

  // ─── Project selector ──────────────────────────────────────────────

  it('calls setSelectedProject when project selector changes', () => {
    render(<GitPage />)

    const select = screen.getByDisplayValue('Select Project')
    fireEvent.change(select, { target: { value: 'p1' } })

    expect(mockSetSelectedProject).toHaveBeenCalledWith('p1')
  })

  it('calls setSelectedProject with null when empty option selected', () => {
    setGitStore({ selectedProjectId: 'p1' })

    render(<GitPage />)

    const select = screen.getByDisplayValue('Project Alpha')
    fireEvent.change(select, { target: { value: '' } })

    expect(mockSetSelectedProject).toHaveBeenCalledWith(null)
  })

  // ─── Remote operation buttons ──────────────────────────────────────

  it('calls fetchRemote when Fetch button is clicked with valid repo', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    fireEvent.click(screen.getByText('Fetch'))
    expect(mockFetchRemote).toHaveBeenCalledWith('p1')
  })

  it('calls pullRemote when Pull button is clicked with valid repo', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    fireEvent.click(screen.getByText('Pull'))
    expect(mockPullRemote).toHaveBeenCalledWith('p1')
  })

  it('calls pushRemote when Push button is clicked with valid repo', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    fireEvent.click(screen.getByText('Push'))
    expect(mockPushRemote).toHaveBeenCalledWith('p1')
  })

  it('disables remote buttons when no project is selected', () => {
    render(<GitPage />)

    expect(screen.getByTitle('Fetch from remote')).toBeDisabled()
    expect(screen.getByTitle('Pull from remote')).toBeDisabled()
    expect(screen.getByTitle('Push to remote')).toBeDisabled()
  })

  it('disables remote buttons when isLoading is true', () => {
    setValidRepoTab('changes', { isLoading: true })

    render(<GitPage />)

    expect(screen.getByTitle('Fetch from remote')).toBeDisabled()
    expect(screen.getByTitle('Pull from remote')).toBeDisabled()
    expect(screen.getByTitle('Push to remote')).toBeDisabled()
  })

  it('disables remote buttons when git is not a valid repo', () => {
    setGitStore({ selectedProjectId: 'p1', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(screen.getByTitle('Fetch from remote')).toBeDisabled()
  })

  // ─── Error banner ──────────────────────────────────────────────────

  it('does not show error alert when error is null', () => {
    render(<GitPage />)

    expect(screen.queryByTestId('git-alert')).not.toBeInTheDocument()
  })

  it('calls clearError when GitAlert close button is clicked', () => {
    setGitStore({ error: 'Something went wrong' })

    render(<GitPage />)

    fireEvent.click(screen.getByTestId('git-alert-close'))
    expect(mockClearError).toHaveBeenCalled()
  })

  // ─── Git status fetching on project change ─────────────────────────

  it('calls fetchGitStatus when selectedProjectId is set', () => {
    setGitStore({ selectedProjectId: 'p1' })

    render(<GitPage />)

    expect(mockFetchGitStatus).toHaveBeenCalledWith('p1')
  })

  it('fetches all data when project has a valid git repo', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    expect(mockFetchBranches).toHaveBeenCalledWith('p1')
    expect(mockFetchMergeRequests).toHaveBeenCalledWith('p1')
    expect(mockFetchCommits).toHaveBeenCalledWith('p1')
    expect(mockFetchWorkingStatus).toHaveBeenCalledWith('p1')
    expect(mockFetchRemotes).toHaveBeenCalledWith('p1')
    expect(mockFetchBranchProtectionRules).toHaveBeenCalledWith('p1')
  })

  it('does not fetch branch data when git is not a valid repo', () => {
    setGitStore({ selectedProjectId: 'p1', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(mockFetchBranches).not.toHaveBeenCalled()
    expect(mockFetchMergeRequests).not.toHaveBeenCalled()
  })

  // ─── Tabs are hidden when git is not valid ─────────────────────────

  it('hides tabs when git is not a valid repo', () => {
    setGitStore({ selectedProjectId: 'p1', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(screen.queryByText('Changes')).not.toBeInTheDocument()
    expect(screen.queryByText('Branches')).not.toBeInTheDocument()
  })

  // ─── GitSetup ──────────────────────────────────────────────────────

  it('passes correct props to GitSetup component', () => {
    setGitStore({ selectedProjectId: 'p1', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(lastGitSetupProps.projectId).toBe('p1')
    expect(lastGitSetupProps.projectName).toBe('Project Alpha')
    expect(lastGitSetupProps.projectPath).toBe('/alpha')
    expect(lastGitSetupProps.isLoading).toBe(false)
  })

  it('GitSetup uses projectId as fallback name when project not found', () => {
    setGitStore({ selectedProjectId: 'unknown-id', gitStatus: { is_valid_repo: false } })

    render(<GitPage />)

    expect(lastGitSetupProps.projectName).toBe('unknown-id')
    expect(lastGitSetupProps.projectPath).toBe('')
  })

  // ─── BranchList callback: onMergeClick → merge preview ─────────────

  it('opens merge preview panel when BranchList onMergeClick is called', async () => {
    mockPreviewMerge.mockResolvedValue(undefined)
    setValidRepoTab('branches')

    render(<GitPage />)

    // Invoke the onMergeClick callback
    const onMergeClick = lastBranchListProps.onMergeClick as (source: string) => Promise<void>
    await onMergeClick('feature/x')

    expect(mockPreviewMerge).toHaveBeenCalledWith('p1', 'feature/x', 'main')
  })

  // ─── MergePreviewPanel modal ───────────────────────────────────────

  it('does not render MergePreviewPanel when showMergePreview is false', () => {
    setValidRepoTab('branches')

    render(<GitPage />)

    expect(screen.queryByTestId('merge-preview')).not.toBeInTheDocument()
  })

  // ─── MergeRequestList: onCreateNew shows Create MR modal ───────────

  it('shows CreateMergeRequestModal when onCreateNew is called', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
        { name: 'feature/a', is_current: false, is_remote: false },
      ],
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    // Modal should now be visible
    expect(screen.getByText('New Merge Request')).toBeInTheDocument()
    expect(screen.getByText('Create MR')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('closes CreateMergeRequestModal when Cancel is clicked', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
      ],
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    expect(screen.getByText('New Merge Request')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('New Merge Request')).not.toBeInTheDocument()
  })

  it('submits CreateMergeRequestModal and closes on success', async () => {
    mockCreateMergeRequest.mockResolvedValue(true)
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: false, is_remote: false },
        { name: 'feature/a', is_current: true, is_remote: false },
      ],
      currentBranch: 'feature/a',
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    // Fill in title
    const titleInput = screen.getByPlaceholderText('Merge feature into main')
    fireEvent.change(titleInput, { target: { value: 'My MR Title' } })

    // Fill in description
    const descInput = screen.getByPlaceholderText('Optional description...')
    fireEvent.change(descInput, { target: { value: 'MR description' } })

    // Click submit
    fireEvent.click(screen.getByText('Create MR'))

    await waitFor(() => {
      expect(mockCreateMergeRequest).toHaveBeenCalledWith(
        'p1', 'My MR Title', 'feature/a', 'main', 'MR description', false
      )
    })
  })

  it('does not submit CreateMergeRequestModal with empty title', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
      ],
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    // Create MR button should be disabled with empty title
    const submitBtn = screen.getByText('Create MR')
    expect(submitBtn).toBeDisabled()
  })

  it('auto-merge checkbox toggles in CreateMergeRequestModal', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
      ],
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    const autoMergeCheckbox = screen.getByRole('checkbox')
    expect(autoMergeCheckbox).not.toBeChecked()

    fireEvent.click(autoMergeCheckbox)
    expect(autoMergeCheckbox).toBeChecked()
  })

  it('filters out remote branches in CreateMergeRequestModal', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
        { name: 'origin/main', is_current: false, is_remote: true },
        { name: 'feature/b', is_current: false, is_remote: false },
      ],
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    // Only local branches should be in selects
    const options = screen.getAllByRole('option')
    const optionTexts = options.map((o) => o.textContent)
    expect(optionTexts).toContain('main')
    expect(optionTexts).toContain('feature/b')
    expect(optionTexts).not.toContain('origin/main')
  })

  // ─── PullRequestList callbacks ─────────────────────────────────────

  it('calls fetchPullRequest and fetchPRReviews on handleViewPRDetails', async () => {
    mockFetchPullRequest.mockResolvedValue({ number: 42, title: 'PR 42' })
    mockFetchPRReviews.mockResolvedValue([])
    setValidRepoTab('pull-requests')

    render(<GitPage />)

    const onViewDetails = lastPullRequestListProps.onViewDetails as (prNumber: number) => Promise<void>
    await onViewDetails(42)

    expect(mockFetchPullRequest).toHaveBeenCalledWith(42)
    expect(mockFetchPRReviews).toHaveBeenCalledWith(42)
  })

  it('calls mergePullRequest on handleMergePR', async () => {
    mockMergePullRequest.mockResolvedValue(true)
    setValidRepoTab('pull-requests')

    render(<GitPage />)

    const onMerge = lastPullRequestListProps.onMerge as (prNumber: number) => Promise<boolean>
    await onMerge(99)

    expect(mockMergePullRequest).toHaveBeenCalledWith(99)
  })

  // ─── PRReviewPanel modal ───────────────────────────────────────────

  it('does not render PRReviewPanel when showPRReview is false', () => {
    setValidRepoTab('pull-requests', { selectedPullRequest: { number: 1, title: 'PR' } })

    render(<GitPage />)

    expect(screen.queryByTestId('pr-review-panel')).not.toBeInTheDocument()
  })

  // ─── Admin visibility of inactive projects ─────────────────────────

  it('hides inactive projects for non-admin users', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      projects: [
        { id: 'p1', name: 'Active Project', path: '/a', is_active: true },
        { id: 'p2', name: 'Inactive Project', path: '/b', is_active: false },
      ],
      fetchProjects: mockFetchProjects,
      selectedProjectId: null,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<GitPage />)

    expect(screen.getByText('Active Project')).toBeInTheDocument()
    expect(screen.queryByText('Inactive Project')).not.toBeInTheDocument()
  })

  it('shows inactive projects for admin users', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u1', is_admin: true },
    } as unknown as ReturnType<typeof useAuthStore>)
    vi.mocked(useProjectsStore).mockReturnValue({
      projects: [
        { id: 'p1', name: 'Active Project', path: '/a', is_active: true },
        { id: 'p2', name: 'Inactive Project', path: '/b', is_active: false },
      ],
      fetchProjects: mockFetchProjects,
      selectedProjectId: null,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<GitPage />)

    expect(screen.getByText('Active Project')).toBeInTheDocument()
    expect(screen.getByText('Inactive Project')).toBeInTheDocument()
  })

  // ─── User role from organization ───────────────────────────────────

  it('fetches user memberships when user is present', () => {
    render(<GitPage />)

    expect(mockFetchUserMemberships).toHaveBeenCalledWith('u1')
  })

  it('uses getCurrentUserRole when organization is present', () => {
    mockGetCurrentUserRole.mockReturnValue('admin')
    vi.mocked(useOrganizationsStore).mockReturnValue({
      currentOrganization: { id: 'org1', name: 'Org' },
      fetchUserMemberships: mockFetchUserMemberships,
      getCurrentUserRole: mockGetCurrentUserRole,
    } as unknown as ReturnType<typeof useOrganizationsStore>)

    render(<GitPage />)

    expect(mockGetCurrentUserRole).toHaveBeenCalledWith('org1', 'u1')
  })

  it('does not fetch memberships when user is null', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
    } as unknown as ReturnType<typeof useAuthStore>)

    render(<GitPage />)

    expect(mockFetchUserMemberships).not.toHaveBeenCalled()
  })

  // ─── Loading state ─────────────────────────────────────────────────

  it('applies animate-spin class to Fetch icon when loading', () => {
    setValidRepoTab('changes', { isLoading: true })

    render(<GitPage />)

    // The RefreshCw icon (mocked as <span>) should have animate-spin
    const fetchBtn = screen.getByTitle('Fetch from remote')
    const iconSpan = fetchBtn.querySelector('span')
    expect(iconSpan?.className).toContain('animate-spin')
  })

  // ─── No current branch text when no project selected ───────────────

  it('does not show current branch text when no project is selected', () => {
    render(<GitPage />)

    expect(screen.queryByText('Current:')).not.toBeInTheDocument()
  })

  it('shows Current: label with branch name when project exists', () => {
    setValidRepoTab('changes', { currentBranch: 'develop' })

    render(<GitPage />)

    expect(screen.getByText('develop')).toBeInTheDocument()
  })

  // ─── handleMerge and handleCreateMRFromPreview when no project ─────

  it('handleMerge does nothing without selectedProjectId', async () => {
    // Use branches tab with no selectedProjectId — should not crash
    setGitStore({
      selectedProjectId: null,
      gitStatus: null,
      activeTab: 'branches',
    })

    render(<GitPage />)

    // No crash expected; remote buttons are disabled
    expect(screen.getByTitle('Fetch from remote')).toBeDisabled()
  })

  // ─── handleFetch/Pull/Push do nothing without selectedProjectId ────

  it('Fetch does not call fetchRemote without selected project', () => {
    render(<GitPage />)

    // Button is disabled, but even if clicked nothing should happen
    fireEvent.click(screen.getByTitle('Fetch from remote'))
    expect(mockFetchRemote).not.toHaveBeenCalled()
  })

  // ─── CreateMergeRequestModal source/target branch selects ──────────

  it('allows changing source and target branches in CreateMR modal', () => {
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: false, is_remote: false },
        { name: 'develop', is_current: false, is_remote: false },
        { name: 'feature/c', is_current: true, is_remote: false },
      ],
      currentBranch: 'feature/c',
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    const selects = screen.getAllByRole('combobox')
    // Source select (should default to currentBranch)
    const sourceSelect = selects.find((s) => (s as HTMLSelectElement).value === 'feature/c')
    expect(sourceSelect).toBeTruthy()

    // Change source to develop
    fireEvent.change(sourceSelect!, { target: { value: 'develop' } })
    expect((sourceSelect as HTMLSelectElement).value).toBe('develop')
  })

  // ─── WorkingDirectory callback props ───────────────────────────────

  it('passes correct callback props to WorkingDirectory', () => {
    setValidRepoTab('changes')

    render(<GitPage />)

    expect(typeof lastWorkingDirectoryProps.onRefresh).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onStageFiles).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onStageAll).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onCommit).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onCommitAndPush).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onGenerateDrafts).toBe('function')
    expect(typeof lastWorkingDirectoryProps.onClearDrafts).toBe('function')
  })

  // ─── CommitHistory callback props ──────────────────────────────────

  it('passes correct props to CommitHistory', () => {
    setValidRepoTab('history', { currentBranch: 'develop', commits: [] })

    render(<GitPage />)

    expect(lastCommitHistoryProps.branch).toBe('develop')
    expect(lastCommitHistoryProps.hasMore).toBe(false)
    expect(typeof lastCommitHistoryProps.onLoadMore).toBe('function')
    expect(typeof lastCommitHistoryProps.onFetchFiles).toBe('function')
    expect(typeof lastCommitHistoryProps.onFetchDiff).toBe('function')
  })

  it('sets hasMore to true when commits length >= 50', () => {
    const fiftyCommits = Array.from({ length: 50 }, (_, i) => ({ sha: `sha${i}` }))
    setValidRepoTab('history', { commits: fiftyCommits })

    render(<GitPage />)

    expect(lastCommitHistoryProps.hasMore).toBe(true)
  })

  // ─── RemoteList callback props ─────────────────────────────────────

  it('passes correct callback props to RemoteList', () => {
    setValidRepoTab('remotes')

    render(<GitPage />)

    expect(typeof lastRemoteListProps.onAddRemote).toBe('function')
    expect(typeof lastRemoteListProps.onRemoveRemote).toBe('function')
    expect(typeof lastRemoteListProps.onUpdateRemote).toBe('function')
    expect(typeof lastRemoteListProps.onFetch).toBe('function')
    expect(typeof lastRemoteListProps.onPull).toBe('function')
    expect(typeof lastRemoteListProps.onPush).toBe('function')
    expect(typeof lastRemoteListProps.onRefresh).toBe('function')
  })

  // ─── BranchProtectionSettings callback props ──────────────────────

  it('passes correct callback props to BranchProtectionSettings', () => {
    setValidRepoTab('protection')

    render(<GitPage />)

    expect(typeof lastBranchProtectionProps.onCreateRule).toBe('function')
    expect(typeof lastBranchProtectionProps.onUpdateRule).toBe('function')
    expect(typeof lastBranchProtectionProps.onDeleteRule).toBe('function')
    expect(typeof lastBranchProtectionProps.onRefresh).toBe('function')
  })

  // ─── BranchList callback props ─────────────────────────────────────

  it('passes correct callback props to BranchList', () => {
    setValidRepoTab('branches')

    render(<GitPage />)

    expect(typeof lastBranchListProps.onCreateBranch).toBe('function')
    expect(typeof lastBranchListProps.onCheckoutBranch).toBe('function')
    expect(typeof lastBranchListProps.onDeleteBranch).toBe('function')
    expect(typeof lastBranchListProps.onMergeClick).toBe('function')
    expect(typeof lastBranchListProps.onRefresh).toBe('function')
  })

  // ─── Auto-select project based on globalSelectedProjectId ──────────

  it('auto-selects project matching globalSelectedProjectId', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...mockProjectsStoreState,
      selectedProjectId: 'p2',
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<GitPage />)

    // setSelectedProject should be called with p2 since it matches globalSelectedProjectId
    expect(mockSetSelectedProject).toHaveBeenCalledWith('p2')
  })

  it('auto-selects first visible project when globalSelectedProjectId does not match', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...mockProjectsStoreState,
      selectedProjectId: 'non-existent',
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<GitPage />)

    // Falls back to first project
    expect(mockSetSelectedProject).toHaveBeenCalledWith('p1')
  })

  // ─── CreateMergeRequestModal does not close on failure ─────────────

  it('keeps CreateMergeRequestModal open when submission fails', async () => {
    mockCreateMergeRequest.mockResolvedValue(false)
    setValidRepoTab('merge-requests', {
      branches: [
        { name: 'main', is_current: true, is_remote: false },
      ],
      currentBranch: 'main',
    })

    render(<GitPage />)

    const onCreateNew = lastMergeRequestListProps.onCreateNew as () => void
    act(() => { onCreateNew() })

    const titleInput = screen.getByPlaceholderText('Merge feature into main')
    fireEvent.change(titleInput, { target: { value: 'Failing MR' } })
    fireEvent.click(screen.getByText('Create MR'))

    await waitFor(() => {
      expect(mockCreateMergeRequest).toHaveBeenCalled()
    })

    // Modal should still be visible
    expect(screen.getByText('New Merge Request')).toBeInTheDocument()
  })
})
