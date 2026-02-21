import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPTab } from '../MCPTab'

const mockOpenMCPModal = vi.fn()
const mockDeleteMCPServer = vi.fn()
const mockToggleMCPServer = vi.fn()
const mockCopyMCPServer = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

// Mock child modals
vi.mock('../MCPServerModal', () => ({
  MCPServerModal: () => null,
}))
vi.mock('../ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}))
vi.mock('../CopyToProjectModal', () => ({
  CopyToProjectModal: () => null,
}))

const mockMCPServers = [
  {
    server_id: 'github',
    project_id: 'proj-1',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: 'token123' },
    disabled: false,
    note: 'GitHub integration',
    server_type: 'npx',
    package_name: '@modelcontextprotocol/server-github',
    source: 'project',
  },
  {
    server_id: 'slack',
    project_id: 'proj-1',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: {},
    disabled: true,
    note: '',
    server_type: 'npx',
    package_name: '@modelcontextprotocol/server-slack',
    source: 'project',
  },
]

const mockUserMCPServers = [
  {
    server_id: 'filesystem',
    project_id: 'proj-1',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    env: {},
    disabled: false,
    note: '',
    server_type: 'npx',
    package_name: '@modelcontextprotocol/server-filesystem',
    source: 'user',
  },
]

describe('MCPTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: {
        project: { project_id: 'proj-1' },
        mcp_servers: mockMCPServers,
        user_mcp_servers: mockUserMCPServers,
      },
      isLoadingProject: false,
      toggleMCPServer: mockToggleMCPServer,
      togglingServers: new Set(),
      openMCPModal: mockOpenMCPModal,
      deleteMCPServer: mockDeleteMCPServer,
      deletingMCP: new Set(),
      copyMCPServer: mockCopyMCPServer,
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<MCPTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<MCPTab />)
    expect(screen.getByText('Select a project to view MCP servers')).toBeInTheDocument()
  })

  it('renders total MCP servers count in header', () => {
    render(<MCPTab />)
    expect(screen.getByText('MCP Servers (3)')).toBeInTheDocument()
  })

  it('renders enabled count', () => {
    render(<MCPTab />)
    expect(screen.getByText('2 enabled')).toBeInTheDocument()
  })

  it('renders server IDs', () => {
    render(<MCPTab />)
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('slack')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
  })

  it('shows server status badges', () => {
    render(<MCPTab />)
    const enabledBadges = screen.getAllByText('enabled')
    const disabledBadges = screen.getAllByText('disabled')
    expect(enabledBadges.length).toBe(2)
    expect(disabledBadges.length).toBe(1)
  })

  it('renders server commands with args', () => {
    render(<MCPTab />)
    expect(screen.getByText('npx -y @modelcontextprotocol/server-github')).toBeInTheDocument()
  })

  it('shows Add Server button', () => {
    render(<MCPTab />)
    expect(screen.getByText('Add Server')).toBeInTheDocument()
  })

  it('calls openMCPModal on Add Server click', () => {
    render(<MCPTab />)
    fireEvent.click(screen.getByText('Add Server'))
    expect(mockOpenMCPModal).toHaveBeenCalledWith('create')
  })

  it('shows Project MCPs and User MCPs sections', () => {
    render(<MCPTab />)
    expect(screen.getByText('Project MCPs')).toBeInTheDocument()
    expect(screen.getByText('User MCPs')).toBeInTheDocument()
  })

  it('shows Read-only badge for user MCP servers', () => {
    render(<MCPTab />)
    expect(screen.getByText('Read-only')).toBeInTheDocument()
  })

  it('shows empty state when no project MCP servers', () => {
    mockStoreState.selectedProject = {
      project: { project_id: 'proj-1' },
      mcp_servers: [],
      user_mcp_servers: [],
    }
    render(<MCPTab />)
    expect(screen.getByText('No project MCP servers configured')).toBeInTheDocument()
  })

  it('renders server note when present', () => {
    render(<MCPTab />)
    expect(screen.getByText('GitHub integration')).toBeInTheDocument()
  })

  it('renders env keys when present', () => {
    render(<MCPTab />)
    expect(screen.getByText('GITHUB_TOKEN')).toBeInTheDocument()
  })
})
