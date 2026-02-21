import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPServerModal } from '../MCPServerModal'

const mockCloseMCPModal = vi.fn()
const mockCreateMCPServer = vi.fn()
const mockUpdateMCPServer = vi.fn()
const mockClearError = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

describe('MCPServerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      mcpModalMode: null,
      editingMCPServer: null,
      selectedProject: {
        project: { project_id: 'proj-1' },
      },
      savingMCP: false,
      error: null,
      closeMCPModal: mockCloseMCPModal,
      createMCPServer: mockCreateMCPServer,
      updateMCPServer: mockUpdateMCPServer,
      clearError: mockClearError,
    }
  })

  it('returns null when mcpModalMode is null', () => {
    const { container } = render(<MCPServerModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders create modal with correct title', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByRole('heading', { name: 'Add MCP Server' })).toBeInTheDocument()
  })

  it('renders edit modal with correct title', () => {
    mockStoreState.mcpModalMode = 'edit'
    mockStoreState.editingMCPServer = {
      server_id: 'github',
      project_id: 'proj-1',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'token123' },
      disabled: false,
      note: 'GitHub MCP',
      server_type: 'npx',
      package_name: '@modelcontextprotocol/server-github',
      source: 'project',
    }
    render(<MCPServerModal />)
    expect(screen.getByRole('heading', { name: 'Edit MCP Server' })).toBeInTheDocument()
  })

  it('shows Server ID input in create mode', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByText('Server ID *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-server')).toBeInTheDocument()
  })

  it('does not show Server ID input in edit mode', () => {
    mockStoreState.mcpModalMode = 'edit'
    mockStoreState.editingMCPServer = {
      server_id: 'github',
      project_id: 'proj-1',
      command: 'npx',
      args: [],
      env: {},
      disabled: false,
      note: '',
      server_type: 'npx',
      package_name: '',
      source: 'project',
    }
    render(<MCPServerModal />)
    expect(screen.queryByText('Server ID *')).not.toBeInTheDocument()
  })

  it('shows Command select field', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByText('Command *')).toBeInTheDocument()
    expect(screen.getByDisplayValue('npx')).toBeInTheDocument()
  })

  it('shows Arguments section', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByText('Arguments')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add argument...')).toBeInTheDocument()
  })

  it('shows Environment Variables section', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByText('Environment Variables')).toBeInTheDocument()
    expect(screen.getByText('Add environment variable')).toBeInTheDocument()
  })

  it('shows Note input', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByText('Note')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Optional note about this server...')).toBeInTheDocument()
  })

  it('shows Start disabled checkbox', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    expect(screen.getByLabelText('Start disabled')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStoreState.mcpModalMode = 'create'
    mockStoreState.error = 'Failed to create server'
    render(<MCPServerModal />)
    expect(screen.getByText('Failed to create server')).toBeInTheDocument()
  })

  it('calls closeMCPModal when Cancel clicked', () => {
    mockStoreState.mcpModalMode = 'create'
    render(<MCPServerModal />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCloseMCPModal).toHaveBeenCalledTimes(1)
  })

  it('shows correct submit button text for create/edit modes', () => {
    mockStoreState.mcpModalMode = 'create'
    const { rerender } = render(<MCPServerModal />)
    expect(screen.getByRole('button', { name: /Create Server/i })).toBeInTheDocument()

    mockStoreState.mcpModalMode = 'edit'
    mockStoreState.editingMCPServer = {
      server_id: 'github',
      project_id: 'proj-1',
      command: 'npx',
      args: [],
      env: {},
      disabled: false,
      note: '',
      server_type: 'npx',
      package_name: '',
      source: 'project',
    }
    rerender(<MCPServerModal />)
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  })

  it('disables submit button when saving', () => {
    mockStoreState.mcpModalMode = 'create'
    mockStoreState.savingMCP = true
    render(<MCPServerModal />)
    const buttons = screen.getAllByRole('button')
    const submitButton = buttons.find(b => b.getAttribute('type') === 'submit')
    expect(submitButton).toBeDisabled()
  })
})
