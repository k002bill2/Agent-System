import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchList } from '../BranchList'
import type { GitBranch, ConflictStatus } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitBranch: (props: Record<string, unknown>) => <span data-testid="icon-GitBranch" {...props} />,
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-Shield" {...props} />,
  MoreVertical: (props: Record<string, unknown>) => <span data-testid="icon-MoreVertical" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-Trash2" {...props} />,
  GitMerge: (props: Record<string, unknown>) => <span data-testid="icon-GitMerge" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-RefreshCw" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  ArrowUp: (props: Record<string, unknown>) => <span data-testid="icon-ArrowUp" {...props} />,
  ArrowDown: (props: Record<string, unknown>) => <span data-testid="icon-ArrowDown" {...props} />,
  Cloud: (props: Record<string, unknown>) => <span data-testid="icon-Cloud" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-Loader2" {...props} />,
  ArrowRightLeft: (props: Record<string, unknown>) => <span data-testid="icon-ArrowRightLeft" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-AlertCircle" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-Info" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <span data-testid="icon-ChevronUp" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-X" {...props} />,
}))

// Mock classifyGitError used by GitAlert
vi.mock('../../../utils/gitErrorMessages', () => ({
  classifyGitError: vi.fn((rawError: string) => ({
    category: 'unknown',
    severity: 'error',
    title: 'Error',
    description: rawError,
    solution: 'Try again',
    rawError,
  })),
}))

function makeBranch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'main',
    is_current: false,
    is_remote: false,
    is_protected: false,
    commit_sha: 'abc123',
    commit_message: 'Initial commit',
    commit_author: 'user',
    commit_date: '2024-01-01',
    ahead: 0,
    behind: 0,
    tracking_branch: null,
    ...overrides,
  }
}

describe('BranchList', () => {
  const defaultProps = {
    branches: [
      makeBranch({ name: 'main', is_current: true }),
      makeBranch({ name: 'feature/new', commit_message: 'Add feature' }),
      makeBranch({ name: 'bugfix/fix', commit_message: 'Fix bug' }),
    ],
    currentBranch: 'main',
    protectedBranches: ['main'],
    isLoading: false,
    onCreateBranch: vi.fn().mockResolvedValue(true),
    onCheckoutBranch: vi.fn().mockResolvedValue(true),
    onDeleteBranch: vi.fn().mockResolvedValue(true),
    onMergeClick: vi.fn(),
    onRefresh: vi.fn(),
    conflictStatuses: {} as Record<string, ConflictStatus>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Branches heading with count', () => {
    render(<BranchList {...defaultProps} />)
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('displays branch names', () => {
    render(<BranchList {...defaultProps} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('feature/new')).toBeInTheDocument()
    expect(screen.getByText('bugfix/fix')).toBeInTheDocument()
  })

  it('marks current branch with "current" badge', () => {
    render(<BranchList {...defaultProps} />)
    expect(screen.getByText('current')).toBeInTheDocument()
  })

  it('shows empty state when no branches match filter', () => {
    render(<BranchList {...defaultProps} branches={[]} />)
    expect(screen.getByText('No branches found')).toBeInTheDocument()
  })

  it('filters branches by local/remote/all', () => {
    const branches = [
      makeBranch({ name: 'main', is_current: true }),
      makeBranch({ name: 'origin/main', is_remote: true }),
    ]
    render(<BranchList {...defaultProps} branches={branches} />)

    // Default filter is 'local', so only local branches show
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.queryByText('origin/main')).not.toBeInTheDocument()

    // Switch to 'Remote' filter
    fireEvent.click(screen.getByText('Remote'))
    expect(screen.queryByText(/^main$/)).not.toBeInTheDocument()
    expect(screen.getByText('origin/main')).toBeInTheDocument()

    // Switch to 'All' filter
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('origin/main')).toBeInTheDocument()
  })

  it('opens create branch modal when New Branch is clicked', () => {
    render(<BranchList {...defaultProps} />)
    fireEvent.click(screen.getByText('New Branch'))
    expect(screen.getByText('Branch Name')).toBeInTheDocument()
    expect(screen.getByText('Start Point')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('feature/my-feature')).toBeInTheDocument()
  })

  it('creates a new branch and closes modal on success', async () => {
    render(<BranchList {...defaultProps} />)
    fireEvent.click(screen.getByText('New Branch'))

    const input = screen.getByPlaceholderText('feature/my-feature')
    fireEvent.change(input, { target: { value: 'feature/test' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(defaultProps.onCreateBranch).toHaveBeenCalledWith('feature/test', 'HEAD')
    })
  })

  it('disables Create button when branch name is empty', () => {
    render(<BranchList {...defaultProps} />)
    fireEvent.click(screen.getByText('New Branch'))
    const createBtn = screen.getByText('Create')
    expect(createBtn).toBeDisabled()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<BranchList {...defaultProps} />)
    const refreshBtn = screen.getByTitle('Refresh')
    fireEvent.click(refreshBtn)
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows conflict badge for branches with conflicts', () => {
    const conflictStatuses: Record<string, ConflictStatus> = {
      'feature/new': 'has_conflicts',
      'bugfix/fix': 'no_conflicts',
    }
    render(<BranchList {...defaultProps} conflictStatuses={conflictStatuses} />)
    expect(screen.getByText('충돌')).toBeInTheDocument()
    expect(screen.getByText('머지 가능')).toBeInTheDocument()
  })

  it('shows ahead/behind indicators', () => {
    const branches = [
      makeBranch({ name: 'feature/ahead', ahead: 3, behind: 2 }),
    ]
    render(<BranchList {...defaultProps} branches={branches} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('cancels create modal when Cancel is clicked', () => {
    render(<BranchList {...defaultProps} />)
    fireEvent.click(screen.getByText('New Branch'))
    expect(screen.getByText('Branch Name')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Branch Name')).not.toBeInTheDocument()
  })
})
