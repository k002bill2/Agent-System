import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandEditModal } from '../CommandEditModal'

const mockCloseCommandModal = vi.fn()
const mockCreateCommand = vi.fn()
const mockUpdateCommand = vi.fn()
const mockClearError = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

describe('CommandEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      commandModalMode: null,
      editingCommand: null,
      selectedProject: {
        project: { project_id: 'proj-1' },
      },
      commandContent: null,
      isLoadingContent: false,
      savingCommand: false,
      error: null,
      closeCommandModal: mockCloseCommandModal,
      createCommand: mockCreateCommand,
      updateCommand: mockUpdateCommand,
      clearError: mockClearError,
    }
  })

  it('returns null when commandModalMode is null', () => {
    const { container } = render(<CommandEditModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders create modal with correct title', () => {
    mockStoreState.commandModalMode = 'create'
    render(<CommandEditModal />)
    expect(screen.getByRole('heading', { name: 'Create Command' })).toBeInTheDocument()
  })

  it('renders edit modal with command id', () => {
    mockStoreState.commandModalMode = 'edit'
    mockStoreState.editingCommand = {
      command_id: 'deploy',
      project_id: 'proj-1',
      name: 'deploy',
      description: 'Deploy to prod',
      file_path: '/path',
      allowed_tools: null,
      argument_hint: null,
      modified_at: null,
    }
    render(<CommandEditModal />)
    expect(screen.getByText('Edit Command: /deploy')).toBeInTheDocument()
  })

  it('shows Command ID input in create mode', () => {
    mockStoreState.commandModalMode = 'create'
    render(<CommandEditModal />)
    expect(screen.getByText('Command ID *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-command')).toBeInTheDocument()
  })

  it('does not show Command ID input in edit mode', () => {
    mockStoreState.commandModalMode = 'edit'
    mockStoreState.editingCommand = {
      command_id: 'deploy',
      project_id: 'proj-1',
      name: 'deploy',
      description: null,
      file_path: '/path',
      allowed_tools: null,
      argument_hint: null,
      modified_at: null,
    }
    render(<CommandEditModal />)
    expect(screen.queryByText('Command ID *')).not.toBeInTheDocument()
  })

  it('shows loading state when content is loading', () => {
    mockStoreState.commandModalMode = 'edit'
    mockStoreState.editingCommand = {
      command_id: 'deploy',
      project_id: 'proj-1',
      name: 'deploy',
      description: null,
      file_path: '/path',
      allowed_tools: null,
      argument_hint: null,
      modified_at: null,
    }
    mockStoreState.isLoadingContent = true
    render(<CommandEditModal />)
    expect(screen.getByText('Loading content...')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStoreState.commandModalMode = 'create'
    mockStoreState.error = 'Failed to create command'
    render(<CommandEditModal />)
    expect(screen.getByText('Failed to create command')).toBeInTheDocument()
  })

  it('calls closeCommandModal when Cancel clicked', () => {
    mockStoreState.commandModalMode = 'create'
    render(<CommandEditModal />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCloseCommandModal).toHaveBeenCalledTimes(1)
  })

  it('toggles preview mode', () => {
    mockStoreState.commandModalMode = 'create'
    render(<CommandEditModal />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Preview'))
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows correct submit button text for create/edit modes', () => {
    mockStoreState.commandModalMode = 'create'
    const { rerender } = render(<CommandEditModal />)
    expect(screen.getByRole('button', { name: /Create Command/i })).toBeInTheDocument()

    mockStoreState.commandModalMode = 'edit'
    mockStoreState.editingCommand = {
      command_id: 'deploy',
      project_id: 'proj-1',
      name: 'deploy',
      description: null,
      file_path: '/path',
      allowed_tools: null,
      argument_hint: null,
      modified_at: null,
    }
    rerender(<CommandEditModal />)
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  })

  it('disables submit button when saving', () => {
    mockStoreState.commandModalMode = 'create'
    mockStoreState.savingCommand = true
    render(<CommandEditModal />)
    const buttons = screen.getAllByRole('button')
    const submitButton = buttons.find(b => b.getAttribute('type') === 'submit')
    expect(submitButton).toBeDisabled()
  })

  it('shows Command Content textarea in create mode', () => {
    mockStoreState.commandModalMode = 'create'
    render(<CommandEditModal />)
    expect(screen.getByText('Command Content *')).toBeInTheDocument()
  })
})
