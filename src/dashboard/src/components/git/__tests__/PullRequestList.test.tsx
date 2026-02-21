import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PullRequestList, PRReviewPanel } from '../PullRequestList'
import type { GitHubPullRequest, GitHubPRReview } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitPullRequest: (props: Record<string, unknown>) => <span data-testid="icon-GitPullRequest" {...props} />,
  GitMerge: (props: Record<string, unknown>) => <span data-testid="icon-GitMerge" {...props} />,
  ExternalLink: (props: Record<string, unknown>) => <span data-testid="icon-ExternalLink" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-Clock" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-MessageSquare" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-CheckCircle2" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-XCircle" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Minus: (props: Record<string, unknown>) => <span data-testid="icon-Minus" {...props} />,
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-FileText" {...props} />,
  Eye: (props: Record<string, unknown>) => <span data-testid="icon-Eye" {...props} />,
}))

// Mock gitUtils
vi.mock('../../../utils/gitUtils', () => ({
  extractGitHubRepo: vi.fn((url: string) => {
    const match = url.match(/([^/]+\/[^/]+?)(?:\.git)?$/)
    return match ? match[1] : null
  }),
}))

function makePR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 42,
    title: 'Fix login bug',
    body: 'Some body text',
    state: 'open',
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    head_ref: 'fix/login',
    head_sha: 'abc123',
    base_ref: 'main',
    base_sha: 'def456',
    user_login: 'developer',
    user_avatar_url: null,
    html_url: 'https://github.com/owner/repo/pull/42',
    diff_url: 'https://github.com/owner/repo/pull/42.diff',
    commits: 2,
    additions: 50,
    deletions: 10,
    changed_files: 3,
    review_comments: 0,
    labels: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    merged_at: null,
    closed_at: null,
    ...overrides,
  }
}

