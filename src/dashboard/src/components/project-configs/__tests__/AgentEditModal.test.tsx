import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentEditModal } from '../AgentEditModal'

const mockCloseAgentModal = vi.fn()
const mockCreateAgent = vi.fn()
const mockUpdateAgent = vi.fn()
const mockClearError = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

describe('AgentEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      agentModalMode: null,
      editingAgent: null,
      selectedProject: {
        project: { project_id: 'proj-1' },
      },
      agentContent: null,
      isLoadingContent: false,
      savingAgent: false,
      error: null,
      closeAgentModal: mockCloseAgentModal,
      createAgent: mockCreateAgent,
      updateAgent: mockUpdateAgent,
      clearError: mockClearError,
    }
  })

  it('returns null when agentModalMode is null', () => {
    const { container } = render(<AgentEditModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders create modal with correct title', () => {
    mockStoreState.agentModalMode = 'create'
    render(<AgentEditModal />)
    expect(screen.getByRole('heading', { name: 'Create Agent' })).toBeInTheDocument()
  })

  it('renders edit modal with agent name', () => {
    mockStoreState.agentModalMode = 'edit'
    mockStoreState.editingAgent = {
      agent_id: 'web-agent',
      name: 'Web Agent',
      is_shared: false,
    }
    render(<AgentEditModal />)
    expect(screen.getByText('Edit Agent: Web Agent')).toBeInTheDocument()
  })

  it('shows Agent ID input in create mode', () => {
    mockStoreState.agentModalMode = 'create'
    render(<AgentEditModal />)
    expect(screen.getByText('Agent ID *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-agent')).toBeInTheDocument()
  })

  it('does not show Agent ID input in edit mode', () => {
    mockStoreState.agentModalMode = 'edit'
    mockStoreState.editingAgent = { agent_id: 'a1', name: 'Agent', is_shared: false }
    render(<AgentEditModal />)
    expect(screen.queryByText('Agent ID *')).not.toBeInTheDocument()
  })

  it('shows shared checkbox in create mode', () => {
    mockStoreState.agentModalMode = 'create'
    render(<AgentEditModal />)
    expect(screen.getByLabelText(/Create as shared agent/)).toBeInTheDocument()
  })

  it('shows loading state when content is loading', () => {
    mockStoreState.agentModalMode = 'edit'
    mockStoreState.editingAgent = { agent_id: 'a1', name: 'Agent', is_shared: false }
    mockStoreState.isLoadingContent = true
    render(<AgentEditModal />)
    expect(screen.getByText('Loading content...')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStoreState.agentModalMode = 'create'
    mockStoreState.error = 'Failed to create agent'
    render(<AgentEditModal />)
    expect(screen.getByText('Failed to create agent')).toBeInTheDocument()
  })

  it('calls closeAgentModal when Cancel clicked', () => {
    mockStoreState.agentModalMode = 'create'
    render(<AgentEditModal />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCloseAgentModal).toHaveBeenCalledTimes(1)
  })

  it('toggles preview mode', () => {
    mockStoreState.agentModalMode = 'create'
    render(<AgentEditModal />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Preview'))
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows correct submit button text for create/edit modes', () => {
    mockStoreState.agentModalMode = 'create'
    const { rerender } = render(<AgentEditModal />)
    const submitBtn = screen.getByRole('button', { name: /Create Agent/i })
    expect(submitBtn).toBeInTheDocument()

    mockStoreState.agentModalMode = 'edit'
    mockStoreState.editingAgent = { agent_id: 'a1', name: 'Agent', is_shared: false }
    rerender(<AgentEditModal />)
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  })

  it('disables submit button when saving', () => {
    mockStoreState.agentModalMode = 'create'
    mockStoreState.savingAgent = true
    render(<AgentEditModal />)
    const buttons = screen.getAllByRole('button')
    const submitButton = buttons.find(b => b.getAttribute('type') === 'submit')
    expect(submitButton).toBeDisabled()
  })
})
