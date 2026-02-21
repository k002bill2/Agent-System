import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MergeRequestCard, MergeRequestList } from '../MergeRequestCard'
import type { MergeRequest } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitMerge: (props: Record<string, unknown>) => <span data-testid="icon-GitMerge" {...props} />,
  GitPullRequest: (props: Record<string, unknown>) => <span data-testid="icon-GitPullRequest" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-Clock" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-CheckCircle2" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-XCircle" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  User: (props: Record<string, unknown>) => <span data-testid="icon-User" {...props} />,
  MoreVertical: (props: Record<string, unknown>) => <span data-testid="icon-MoreVertical" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="icon-Zap" {...props} />,
}))

function makeMergeRequest(overrides: Partial<MergeRequest> = {}): MergeRequest {
  return {
    id: 'mr-1',
    project_id: 'proj-1',
    title: 'Add new feature',
    description: 'This is a description',
    source_branch: 'feature/new',
    target_branch: 'main',
    status: 'open',
    author_id: 'user-2',
    author_name: 'Alice',
    author_email: 'alice@test.com',
    conflict_status: 'no_conflicts',
    auto_merge: false,
    reviewers: [],
    approved_by: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    merged_at: null,
    merged_by: null,
    closed_at: null,
    closed_by: null,
    ...overrides,
  }
}

describe('MergeRequestCard', () => {
  const defaultProps = {
    mergeRequest: makeMergeRequest(),
    currentUserId: 'user-1',
    userRole: 'owner',
    onApprove: vi.fn().mockResolvedValue(true),
    onMerge: vi.fn().mockResolvedValue(true),
    onClose: vi.fn().mockResolvedValue(true),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders merge request title', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('Add new feature')).toBeInTheDocument()
  })

  it('renders source and target branch names', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('feature/new')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('displays OPEN status badge for open MR', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('displays MERGED status badge', () => {
    const mr = makeMergeRequest({ status: 'merged' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('MERGED')).toBeInTheDocument()
  })

  it('displays CLOSED status badge', () => {
    const mr = makeMergeRequest({ status: 'closed' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('CLOSED')).toBeInTheDocument()
  })

  it('displays description when provided', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('This is a description')).toBeInTheDocument()
  })

  it('does not render description when empty', () => {
    const mr = makeMergeRequest({ description: '' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.queryByText('This is a description')).not.toBeInTheDocument()
  })

  it('displays author name', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows Approve button when user has not approved and is not the author', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })

  it('hides Approve button when user is the author', () => {
    const mr = makeMergeRequest({ author_id: 'user-1' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
  })

  it('hides Approve button when user has already approved', () => {
    const mr = makeMergeRequest({ approved_by: ['user-1'] })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
  })

  it('shows approval count when approvals exist', () => {
    const mr = makeMergeRequest({ approved_by: ['user-3', 'user-4'] })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('2 approvals')).toBeInTheDocument()
  })

  it('shows Merge button for owner/admin roles', () => {
    render(<MergeRequestCard {...defaultProps} />)
    expect(screen.getByText('Merge')).toBeInTheDocument()
  })

  it('hides Merge button for non-admin roles', () => {
    render(<MergeRequestCard {...defaultProps} userRole="member" />)
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
  })

  it('hides Merge button when there are conflicts', () => {
    const mr = makeMergeRequest({ conflict_status: 'has_conflicts' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
  })

  it('shows conflict badge when has_conflicts', () => {
    const mr = makeMergeRequest({ conflict_status: 'has_conflicts' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('충돌 있음')).toBeInTheDocument()
  })

  it('shows mergeable badge when no_conflicts', () => {
    const mr = makeMergeRequest({ conflict_status: 'no_conflicts' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('머지 가능')).toBeInTheDocument()
  })

  it('shows Auto-merge badge when auto_merge is true and status is open', () => {
    const mr = makeMergeRequest({ auto_merge: true })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.getByText('Auto-merge')).toBeInTheDocument()
  })

  it('calls onApprove when Approve button is clicked', async () => {
    render(<MergeRequestCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Approve'))
    expect(defaultProps.onApprove).toHaveBeenCalledWith('mr-1')
  })

  it('calls onMerge when Merge button is clicked', async () => {
    render(<MergeRequestCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Merge'))
    expect(defaultProps.onMerge).toHaveBeenCalledWith('mr-1')
  })

  it('does not show action buttons when MR is not open', () => {
    const mr = makeMergeRequest({ status: 'merged' })
    render(<MergeRequestCard {...defaultProps} mergeRequest={mr} />)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
  })
})

describe('MergeRequestList', () => {
  const defaultListProps = {
    mergeRequests: [
      makeMergeRequest({ id: 'mr-1', title: 'Feature A', status: 'open' as const }),
      makeMergeRequest({ id: 'mr-2', title: 'Feature B', status: 'merged' as const }),
    ],
    currentUserId: 'user-1',
    userRole: 'owner',
    onApprove: vi.fn().mockResolvedValue(true),
    onMerge: vi.fn().mockResolvedValue(true),
    onClose: vi.fn().mockResolvedValue(true),
    onCreateNew: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading with total count', () => {
    render(<MergeRequestList {...defaultListProps} />)
    expect(screen.getByText('Merge Requests')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('shows only open MRs by default', () => {
    render(<MergeRequestList {...defaultListProps} />)
    expect(screen.getByText('Feature A')).toBeInTheDocument()
    expect(screen.queryByText('Feature B')).not.toBeInTheDocument()
  })

  it('shows all MRs when "All" filter is selected', () => {
    render(<MergeRequestList {...defaultListProps} />)
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Feature A')).toBeInTheDocument()
    expect(screen.getByText('Feature B')).toBeInTheDocument()
  })

  it('shows merged MRs when "Merged" filter is selected', () => {
    render(<MergeRequestList {...defaultListProps} />)
    fireEvent.click(screen.getByText('Merged'))
    expect(screen.queryByText('Feature A')).not.toBeInTheDocument()
    expect(screen.getByText('Feature B')).toBeInTheDocument()
  })

  it('shows empty state when no MRs match filter', () => {
    render(<MergeRequestList {...defaultListProps} />)
    fireEvent.click(screen.getByText('Closed'))
    expect(screen.getByText('No merge requests found')).toBeInTheDocument()
  })

  it('calls onCreateNew when New MR button is clicked', () => {
    render(<MergeRequestList {...defaultListProps} />)
    fireEvent.click(screen.getByText('New MR'))
    expect(defaultListProps.onCreateNew).toHaveBeenCalledTimes(1)
  })

  it('renders filter buttons', () => {
    render(<MergeRequestList {...defaultListProps} />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Merged')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
  })
})
