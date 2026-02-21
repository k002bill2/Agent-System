import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { DiffEntry } from '../../stores/diff'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-file" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  SplitSquareVertical: (props: Record<string, unknown>) => <span data-testid="icon-split" {...props} />,
  AlignJustify: (props: Record<string, unknown>) => <span data-testid="icon-unified" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-plus" {...props} />,
  Minus: (props: Record<string, unknown>) => <span data-testid="icon-minus" {...props} />,
}))

// Mock the diff library
vi.mock('diff', () => ({
  createTwoFilesPatch: vi.fn(
    (_oldFile: string, _newFile: string, oldContent: string, newContent: string) => {
      if (oldContent === newContent) return ''
      return `--- a/file.ts\n+++ b/file.ts\n@@ -1,2 +1,2 @@\n-${oldContent}\n+${newContent}\n context line\n`
    }
  ),
}))

const mockSetViewMode = vi.fn()
const mockUpdateEntryStatus = vi.fn()
const mockSelectEntry = vi.fn()

let storeState = {
  viewMode: 'unified' as 'split' | 'unified',
  setViewMode: mockSetViewMode,
  updateEntryStatus: mockUpdateEntryStatus,
  entries: [] as DiffEntry[],
  selectedEntryId: null as string | null,
  selectEntry: mockSelectEntry,
}

vi.mock('../../stores/diff', () => ({
  useDiffStore: vi.fn(() => storeState),
}))

import { DiffViewer, DiffPanel } from '../DiffViewer'

const mockEntry: DiffEntry = {
  id: 'diff-1',
  taskId: 'task-1',
  filePath: 'src/components/App.tsx',
  oldContent: 'old content here',
  newContent: 'new content here',
  status: 'pending',
  createdAt: '2026-01-15T10:00:00Z',
}

describe('DiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      viewMode: 'unified',
      setViewMode: mockSetViewMode,
      updateEntryStatus: mockUpdateEntryStatus,
      entries: [],
      selectedEntryId: null,
      selectEntry: mockSelectEntry,
    }
  })

  it('shows placeholder when no entry provided', () => {
    render(<DiffViewer />)
    expect(screen.getByText('Select a file to view changes')).toBeInTheDocument()
  })

  it('renders file name from path', () => {
    render(<DiffViewer entry={mockEntry} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('renders full file path', () => {
    render(<DiffViewer entry={mockEntry} />)
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()
  })

  it('renders status badge for pending', () => {
    render(<DiffViewer entry={mockEntry} />)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('renders status badge for applied', () => {
    const appliedEntry = { ...mockEntry, status: 'applied' as const }
    render(<DiffViewer entry={appliedEntry} />)
    expect(screen.getByText('applied')).toBeInTheDocument()
  })

  it('renders status badge for rejected', () => {
    const rejectedEntry = { ...mockEntry, status: 'rejected' as const }
    render(<DiffViewer entry={rejectedEntry} />)
    expect(screen.getByText('rejected')).toBeInTheDocument()
  })

  it('shows Apply and Reject buttons for pending entries', () => {
    render(<DiffViewer entry={mockEntry} />)
    expect(screen.getByText('Apply')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
  })

  it('does not show Apply/Reject for non-pending entries', () => {
    const appliedEntry = { ...mockEntry, status: 'applied' as const }
    render(<DiffViewer entry={appliedEntry} />)
    expect(screen.queryByText('Apply')).not.toBeInTheDocument()
    expect(screen.queryByText('Reject')).not.toBeInTheDocument()
  })

  it('calls updateEntryStatus with "applied" when Apply clicked', () => {
    render(<DiffViewer entry={mockEntry} />)
    fireEvent.click(screen.getByText('Apply'))
    expect(mockUpdateEntryStatus).toHaveBeenCalledWith('diff-1', 'applied')
  })

  it('calls updateEntryStatus with "rejected" when Reject clicked', () => {
    render(<DiffViewer entry={mockEntry} />)
    fireEvent.click(screen.getByText('Reject'))
    expect(mockUpdateEntryStatus).toHaveBeenCalledWith('diff-1', 'rejected')
  })

  it('renders view mode toggle buttons', () => {
    render(<DiffViewer entry={mockEntry} />)
    expect(screen.getByTitle('Split view')).toBeInTheDocument()
    expect(screen.getByTitle('Unified view')).toBeInTheDocument()
  })

  it('calls setViewMode when split button clicked', () => {
    render(<DiffViewer entry={mockEntry} />)
    fireEvent.click(screen.getByTitle('Split view'))
    expect(mockSetViewMode).toHaveBeenCalledWith('split')
  })

  it('calls setViewMode when unified button clicked', () => {
    render(<DiffViewer entry={mockEntry} />)
    fireEvent.click(screen.getByTitle('Unified view'))
    expect(mockSetViewMode).toHaveBeenCalledWith('unified')
  })

  it('accepts className prop', () => {
    const { container } = render(<DiffViewer className="custom-class" />)
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })
})

describe('DiffPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      viewMode: 'unified',
      setViewMode: mockSetViewMode,
      updateEntryStatus: mockUpdateEntryStatus,
      entries: [],
      selectedEntryId: null,
      selectEntry: mockSelectEntry,
    }
  })

  it('shows empty state when no entries', () => {
    render(<DiffPanel />)
    expect(screen.getByText('No file changes')).toBeInTheDocument()
  })

  it('renders file entries when present', () => {
    storeState.entries = [
      mockEntry,
      { ...mockEntry, id: 'diff-2', filePath: 'src/utils/helpers.ts', status: 'applied' as const },
    ]
    render(<DiffPanel />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
  })

  it('shows entry status badges', () => {
    storeState.entries = [mockEntry]
    render(<DiffPanel />)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows stats footer with counts', () => {
    storeState.entries = [
      mockEntry,
      { ...mockEntry, id: 'diff-2', status: 'applied' as const },
    ]
    render(<DiffPanel />)
    expect(screen.getByText('2 changes (1 pending)')).toBeInTheDocument()
  })

  it('calls selectEntry when file button clicked', () => {
    storeState.entries = [mockEntry]
    render(<DiffPanel />)
    fireEvent.click(screen.getByText('App.tsx'))
    expect(mockSelectEntry).toHaveBeenCalledWith('diff-1')
  })

  it('renders full path as subtitle', () => {
    storeState.entries = [mockEntry]
    render(<DiffPanel />)
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()
  })
})