describe('PullRequestList', () => {
  const defaultProps = {
    pullRequests: [makePR()],
    isLoading: false,
    githubRepo: 'owner/repo',
    onSetRepo: vi.fn(),
    onRefresh: vi.fn(),
    onViewDetails: vi.fn(),
    onMerge: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Pull Requests heading with count', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('Pull Requests')).toBeInTheDocument()
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })

  it('displays the repo name as a button', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('owner/repo')).toBeInTheDocument()
  })

  it('shows repo config screen when githubRepo is null', () => {
    render(<PullRequestList {...defaultProps} githubRepo={null} />)
    expect(screen.getByText('Connect GitHub Repository')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('owner/repository')).toBeInTheDocument()
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('calls onSetRepo when Connect is clicked with repo input', () => {
    render(<PullRequestList {...defaultProps} githubRepo={null} />)
    const input = screen.getByPlaceholderText('owner/repository')
    fireEvent.change(input, { target: { value: 'myorg/myrepo' } })
    fireEvent.click(screen.getByText('Connect'))
    expect(defaultProps.onSetRepo).toHaveBeenCalledWith('myorg/myrepo')
  })

  it('disables Connect button when input is empty', () => {
    render(<PullRequestList {...defaultProps} githubRepo={null} />)
    expect(screen.getByText('Connect')).toBeDisabled()
  })

  it('displays PR title and number', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('displays head and base branch refs', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('fix/login')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('displays PR user login', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('developer')).toBeInTheDocument()
  })

  it('displays changed files count', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('3 files')).toBeInTheDocument()
  })

  it('displays additions and deletions', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('shows "Ready" badge for clean mergeable state', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('shows "Can\'t merge" badge when not mergeable', () => {
    const pr = makePR({ mergeable: false })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.getByText("Can't merge")).toBeInTheDocument()
  })

  it('shows "Draft" badge for draft PRs', () => {
    const pr = makePR({ draft: true })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows View button and calls onViewDetails', () => {
    render(<PullRequestList {...defaultProps} />)
    fireEvent.click(screen.getByText('View'))
    expect(defaultProps.onViewDetails).toHaveBeenCalledWith(42)
  })

  it('shows Merge button for open, mergeable, non-draft PRs', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('Merge')).toBeInTheDocument()
  })

  it('hides Merge button for draft PRs', () => {
    const pr = makePR({ draft: true })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
  })

  it('hides Merge button for non-mergeable PRs', () => {
    const pr = makePR({ mergeable: false })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
  })

  it('calls onMerge when Merge button is clicked', () => {
    render(<PullRequestList {...defaultProps} />)
    fireEvent.click(screen.getByText('Merge'))
    expect(defaultProps.onMerge).toHaveBeenCalledWith(42)
  })

  it('shows empty state when no PRs', () => {
    render(<PullRequestList {...defaultProps} pullRequests={[]} />)
    expect(screen.getByText('No pull requests found')).toBeInTheDocument()
  })

  it('shows loading state when isLoading and no PRs', () => {
    render(<PullRequestList {...defaultProps} pullRequests={[]} isLoading={true} />)
    expect(screen.getByText('Loading pull requests...')).toBeInTheDocument()
  })

  it('displays filter buttons (Open, Closed, All)', () => {
    render(<PullRequestList {...defaultProps} />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('calls onRefresh when Refresh button is clicked', () => {
    render(<PullRequestList {...defaultProps} />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalled()
  })

  it('shows "Loading..." text on Refresh button when isLoading', () => {
    render(<PullRequestList {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows labels for PRs that have them', () => {
    const pr = makePR({ labels: ['bug', 'urgent'] })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
  })

  it('shows +N indicator when PR has more than 5 labels', () => {
    const pr = makePR({ labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })
    render(<PullRequestList {...defaultProps} pullRequests={[pr]} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('switches to config screen when repo name button is clicked', () => {
    render(<PullRequestList {...defaultProps} />)
    fireEvent.click(screen.getByText('owner/repo'))
    expect(screen.getByText('Connect GitHub Repository')).toBeInTheDocument()
  })
})

describe('PRReviewPanel', () => {
  const pr = makePR()
  const reviews: GitHubPRReview[] = [
    {
      id: 1,
      user_login: 'reviewer1',
      user_avatar_url: null,
      state: 'APPROVED',
      body: 'Looks good!',
      submitted_at: '2024-01-01T00:00:00Z',
      commit_id: null,
    },
  ]
  const defaultProps = {
    pr,
    reviews,
    onClose: vi.fn(),
    onCreateReview: vi.fn().mockResolvedValue(true),
    onMerge: vi.fn().mockResolvedValue(true),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders PR title with number', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('PR #42: Fix login bug')).toBeInTheDocument()
  })

  it('renders head and base refs', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('fix/login')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('displays reviews count', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('Reviews (1)')).toBeInTheDocument()
  })

  it('displays review content', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('reviewer1')).toBeInTheDocument()
    expect(screen.getByText('APPROVED')).toBeInTheDocument()
    expect(screen.getByText('Looks good!')).toBeInTheDocument()
  })

  it('shows empty reviews message', () => {
    render(<PRReviewPanel {...defaultProps} reviews={[]} />)
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  })

  it('shows Add Review form', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('Add Review')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write your review...')).toBeInTheDocument()
    expect(screen.getByText('Submit Review')).toBeInTheDocument()
  })

  it('shows merge section for open, mergeable PRs', () => {
    render(<PRReviewPanel {...defaultProps} />)
    expect(screen.getByText('Merge method:')).toBeInTheDocument()
    expect(screen.getByText('Merge PR')).toBeInTheDocument()
  })

  it('hides merge section for closed PRs', () => {
    const closedPR = makePR({ state: 'closed' })
    render(<PRReviewPanel {...defaultProps} pr={closedPR} />)
    expect(screen.queryByText('Merge PR')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<PRReviewPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('\u00d7'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
