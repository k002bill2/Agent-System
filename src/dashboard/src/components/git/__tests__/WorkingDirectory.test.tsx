import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkingDirectory } from '../WorkingDirectory'
import type { GitWorkingStatus, GitStatusFile, DraftCommit, DiffHunk } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileEdit: (props: Record<string, unknown>) => <span data-testid="icon-FileEdit" {...props} />,
  FilePlus: (props: Record<string, unknown>) => <span data-testid="icon-FilePlus" {...props} />,
  FileX: (props: Record<string, unknown>) => <span data-testid="icon-FileX" {...props} />,
  FileQuestion: (props: Record<string, unknown>) => <span data-testid="icon-FileQuestion" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Minus: (props: Record<string, unknown>) => <span data-testid="icon-Minus" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-RefreshCw" {...props} />,
  Send: (props: Record<string, unknown>) => <span data-testid="icon-Send" {...props} />,
  List: (props: Record<string, unknown>) => <span data-testid="icon-List" {...props} />,
  FolderTree: (props: Record<string, unknown>) => <span data-testid="icon-FolderTree" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-Sparkles" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-Loader2" {...props} />,
  ArrowUp: (props: Record<string, unknown>) => <span data-testid="icon-ArrowUp" {...props} />,
  Eye: (props: Record<string, unknown>) => <span data-testid="icon-Eye" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-ChevronRight" {...props} />,
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-ShieldAlert" {...props} />,
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-Shield" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
}))

// Mock FileGroupCard
vi.mock('../FileGroup', () => ({
  FileGroupCard: ({ group }: { group: { name: string } }) => (
    <div data-testid={`file-group-${group.name}`}>{group.name}</div>
  ),
}))

// Mock gitGrouping
vi.mock('../../../utils/gitGrouping', () => ({
  groupFilesByPattern: vi.fn((files: GitStatusFile[]) => [
    {
      name: 'default',
      type: 'misc',
      scope: null,
      files,
      suggestedCommit: 'chore: misc changes',
    },
  ]),
  draftCommitsToFileGroups: vi.fn((_drafts: DraftCommit[], files: GitStatusFile[]) => [
    {
      name: 'ai-group',
      type: 'feat',
      scope: null,
      files,
      suggestedCommit: 'feat: ai changes',
      isLLMGenerated: true,
    },
  ]),
}))

function makeFile(overrides: Partial<GitStatusFile> = {}): GitStatusFile {
  return {
    path: 'src/index.ts',
    status: 'modified',
    staged: false,
    old_path: null,
    ...overrides,
  }
}

function makeWorkingStatus(overrides: Partial<GitWorkingStatus> = {}): GitWorkingStatus {
  return {
    branch: 'main',
    is_clean: false,
    staged_files: [],
    unstaged_files: [makeFile()],
    untracked_files: [],
    total_changes: 1,
    ...overrides,
  }
}

