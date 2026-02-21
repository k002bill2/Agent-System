import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileGroupCard } from '../FileGroup'
import type { GitStatusFile } from '../../../stores/git'
import type { FileGroup } from '../../../utils/gitGrouping'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileEdit: (props: Record<string, unknown>) => <span data-testid="icon-FileEdit" {...props} />,
  FilePlus: (props: Record<string, unknown>) => <span data-testid="icon-FilePlus" {...props} />,
  FileX: (props: Record<string, unknown>) => <span data-testid="icon-FileX" {...props} />,
  FileQuestion: (props: Record<string, unknown>) => <span data-testid="icon-FileQuestion" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-ChevronRight" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-MessageSquare" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Send: (props: Record<string, unknown>) => <span data-testid="icon-Send" {...props} />,
  Copy: (props: Record<string, unknown>) => <span data-testid="icon-Copy" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-Sparkles" {...props} />,
  Pencil: (props: Record<string, unknown>) => <span data-testid="icon-Pencil" {...props} />,
  Files: (props: Record<string, unknown>) => <span data-testid="icon-Files" {...props} />,
  ArrowUp: (props: Record<string, unknown>) => <span data-testid="icon-ArrowUp" {...props} />,
}))

function makeFile(overrides: Partial<GitStatusFile> = {}): GitStatusFile {
  return {
    path: 'src/app.ts',
    status: 'modified',
    staged: false,
    old_path: null,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<FileGroup> = {}): FileGroup {
  return {
    name: 'Dashboard Components',
    type: 'feat',
    scope: 'components',
    files: [
      makeFile({ path: 'src/components/App.tsx', status: 'modified' }),
      makeFile({ path: 'src/components/Header.tsx', status: 'added' }),
    ],
    suggestedCommit: 'feat(components): update 1 file, add 1 new file',
    ...overrides,
  }
}

describe('FileGroupCard', () => {
  const defaultProps = {
    group: makeGroup(),
    selectedFiles: new Set<string>(),
    onSelectFile: vi.fn(),
    onStageFiles: vi.fn().mockResolvedValue(true),
    onCommitGroup: vi.fn().mockResolvedValue(true),
    isLoading: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the suggested commit message', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('feat(components): update 1 file, add 1 new file')).toBeInTheDocument()
  })

  it('displays file count', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('2 files')).toBeInTheDocument()
  })

  it('shows file paths in the files section', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('src/components/Header.tsx')).toBeInTheDocument()
  })

  it('shows status badges for modified and added files', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('1M')).toBeInTheDocument()
    expect(screen.getByText('1A')).toBeInTheDocument()
  })

  it('shows AI badge when isLLMGenerated is true', () => {
    const group = makeGroup({ isLLMGenerated: true })
    render(<FileGroupCard {...defaultProps} group={group} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('does not show AI badge when isLLMGenerated is false', () => {
    const group = makeGroup({ isLLMGenerated: false })
    render(<FileGroupCard {...defaultProps} group={group} />)
    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })

  it('shows Stage All button when not all files are staged', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('Stage All')).toBeInTheDocument()
  })

  it('hides Stage All button when all files are staged', () => {
    const group = makeGroup({
      files: [
        makeFile({ path: 'src/a.ts', staged: true }),
        makeFile({ path: 'src/b.ts', staged: true }),
      ],
    })
    render(<FileGroupCard {...defaultProps} group={group} />)
    expect(screen.queryByText('Stage All')).not.toBeInTheDocument()
  })

  it('shows Commit button', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.getByText('Commit')).toBeInTheDocument()
  })

  it('shows Commit & Push button when onCommitAndPush provided', () => {
    const onCommitAndPush = vi.fn().mockResolvedValue(true)
    render(<FileGroupCard {...defaultProps} onCommitAndPush={onCommitAndPush} />)
    expect(screen.getByText('Commit & Push')).toBeInTheDocument()
  })

  it('does not show Commit & Push when onCommitAndPush not provided', () => {
    render(<FileGroupCard {...defaultProps} />)
    expect(screen.queryByText('Commit & Push')).not.toBeInTheDocument()
  })

  it('toggles file list when Files section button is clicked', () => {
    render(<FileGroupCard {...defaultProps} />)

    // Files are visible by default
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(screen.getByText('Files'))
    expect(screen.queryByText('src/components/App.tsx')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('Files'))
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()
  })

  it('shows selected file count when files are selected', () => {
    const selectedFiles = new Set(['src/components/App.tsx'])
    render(<FileGroupCard {...defaultProps} selectedFiles={selectedFiles} />)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows staged count badge when some files are staged', () => {
    const group = makeGroup({
      files: [
        makeFile({ path: 'src/a.ts', staged: true }),
        makeFile({ path: 'src/b.ts', staged: false }),
      ],
    })
    render(<FileGroupCard {...defaultProps} group={group} />)
    expect(screen.getByText('1 staged')).toBeInTheDocument()
  })

  it('shows deleted file status badge', () => {
    const group = makeGroup({
      files: [makeFile({ path: 'src/old.ts', status: 'deleted' })],
    })
    render(<FileGroupCard {...defaultProps} group={group} />)
    expect(screen.getByText('1D')).toBeInTheDocument()
  })
})
