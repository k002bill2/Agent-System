import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MergePreviewPanel } from '../MergePreviewPanel'
import type { MergePreview } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitMerge: (props: Record<string, unknown>) => <span data-testid="icon-GitMerge" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-CheckCircle2" {...props} />,
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-FileText" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Minus: (props: Record<string, unknown>) => <span data-testid="icon-Minus" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-X" {...props} />,
  GitCommit: (props: Record<string, unknown>) => <span data-testid="icon-GitCommit" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-Wrench" {...props} />,
}))

// Mock ConflictResolverPanel
vi.mock('../ConflictResolverPanel', () => ({
  ConflictResolverPanel: () => <div data-testid="conflict-resolver">ConflictResolverPanel</div>,
}))

function makePreview(overrides: Partial<MergePreview> = {}): MergePreview {
  return {
    source_branch: 'feature/test',
    target_branch: 'main',
    can_merge: true,
    conflict_status: 'no_conflicts',
    conflicting_files: [],
    files_changed: 5,
    insertions: 100,
    deletions: 20,
    commits_to_merge: 3,
    ...overrides,
  }
}

describe('MergePreviewPanel', () => {
  const defaultProps = {
    preview: makePreview(),
    isLoading: false,
    onMerge: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    canMerge: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when preview is null', () => {
    const { container } = render(
      <MergePreviewPanel {...defaultProps} preview={null} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the Merge Preview title', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    expect(screen.getByText('Merge Preview')).toBeInTheDocument()
  })

  it('displays source and target branch names', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    expect(screen.getByText('feature/test')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('shows merge stats (commits, files, additions, deletions)', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    expect(screen.getByText('3')).toBeInTheDocument()   // commits
    expect(screen.getByText('5')).toBeInTheDocument()   // files
    expect(screen.getByText('100')).toBeInTheDocument()  // insertions
    expect(screen.getByText('20')).toBeInTheDocument()   // deletions
    expect(screen.getByText('Commits')).toBeInTheDocument()
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Additions')).toBeInTheDocument()
    expect(screen.getByText('Deletions')).toBeInTheDocument()
  })

  it('shows success status when no conflicts', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    expect(screen.getByText('머지 가능합니다')).toBeInTheDocument()
  })

  it('shows conflict status when has conflicts', () => {
    const preview = makePreview({
      conflict_status: 'has_conflicts',
      conflicting_files: ['file1.ts', 'file2.ts'],
    })
    render(<MergePreviewPanel {...defaultProps} preview={preview} />)
    expect(screen.getByText('충돌이 발견되었습니다')).toBeInTheDocument()
  })

  it('displays conflicting files list', () => {
    const preview = makePreview({
      conflict_status: 'has_conflicts',
      conflicting_files: ['src/app.ts', 'src/utils.ts'],
    })
    render(<MergePreviewPanel {...defaultProps} preview={preview} />)
    expect(screen.getByText('Conflicting Files (2)')).toBeInTheDocument()
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
  })

  it('calls onClose when close (X) button is clicked', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    // The X icon button is the first button in the header
    const closeButtons = screen.getAllByRole('button')
    // Find the one near the X icon
    const headerCloseBtn = closeButtons.find(btn =>
      btn.querySelector('[data-testid="icon-X"]')
    )
    expect(headerCloseBtn).toBeTruthy()
    fireEvent.click(headerCloseBtn!)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel button is clicked', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onMerge and closes when Merge button is clicked', async () => {
    render(<MergePreviewPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('Merge'))

    await waitFor(() => {
      expect(defaultProps.onMerge).toHaveBeenCalledTimes(1)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('disables Merge button when there are conflicts', () => {
    const preview = makePreview({
      conflict_status: 'has_conflicts',
      conflicting_files: ['file.ts'],
    })
    render(<MergePreviewPanel {...defaultProps} preview={preview} />)
    const mergeBtn = screen.getByText('Merge')
    expect(mergeBtn).toBeDisabled()
  })

  it('disables Merge button when canMerge is false', () => {
    render(<MergePreviewPanel {...defaultProps} canMerge={false} />)
    const mergeBtn = screen.getByText('Merge')
    expect(mergeBtn).toBeDisabled()
  })

  it('shows merge message textarea when no conflicts and canMerge', () => {
    render(<MergePreviewPanel {...defaultProps} />)
    expect(screen.getByText('Merge Message (optional)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Merge branch 'feature/test' into main")).toBeInTheDocument()
  })

  it('shows "Create Merge Request instead" link when onCreateMR is provided', () => {
    const onCreateMR = vi.fn().mockResolvedValue(true)
    render(<MergePreviewPanel {...defaultProps} onCreateMR={onCreateMR} />)
    expect(screen.getByText('Create Merge Request instead')).toBeInTheDocument()
  })

  it('toggles MR form when "Create Merge Request instead" is clicked', () => {
    const onCreateMR = vi.fn().mockResolvedValue(true)
    render(<MergePreviewPanel {...defaultProps} onCreateMR={onCreateMR} />)
    fireEvent.click(screen.getByText('Create Merge Request instead'))
    expect(screen.getByText('MR Title *')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Create MR')).toBeInTheDocument()
    // Toggle back
    fireEvent.click(screen.getByText('Direct merge'))
    expect(screen.queryByText('MR Title *')).not.toBeInTheDocument()
  })

  it('disables Create MR button when title is empty', () => {
    const onCreateMR = vi.fn().mockResolvedValue(true)
    render(<MergePreviewPanel {...defaultProps} onCreateMR={onCreateMR} />)
    fireEvent.click(screen.getByText('Create Merge Request instead'))
    expect(screen.getByText('Create MR')).toBeDisabled()
  })

  it('shows conflict resolver button when conflict resolution props provided', () => {
    const preview = makePreview({
      conflict_status: 'has_conflicts',
      conflicting_files: ['file.ts'],
    })
    render(
      <MergePreviewPanel
        {...defaultProps}
        preview={preview}
        onFetchConflicts={vi.fn().mockResolvedValue(undefined)}
        onResolveConflict={vi.fn().mockResolvedValue(true)}
        onAbortMerge={vi.fn().mockResolvedValue(true)}
        onCompleteMerge={vi.fn().mockResolvedValue(true)}
      />
    )
    expect(screen.getByText('충돌 해결')).toBeInTheDocument()
  })
})
