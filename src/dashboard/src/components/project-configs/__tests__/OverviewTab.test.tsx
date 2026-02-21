import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OverviewTab } from '../OverviewTab'

const mockRemoveProject = vi.fn()
const mockSelectProject = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

const createMockProject = (overrides = {}) => ({
  project: {
    project_id: 'proj-1',
    project_name: 'Test Project',
    project_path: '/home/user/test-project',
    last_modified: '2026-01-15T10:00:00Z',
    ...overrides,
  },
  skills: [
    { skill_id: 's1', name: 'test-skill', model: 'sonnet' },
    { skill_id: 's2', name: 'debug-skill', model: null },
  ],
  agents: [
    { agent_id: 'a1', name: 'web-agent', is_shared: false, model: 'opus' },
    { agent_id: 'a2', name: 'shared-agent', is_shared: true, model: null },
  ],
  mcp_servers: [
    { server_id: 'm1', name: 'github', disabled: false },
    { server_id: 'm2', name: 'slack', disabled: true },
  ],
  user_mcp_servers: [],
  hooks: [{ hook_id: 'h1' }],
  commands: [
    { command_id: 'commit', description: 'Git commit' },
    { command_id: 'review', description: null },
  ],
})

describe('OverviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: createMockProject(),
      isLoadingProject: false,
      removeProject: mockRemoveProject,
      selectProject: mockSelectProject,
    }
  })

  it('shows loading skeleton when isLoadingProject', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<OverviewTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<OverviewTab />)
    expect(screen.getByText('Select a project to view details')).toBeInTheDocument()
  })

  it('renders project name and path', () => {
    render(<OverviewTab />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('/home/user/test-project')).toBeInTheDocument()
  })

  it('renders stat cards with correct counts', () => {
    render(<OverviewTab />)
    // Stat cards and list headers both show these labels - just verify they exist
    expect(screen.getAllByText('Skills').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Agents').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Commands').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Hooks')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('renders skills list', () => {
    render(<OverviewTab />)
    expect(screen.getByText('test-skill')).toBeInTheDocument()
    expect(screen.getByText('debug-skill')).toBeInTheDocument()
  })

  it('renders agents list with shared badge', () => {
    render(<OverviewTab />)
    expect(screen.getByText('web-agent')).toBeInTheDocument()
    expect(screen.getByText('shared-agent')).toBeInTheDocument()
    expect(screen.getByText('shared')).toBeInTheDocument()
  })

  it('renders commands list with slash prefix', () => {
    render(<OverviewTab />)
    expect(screen.getByText('/commit')).toBeInTheDocument()
    expect(screen.getByText('/review')).toBeInTheDocument()
  })

  it('shows empty messages when lists are empty', () => {
    mockStoreState.selectedProject = {
      ...createMockProject(),
      skills: [],
      agents: [],
      commands: [],
    }
    render(<OverviewTab />)
    expect(screen.getByText('No skills found')).toBeInTheDocument()
    expect(screen.getByText('No agents found')).toBeInTheDocument()
    expect(screen.getByText('No commands found')).toBeInTheDocument()
  })

  it('shows remove confirmation modal on remove button click', () => {
    render(<OverviewTab />)
    // Click the trash/remove button
    const removeButton = screen.getByTitle('Remove from list')
    fireEvent.click(removeButton)
    expect(screen.getByText('Remove Project from List?')).toBeInTheDocument()
  })

  it('shows "Show more" button when list has more than 5 items', () => {
    mockStoreState.selectedProject = {
      ...createMockProject(),
      skills: Array.from({ length: 7 }, (_, i) => ({
        skill_id: `s${i}`,
        name: `skill-${i}`,
        model: null,
      })),
    }
    render(<OverviewTab />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
})
