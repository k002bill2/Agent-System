import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectClaudeConfigPanel } from '../ProjectClaudeConfigPanel'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    X: icon('x'),
    Sparkles: icon('sparkles'),
    Users: icon('users'),
    Server: icon('server'),
    ChevronRight: icon('chevron-right'),
    Loader2: icon('loader'),
    Power: icon('power'),
    PowerOff: icon('power-off'),
    AlertCircle: icon('alert'),
    FileCode: icon('file-code'),
    ExternalLink: icon('external-link'),
    Webhook: icon('webhook'),
  }
})

// Mock project configs store
const mockToggleMCPServer = vi.fn()

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => ({
    toggleMCPServer: mockToggleMCPServer,
    togglingServers: new Set(),
  }),
}))

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

const mockSummary = {
  project: {
    project_id: 'resolved-id',
    project_name: 'Test Project',
    project_path: '/path/to/project',
    claude_dir: '/path/to/project/.claude',
    has_skills: true,
    has_agents: true,
    has_mcp: true,
    has_hooks: true,
    has_commands: false,
    skill_count: 2,
    agent_count: 1,
    mcp_server_count: 1,
    hook_count: 1,
    command_count: 0,
    last_modified: '2025-01-01T00:00:00Z',
  },
  skills: [
    {
      skill_id: 'sk-1',
      project_id: 'resolved-id',
      name: 'Test Skill',
      description: 'A test skill',
      file_path: '/path/skill.md',
      tools: ['Read', 'Write', 'Bash'],
      model: null,
      version: null,
      author: null,
      has_references: false,
      has_scripts: false,
      has_assets: false,
      created_at: null,
      modified_at: null,
    },
  ],
  agents: [
    {
      agent_id: 'ag-1',
      project_id: 'resolved-id',
      name: 'Test Agent',
      description: 'A test agent',
      file_path: '/path/agent.md',
      tools: [],
      model: 'claude-3-opus',
      role: 'specialist',
      is_shared: false,
      modified_at: null,
    },
  ],
  mcp_servers: [
    {
      server_id: 'mcp-1',
      project_id: 'resolved-id',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {},
      disabled: false,
      note: '',
      server_type: 'npx' as const,
      package_name: '@modelcontextprotocol/server-filesystem',
      source: 'project' as const,
    },
  ],
  user_mcp_servers: [],
  hooks: [
    {
      hook_id: 'hook-1',
      project_id: 'resolved-id',
      event: 'PostToolUse',
      matcher: 'Edit|Write',
      command: 'tsc --noEmit',
      hook_type: 'command',
      file_path: '/path/settings.json',
    },
  ],
  commands: [],
}

describe('ProjectClaudeConfigPanel', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title and project name', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)

    expect(screen.getByText(/Claude/)).toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('shows loading spinner', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))
    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))
    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)

    // Find the close button (the X icon)
    const closeButtons = screen.getAllByTestId('icon-x')
    fireEvent.click(closeButtons[0].parentElement!)
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText(/Internal Server Error/)).toBeInTheDocument()
    })
  })

  it('shows 404 error for missing path', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText(/프로젝트 경로를 찾을 수 없습니다/)).toBeInTheDocument()
    })
  })

  it('renders section tabs with counts', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('Skills')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('MCP')).toBeInTheDocument()
      expect(screen.getByText('Hooks')).toBeInTheDocument()
    })
  })

  it('shows skills section by default', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('Test Skill')).toBeInTheDocument()
      expect(screen.getByText('A test skill')).toBeInTheDocument()
    })
  })

  it('shows skill tools', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument()
      expect(screen.getByText('Write')).toBeInTheDocument()
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })
  })

  it('switches to agents section on click', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('Skills')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Agents'))
    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeInTheDocument()
      expect(screen.getByText('claude-3-opus')).toBeInTheDocument()
    })
  })

  it('switches to MCP section and shows servers', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('MCP')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('MCP'))
    await waitFor(() => {
      expect(screen.getByText('mcp-1')).toBeInTheDocument()
      expect(screen.getByText('npx')).toBeInTheDocument()
    })
  })

  it('switches to hooks section', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('Hooks')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Hooks'))
    await waitFor(() => {
      expect(screen.getByText('PostToolUse')).toBeInTheDocument()
      expect(screen.getByText('command')).toBeInTheDocument()
    })
  })

  it('shows footer link when summary loaded', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    render(<ProjectClaudeConfigPanel project={mockProject} onClose={mockOnClose} />)
    await waitFor(() => {
      expect(screen.getByText('전체 설정 보기')).toBeInTheDocument()
    })
  })
})
