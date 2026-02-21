import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  FolderPlus: (props: Record<string, unknown>) => <span data-testid="icon-folder-plus" {...props} />,
  Link: (props: Record<string, unknown>) => <span data-testid="icon-link" {...props} />,
  Pencil: (props: Record<string, unknown>) => <span data-testid="icon-pencil" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <span data-testid="icon-folder-open" {...props} />,
}))

const mockCloseModal = vi.fn()
const mockCreateProject = vi.fn()
const mockLinkProject = vi.fn()
const mockUpdateProject = vi.fn()

let storeState: Record<string, unknown> = {
  modalMode: null,
  editingProject: null,
  templates: [
    { id: 'default', name: 'Default', description: 'Default project template' },
    { id: 'custom', name: 'Custom', description: 'Custom template' },
  ],
  isLoading: false,
  error: null,
  closeModal: mockCloseModal,
  createProject: mockCreateProject,
  linkProject: mockLinkProject,
  updateProject: mockUpdateProject,
}

vi.mock('../../stores/projects', () => ({
  useProjectsStore: vi.fn(() => storeState),
}))

import { ProjectFormModal } from '../ProjectFormModal'

describe('ProjectFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      modalMode: null,
      editingProject: null,
      templates: [
        { id: 'default', name: 'Default', description: 'Default project template' },
        { id: 'custom', name: 'Custom', description: 'Custom template' },
      ],
      isLoading: false,
      error: null,
      closeModal: mockCloseModal,
      createProject: mockCreateProject,
      linkProject: mockLinkProject,
      updateProject: mockUpdateProject,
    }
  })

  it('returns null when modalMode is null', () => {
    const { container } = render(<ProjectFormModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders create modal with title', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Create New Project')).toBeInTheDocument()
  })

  it('renders link modal with title', () => {
    storeState.modalMode = 'link'
    render(<ProjectFormModal />)
    expect(screen.getByText('Link Existing Project')).toBeInTheDocument()
  })

  it('renders edit modal with title', () => {
    storeState.modalMode = 'edit'
    storeState.editingProject = { id: 'test', name: 'Test', path: '/path', description: 'Desc' }
    render(<ProjectFormModal />)
    expect(screen.getByText('Edit Project')).toBeInTheDocument()
  })

  it('shows template selector in create mode', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Template')).toBeInTheDocument()
    expect(screen.getByText('Default project template')).toBeInTheDocument()
  })

  it('does not show template selector in link mode', () => {
    storeState.modalMode = 'link'
    render(<ProjectFormModal />)
    expect(screen.queryByText('Template')).not.toBeInTheDocument()
  })

  it('shows source path field in link mode', () => {
    storeState.modalMode = 'link'
    render(<ProjectFormModal />)
    expect(screen.getByText('Source Path *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('/absolute/path/to/project')).toBeInTheDocument()
  })

  it('does not show source path in create mode', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.queryByText('Source Path *')).not.toBeInTheDocument()
  })

  it('shows project name field', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Project Name *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument()
  })

  it('shows project ID field in create mode', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Project ID *')).toBeInTheDocument()
  })

  it('does not show project ID field in edit mode', () => {
    storeState.modalMode = 'edit'
    storeState.editingProject = { id: 'test', name: 'Test', path: '/path', description: 'Desc' }
    render(<ProjectFormModal />)
    expect(screen.queryByText('Project ID *')).not.toBeInTheDocument()
  })

  it('shows project path field in edit mode', () => {
    storeState.modalMode = 'edit'
    storeState.editingProject = { id: 'test', name: 'Test', path: '/path', description: 'Desc' }
    render(<ProjectFormModal />)
    expect(screen.getByText('Project Path')).toBeInTheDocument()
  })

  it('shows description field', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('shows cancel button', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls closeModal when cancel is clicked', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCloseModal).toHaveBeenCalled()
  })

  it('shows "Create Project" submit button in create mode', () => {
    storeState.modalMode = 'create'
    render(<ProjectFormModal />)
    expect(screen.getByText('Create Project')).toBeInTheDocument()
  })

  it('shows "Link Project" submit button in link mode', () => {
    storeState.modalMode = 'link'
    render(<ProjectFormModal />)
    expect(screen.getByText('Link Project')).toBeInTheDocument()
  })

  it('shows "Save Changes" submit button in edit mode', () => {
    storeState.modalMode = 'edit'
    storeState.editingProject = { id: 'test', name: 'Test', path: '/path', description: 'Desc' }
    render(<ProjectFormModal />)
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('shows error message when error is set', () => {
    storeState.modalMode = 'create'
    storeState.error = 'Project already exists'
    render(<ProjectFormModal />)
    expect(screen.getByText('Project already exists')).toBeInTheDocument()
  })

  it('disables submit button when loading', () => {
    storeState.modalMode = 'create'
    storeState.isLoading = true
    render(<ProjectFormModal />)
    expect(screen.getByText('Create Project').closest('button')).toBeDisabled()
  })

  it('shows loader icon when loading', () => {
    storeState.modalMode = 'create'
    storeState.isLoading = true
    render(<ProjectFormModal />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('populates form fields in edit mode', () => {
    storeState.modalMode = 'edit'
    storeState.editingProject = { id: 'my-proj', name: 'My Project', path: '/my/path', description: 'Some desc' }
    render(<ProjectFormModal />)
    expect(screen.getByDisplayValue('My Project')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Some desc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/my/path')).toBeInTheDocument()
  })
})
