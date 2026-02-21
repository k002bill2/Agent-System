import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommitHistory } from '../CommitHistory'
import type { GitCommit, CommitFile } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitCommit: (props: Record<string, unknown>) => <span data-testid="icon-GitCommit" {...props} />,
  User: (props: Record<string, unknown>) => <span data-testid="icon-User" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-Clock" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-ChevronRight" {...props} />,
  Copy: (props: Record<string, unknown>) => <span data-testid="icon-Copy" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-FileText" {...props} />,
  FilePlus: (props: Record<string, unknown>) => <span data-testid="icon-FilePlus" {...props} />,
  FileX: (props: Record<string, unknown>) => <span data-testid="icon-FileX" {...props} />,
  FileEdit: (props: Record<string, unknown>) => <span data-testid="icon-FileEdit" {...props} />,
  ArrowRight: (props: Record<string, unknown>) => <span data-testid="icon-ArrowRight" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-Loader2" {...props} />,
}))

function makeCommit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    sha: 'abc123def456789',
    short_sha: 'abc123d',
    message: 'fix: resolve login issue',
    author_name: 'Test User',
    author_email: 'test@example.com',
    authored_date: '2024-06-15T10:00:00Z',
    committer_name: 'Test User',
    committer_email: 'test@example.com',
    committed_date: '2024-06-15T10:00:00Z',
    parent_shas: ['parent1'],
    ...overrides,
  }
}

describe('CommitHistory', () => {
  const defaultProps = {
    commits: [
      makeCommit({ sha: 'aaa111', short_sha: 'aaa111', message: 'feat: add search' }),
      makeCommit({ sha: 'bbb222', short_sha: 'bbb222', message: 'fix: login bug' }),
    ],
    branch: 'main',
    isLoading: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Commit History heading', () => {
    render(<CommitHistory {...defaultProps} />)
    expect(screen.getByText('Commit History')).toBeInTheDocument()
  })

  it('displays branch name', () => {
    render(<CommitHistory {...defaultProps} />)
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('shows commit count', () => {
    render(<CommitHistory {...defaultProps} />)
    expect(screen.getByText('(2 commits)')).toBeInTheDocument()
  })

  it('displays commit messages', () => {
    render(<CommitHistory {...defaultProps} />)
    expect(screen.getByText('feat: add search')).toBeInTheDocument()
    expect(screen.getByText('fix: login bug')).toBeInTheDocument()
  })

  it('displays author name', () => {
    render(<CommitHistory {...defaultProps} />)
    // Author name appears for each commit in the summary line
    const authorElements = screen.getAllByText('Test User')
    expect(authorElements.length).toBeGreaterThanOrEqual(2)
  })

  it('displays short SHA', () => {
    render(<CommitHistory {...defaultProps} />)
    expect(screen.getByText('aaa111')).toBeInTheDocument()
    expect(screen.getByText('bbb222')).toBeInTheDocument()
  })

  it('shows empty state when no commits', () => {
    render(<CommitHistory {...defaultProps} commits={[]} />)
    expect(screen.getByText('No commits found')).toBeInTheDocument()
  })

  it('shows loading state when loading with no commits', () => {
    render(<CommitHistory {...defaultProps} commits={[]} isLoading={true} />)
    expect(screen.getByText('Loading commits...')).toBeInTheDocument()
  })

  it('shows Load More button when hasMore is true', () => {
    const onLoadMore = vi.fn()
    render(<CommitHistory {...defaultProps} hasMore={true} onLoadMore={onLoadMore} />)
    const loadMoreBtn = screen.getByText('Load More')
    expect(loadMoreBtn).toBeInTheDocument()
    fireEvent.click(loadMoreBtn)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('shows Loading... text on Load More when isLoading', () => {
    render(<CommitHistory {...defaultProps} hasMore={true} isLoading={true} onLoadMore={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('does not show Load More when hasMore is false', () => {
    render(<CommitHistory {...defaultProps} hasMore={false} />)
    expect(screen.queryByText('Load More')).not.toBeInTheDocument()
  })

  it('expands commit to show details when clicked', async () => {
    const mockFetchFiles = vi.fn().mockResolvedValue([])
    render(
      <CommitHistory
        {...defaultProps}
        onFetchFiles={mockFetchFiles}
        commitFiles={{}}
      />
    )

    // Click on the first commit
    fireEvent.click(screen.getByText('feat: add search'))

    // Expanded view shows Author/Committer/SHA details
    await waitFor(() => {
      expect(screen.getByText('Author')).toBeInTheDocument()
      expect(screen.getByText('Committer')).toBeInTheDocument()
      expect(screen.getByText('SHA')).toBeInTheDocument()
    })
  })

  it('shows parent SHAs in expanded view', async () => {
    render(
      <CommitHistory
        {...defaultProps}
        commits={[makeCommit({ sha: 'ccc333', short_sha: 'ccc333', parent_shas: ['parent1', 'parent2'] })]}
        commitFiles={{}}
      />
    )

    fireEvent.click(screen.getByText('fix: resolve login issue'))

    await waitFor(() => {
      expect(screen.getByText('Parents (2)')).toBeInTheDocument()
      expect(screen.getByText('parent1')).toBeInTheDocument()
      expect(screen.getByText('parent2')).toBeInTheDocument()
    })
  })

  it('fetches files when commit is expanded and onFetchFiles provided', async () => {
    const mockFiles: CommitFile[] = [
      { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 5, old_path: null },
    ]
    const mockFetchFiles = vi.fn().mockResolvedValue(mockFiles)
    render(
      <CommitHistory
        {...defaultProps}
        onFetchFiles={mockFetchFiles}
        commitFiles={{}}
      />
    )

    fireEvent.click(screen.getByText('feat: add search'))

    await waitFor(() => {
      expect(mockFetchFiles).toHaveBeenCalledWith('aaa111')
    })
  })
})
