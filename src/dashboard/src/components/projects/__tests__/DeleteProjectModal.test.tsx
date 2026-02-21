import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteProjectModal } from '../DeleteProjectModal'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    X: icon('x'),
    AlertTriangle: icon('alert'),
    Loader2: icon('loader'),
    Database: icon('database'),
    FolderOpen: icon('folder'),
    FileText: icon('file-text'),
    CheckCircle: icon('check'),
  }
})

const mockProject = {
  id: 'proj-1',
  name: 'Test Project',
  path: '/path/to/project',
  description: 'A test project',
  has_claude_md: false,
  vector_store_initialized: false,
  indexed_at: null,
  git_path: null,
  git_enabled: false,
  sort_order: 0,
  is_active: true,
}

const mockPreview = {
  project_id: 'proj-1',
  project_name: 'Test Project',
  project_path: '/path/to/project',
  sessions_count: 5,
  tasks_count: 10,
  messages_count: 50,
  approvals_count: 2,
  feedbacks_count: 3,
  dataset_entries_count: 0,
  has_rag_index: true,
  rag_chunks_count: 100,
  has_symlink: true,
  source_files_preserved: true,
}

describe('DeleteProjectModal', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn().mockResolvedValue(undefined)
  const mockFetchPreview = vi.fn().mockResolvedValue(mockPreview)

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchPreview.mockResolvedValue(mockPreview)
  })

  it('renders title with project name', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    // "Delete Project" appears in both the heading and the button
    expect(screen.getByRole('heading', { name: /Delete Project/ })).toBeInTheDocument()
    // "Test Project" appears in the header subtitle
    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })
  })

  it('shows loading state initially', () => {
    mockFetchPreview.mockImplementation(() => new Promise(() => {}))
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    expect(screen.getByText('Loading preview...')).toBeInTheDocument()
  })

  it('shows preview data after loading', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('The following will be deleted:')).toBeInTheDocument()
    })
    expect(screen.getByText('Database Records')).toBeInTheDocument()
    expect(screen.getByText('RAG Vector Index')).toBeInTheDocument()
    expect(screen.getByText('Project Link')).toBeInTheDocument()
  })

  it('shows source files preserved note', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/Source files will NOT be deleted/)).toBeInTheDocument()
    })
  })

  it('shows confirmation input', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter project name')).toBeInTheDocument()
    })
  })

  it('disables delete button until name matches', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter project name')).toBeInTheDocument()
    })

    const deleteBtn = screen.getByRole('button', { name: /Delete Project/i })
    expect(deleteBtn).toBeDisabled()

    const input = screen.getByPlaceholderText('Enter project name')
    fireEvent.change(input, { target: { value: 'Test Project' } })
    expect(deleteBtn).not.toBeDisabled()
  })

  it('calls onConfirm and onClose on delete', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter project name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Enter project name')
    fireEvent.change(input, { target: { value: 'Test Project' } })

    fireEvent.click(screen.getByRole('button', { name: /Delete Project/i }))

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('calls onClose on Cancel button', async () => {
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onClose on backdrop click', async () => {
    const { container } = render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    const backdrop = container.querySelector('.bg-black\\/50')
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(mockOnClose).toHaveBeenCalled()
    }
  })

  it('shows error when fetchPreview fails', async () => {
    mockFetchPreview.mockRejectedValue(new Error('Load failed'))
    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Load failed')).toBeInTheDocument()
    })
  })

  it('shows no data to delete when preview is empty', async () => {
    mockFetchPreview.mockResolvedValue({
      ...mockPreview,
      sessions_count: 0,
      tasks_count: 0,
      messages_count: 0,
      approvals_count: 0,
      feedbacks_count: 0,
      dataset_entries_count: 0,
      has_rag_index: false,
      rag_chunks_count: 0,
      has_symlink: false,
    })

    render(
      <DeleteProjectModal
        project={mockProject}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        fetchPreview={mockFetchPreview}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('No associated data to delete')).toBeInTheDocument()
    })
  })
})
