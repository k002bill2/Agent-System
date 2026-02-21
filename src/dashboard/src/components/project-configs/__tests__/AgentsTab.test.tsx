import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentsTab } from '../AgentsTab'

const mockOpenAgentModal = vi.fn()
const mockDeleteAgent = vi.fn()
const mockCopyAgent = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

// Mock child modals
vi.mock('../AgentEditModal', () => ({
  AgentEditModal: () => null,
}))
vi.mock('../ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}))
vi.mock('../CopyToProjectModal', () => ({
  CopyToProjectModal: () => null,
}))

const mockAgents = [
  {
    agent_id: 'web-agent',
    project_id: 'proj-1',
    name: 'Web Agent',
    description: 'UI specialist',
    is_shared: false,
    model: 'sonnet',
    role: null,
    tools: ['Read', 'Edit'],
    file_path: null,
    modified_at: null,
    ace_capabilities: null,
  },
  {
    agent_id: 'shared-agent',
    project_id: 'proj-1',
    name: 'Shared Agent',
    description: 'Shared framework',
    is_shared: true,
    model: 'opus',
    role: null,
    tools: ['Bash'],
    file_path: null,
    modified_at: null,
    ace_capabilities: null,
  },
]

describe('AgentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: {
        project: { project_id: 'proj-1' },
        agents: mockAgents,
      },
      isLoadingProject: false,
      openAgentModal: mockOpenAgentModal,
      deleteAgent: mockDeleteAgent,
      deletingAgents: new Set(),
      copyAgent: mockCopyAgent,
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<AgentsTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<AgentsTab />)
    expect(screen.getByText('Select a project to view agents')).toBeInTheDocument()
  })

  it('renders agents count in header', () => {
    render(<AgentsTab />)
    expect(screen.getByText('Agents (2)')).toBeInTheDocument()
  })

  it('separates regular and shared agents', () => {
    render(<AgentsTab />)
    expect(screen.getByText('Project Agents (1)')).toBeInTheDocument()
    expect(screen.getByText('Shared Agents (1)')).toBeInTheDocument()
  })

  it('renders agent names', () => {
    render(<AgentsTab />)
    expect(screen.getByText('Web Agent')).toBeInTheDocument()
    expect(screen.getByText('Shared Agent')).toBeInTheDocument()
  })

  it('shows Create Agent button', () => {
    render(<AgentsTab />)
    const createBtn = screen.getByText('Create Agent')
    expect(createBtn).toBeInTheDocument()
  })

  it('calls openAgentModal on Create Agent click', () => {
    render(<AgentsTab />)
    fireEvent.click(screen.getByText('Create Agent'))
    expect(mockOpenAgentModal).toHaveBeenCalledWith('create')
  })

  it('shows empty state when no agents', () => {
    mockStoreState.selectedProject = {
      project: { project_id: 'proj-1' },
      agents: [],
    }
    render(<AgentsTab />)
    expect(screen.getByText('No agents found in this project')).toBeInTheDocument()
  })

  it('renders agent tools', () => {
    render(<AgentsTab />)
    expect(screen.getByText('Read, Edit')).toBeInTheDocument()
    expect(screen.getByText('Bash')).toBeInTheDocument()
  })

  it('renders agent model badges', () => {
    render(<AgentsTab />)
    expect(screen.getByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText('opus')).toBeInTheDocument()
  })
})
