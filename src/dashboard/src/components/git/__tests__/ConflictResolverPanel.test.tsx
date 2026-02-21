import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConflictResolverPanel } from '../ConflictResolverPanel'
import type { ConflictFile, MergeStatus } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <span data-testid="icon-X" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-CheckCircle2" {...props} />,
  FileCode: (props: Record<string, unknown>) => <span data-testid="icon-FileCode" {...props} />,
  GitMerge: (props: Record<string, unknown>) => <span data-testid="icon-GitMerge" {...props} />,
  RotateCcw: (props: Record<string, unknown>) => <span data-testid="icon-RotateCcw" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-Loader2" {...props} />,
}))

function makeConflictFile(overrides: Partial<ConflictFile> = {}): ConflictFile {
  return {
    path: 'src/app.ts',
    conflict_type: 'content',
    our_content: 'our version of code',
    their_content: 'their version of code',
    base_content: 'base version of code',
    ...overrides,
  }
}

describe('ConflictResolverPanel', () => {
  const defaultProps = {
    conflictFiles: [
      makeConflictFile({ path: 'src/app.ts' }),
      makeConflictFile({ path: 'src/utils.ts', our_content: 'our utils', their_content: 'their utils', base_content: 'base utils' }),
    ],
    mergeStatus: null as MergeStatus | null,
    sourceBranch: 'feature/new',
    targetBranch: 'main',
    isResolving: false,
    onResolve: vi.fn().mockResolvedValue(true),
    onAbort: vi.fn().mockResolvedValue(true),
    onComplete: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders conflict resolver heading', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('충돌 해결')).toBeInTheDocument()
  })

  it('displays source and target branch names', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('feature/new')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('shows conflict file count in sidebar', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('충돌 파일 (2)')).toBeInTheDocument()
  })

  it('lists conflict file paths in sidebar', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    // src/app.ts appears in sidebar and in the file header, so use getAllByText
    const appEntries = screen.getAllByText('src/app.ts')
    expect(appEntries.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
  })

  it('selects first file by default and shows its content', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    // The first file should be selected, showing its content in the 3-way diff
    expect(screen.getByText('our version of code')).toBeInTheDocument()
    expect(screen.getByText('their version of code')).toBeInTheDocument()
    expect(screen.getByText('base version of code')).toBeInTheDocument()
  })

  it('shows 3-way diff panels (Base, Ours, Theirs)', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText(/Base \(공통 조상\)/)).toBeInTheDocument()
    expect(screen.getByText(/Ours \(main\)/)).toBeInTheDocument()
    expect(screen.getByText(/Theirs \(feature\/new\)/)).toBeInTheDocument()
  })

  it('shows strategy radio buttons (Ours, Theirs, Custom)', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('Ours (Target)')).toBeInTheDocument()
    expect(screen.getByText('Theirs (Source)')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('shows resolve button for current file', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('이 파일 해결')).toBeInTheDocument()
  })

  it('calls onResolve when resolve button is clicked', async () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('이 파일 해결'))
    await waitFor(() => {
      expect(defaultProps.onResolve).toHaveBeenCalledWith('src/app.ts', 'ours', undefined)
    })
  })

  it('shows custom editor when Custom strategy is selected', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    // Select Custom strategy
    fireEvent.click(screen.getByText('Custom'))
    expect(screen.getByPlaceholderText('해결된 코드를 여기에 입력하세요...')).toBeInTheDocument()
  })

  it('shows abort button', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('머지 취소')).toBeInTheDocument()
  })

  it('calls onAbort and onClose when abort is clicked', async () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('머지 취소'))
    await waitFor(() => {
      expect(defaultProps.onAbort).toHaveBeenCalledTimes(1)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows merge complete button', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    expect(screen.getByText('머지 완료')).toBeInTheDocument()
  })

  it('disables merge complete button when not all files resolved', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    const completeBtn = screen.getByText('머지 완료').closest('button')
    expect(completeBtn).toBeDisabled()
  })

  it('enables merge complete when mergeStatus.can_commit is true', () => {
    const mergeStatus: MergeStatus = {
      merge_in_progress: true,
      unmerged_files: [],
      can_commit: true,
    }
    render(<ConflictResolverPanel {...defaultProps} mergeStatus={mergeStatus} />)
    const completeBtn = screen.getByText('머지 완료').closest('button')
    expect(completeBtn).not.toBeDisabled()
  })

  it('shows message when no conflict files exist', () => {
    render(<ConflictResolverPanel {...defaultProps} conflictFiles={[]} />)
    expect(screen.getByText('모든 충돌이 해결되었습니다')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<ConflictResolverPanel {...defaultProps} />)
    // Close button is the X in the header
    const closeButtons = screen.getAllByTestId('icon-X')
    // The close button wraps the X icon
    const closeBtnParent = closeButtons[0].closest('button')
    if (closeBtnParent) {
      fireEvent.click(closeBtnParent)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    }
  })
})