describe('WorkingDirectory', () => {
  const defaultProps = {
    workingStatus: makeWorkingStatus(),
    isLoading: false,
    onRefresh: vi.fn(),
    onStageFiles: vi.fn().mockResolvedValue(true),
    onStageAll: vi.fn().mockResolvedValue(true),
    onUnstageFiles: vi.fn().mockResolvedValue(true),
    onUnstageAll: vi.fn().mockResolvedValue(true),
    onCommit: vi.fn().mockResolvedValue(true),
    onCommitAndPush: vi.fn().mockResolvedValue(true),
    // Diff
    onFetchFileDiff: vi.fn().mockResolvedValue(''),
    fileDiffs: {} as Record<string, string>,
    isLoadingDiff: false,
    // Staged diff review
    onFetchStagedDiff: vi.fn().mockResolvedValue(null),
    stagedDiff: null as string | null,
    // Hunk staging
    onFetchFileHunks: vi.fn().mockResolvedValue([]),
    onStageHunks: vi.fn().mockResolvedValue(true),
    fileHunks: {} as Record<string, DiffHunk[]>,
    // LLM Draft Commits
    draftCommits: [] as DraftCommit[],
    isGeneratingDrafts: false,
    onGenerateDrafts: vi.fn().mockResolvedValue([]),
    onClearDrafts: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state when workingStatus is null', () => {
    render(<WorkingDirectory {...defaultProps} workingStatus={null} />)
    expect(screen.getByText('Loading working directory status...')).toBeInTheDocument()
  })

  it('renders Working Directory heading', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('Working Directory')).toBeInTheDocument()
  })

  it('shows total changes count', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('1 file(s) changed')).toBeInTheDocument()
  })

  it('shows clean state when no changes', () => {
    const cleanStatus = makeWorkingStatus({
      is_clean: true,
      unstaged_files: [],
      total_changes: 0,
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={cleanStatus} />)
    expect(screen.getByText('Working directory is clean')).toBeInTheDocument()
    expect(screen.getByText('No changes to commit')).toBeInTheDocument()
  })

  it('calls onRefresh when Refresh button is clicked', () => {
    render(<WorkingDirectory {...defaultProps} />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows staged files section', () => {
    const status = makeWorkingStatus({
      staged_files: [makeFile({ path: 'staged.ts', staged: true, status: 'modified' })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    expect(screen.getByText('Staged Changes (1)')).toBeInTheDocument()
  })

  it('shows "No staged changes" when staged_files is empty', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('No staged changes')).toBeInTheDocument()
  })

  it('shows unstaged files section with file count', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('Unstaged Changes (1)')).toBeInTheDocument()
  })

  it('displays file paths in unstaged section', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('src/index.ts')).toBeInTheDocument()
  })

  it('shows Stage All button when there are unstaged files', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('Stage All')).toBeInTheDocument()
  })

  it('calls onStageAll when Stage All is clicked', () => {
    render(<WorkingDirectory {...defaultProps} />)
    fireEvent.click(screen.getByText('Stage All'))
    expect(defaultProps.onStageAll).toHaveBeenCalledTimes(1)
  })

  it('shows commit form when there are staged files', () => {
    const status = makeWorkingStatus({
      staged_files: [makeFile({ path: 'staged.ts', staged: true })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    expect(screen.getByPlaceholderText('Commit message...')).toBeInTheDocument()
    expect(screen.getByText('Commit')).toBeInTheDocument()
  })

  it('disables Commit button when commit message is empty', () => {
    const status = makeWorkingStatus({
      staged_files: [makeFile({ path: 'staged.ts', staged: true })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    const commitBtn = screen.getByText('Commit')
    expect(commitBtn).toBeDisabled()
  })

  it('calls onCommit with message when Commit is clicked', async () => {
    const status = makeWorkingStatus({
      staged_files: [makeFile({ path: 'staged.ts', staged: true })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    const textarea = screen.getByPlaceholderText('Commit message...')
    fireEvent.change(textarea, { target: { value: 'fix: bug' } })
    fireEvent.click(screen.getByText('Commit'))

    await waitFor(() => {
      expect(defaultProps.onCommit).toHaveBeenCalledWith('fix: bug')
    })
  })

  it('shows Commit & Push button when onCommitAndPush is provided', () => {
    const status = makeWorkingStatus({
      staged_files: [makeFile({ path: 'staged.ts', staged: true })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    expect(screen.getByText('Commit & Push')).toBeInTheDocument()
  })

  it('shows List and Grouped view mode toggle when not clean', () => {
    render(<WorkingDirectory {...defaultProps} />)
    expect(screen.getByText('List')).toBeInTheDocument()
    expect(screen.getByText('Grouped')).toBeInTheDocument()
  })

  it('does not show view mode toggle when clean', () => {
    const cleanStatus = makeWorkingStatus({
      is_clean: true,
      unstaged_files: [],
      total_changes: 0,
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={cleanStatus} />)
    expect(screen.queryByText('List')).not.toBeInTheDocument()
    expect(screen.queryByText('Grouped')).not.toBeInTheDocument()
  })

  it('switches to grouped view when Grouped button is clicked', () => {
    render(<WorkingDirectory {...defaultProps} />)
    fireEvent.click(screen.getByText('Grouped'))
    expect(screen.getByText('Smart Commit Suggestions')).toBeInTheDocument()
    expect(screen.getByText('Generate with AI')).toBeInTheDocument()
  })

  it('calls onGenerateDrafts when "Generate with AI" is clicked', () => {
    render(<WorkingDirectory {...defaultProps} />)
    fireEvent.click(screen.getByText('Grouped'))
    fireEvent.click(screen.getByText('Generate with AI'))
    expect(defaultProps.onGenerateDrafts).toHaveBeenCalledTimes(1)
  })

  it('shows "Analyzing..." when generating drafts', () => {
    render(<WorkingDirectory {...defaultProps} isGeneratingDrafts={true} />)
    fireEvent.click(screen.getByText('Grouped'))
    expect(screen.getByText('Analyzing...')).toBeInTheDocument()
  })

  it('shows AI-Generated Commits header when draftCommits exist', () => {
    const drafts: DraftCommit[] = [
      { message: 'feat: new', files: ['a.ts'], type: 'feat', scope: null },
    ]
    render(<WorkingDirectory {...defaultProps} draftCommits={drafts} />)
    fireEvent.click(screen.getByText('Grouped'))
    expect(screen.getByText('AI-Generated Commits')).toBeInTheDocument()
    expect(screen.getByText('Reset to Pattern')).toBeInTheDocument()
  })

  it('calls onClearDrafts when "Reset to Pattern" is clicked', () => {
    const drafts: DraftCommit[] = [
      { message: 'feat: new', files: ['a.ts'], type: 'feat', scope: null },
    ]
    render(<WorkingDirectory {...defaultProps} draftCommits={drafts} />)
    fireEvent.click(screen.getByText('Grouped'))
    fireEvent.click(screen.getByText('Reset to Pattern'))
    expect(defaultProps.onClearDrafts).toHaveBeenCalledTimes(1)
  })

  it('shows "No unstaged changes" when no unstaged files exist', () => {
    const status = makeWorkingStatus({
      unstaged_files: [],
      untracked_files: [],
      staged_files: [makeFile({ path: 'staged.ts', staged: true })],
    })
    render(<WorkingDirectory {...defaultProps} workingStatus={status} />)
    expect(screen.getByText('No unstaged changes')).toBeInTheDocument()
  })
})
