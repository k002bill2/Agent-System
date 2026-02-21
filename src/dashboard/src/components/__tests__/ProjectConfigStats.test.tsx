import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Server: (props: Record<string, unknown>) => <span data-testid="icon-server" {...props} />,
  Bot: (props: Record<string, unknown>) => <span data-testid="icon-bot" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-sparkles" {...props} />,
  Webhook: (props: Record<string, unknown>) => <span data-testid="icon-webhook" {...props} />,
}))

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}))

const mockFetchProjects = vi.fn()

const mockProjects = [
  {
    project_id: 'proj-1',
    project_name: 'Project Alpha',
    project_path: '/projects/alpha',
    claude_dir: '/projects/alpha/.claude',
    has_skills: true,
    has_agents: true,
    has_mcp: true,
    has_hooks: false,
    has_commands: false,
    skill_count: 3,
    agent_count: 2,
    mcp_server_count: 5,
    hook_count: 0,
    command_count: 1,
    last_modified: '2026-01-15T10:00:00Z',
  },
  {
    project_id: 'proj-2',
    project_name: 'Project Beta',
    project_path: '/projects/beta',
    claude_dir: '/projects/beta/.claude',
    has_skills: false,
    has_agents: true,
    has_mcp: false,
    has_hooks: true,
    has_commands: false,
    skill_count: 0,
    agent_count: 4,
    mcp_server_count: 0,
    hook_count: 2,
    command_count: 0,
    last_modified: '2026-01-15T11:00:00Z',
  },
]

let storeState = {
  projects: mockProjects,
  fetchProjects: mockFetchProjects,
  isLoading: false,
}

vi.mock('../../stores/projectConfigs', () => ({
  useProjectConfigsStore: vi.fn(() => storeState),
}))

import { ConfigStatsCard, ConfigChartCard, ProjectConfigStats } from '../ProjectConfigStats'

describe('ConfigStatsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
      isLoading: false,
    }
  })

  it('calls fetchProjects on mount', () => {
    render(<ConfigStatsCard />)
    expect(mockFetchProjects).toHaveBeenCalled()
  })

  it('renders title', () => {
    render(<ConfigStatsCard />)
    expect(screen.getByText('Total Configuration Items')).toBeInTheDocument()
  })

  it('renders aggregated MCP count', () => {
    render(<ConfigStatsCard />)
    // 5 + 0 = 5
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('renders aggregated Agent count', () => {
    render(<ConfigStatsCard />)
    // 2 + 4 = 6
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders aggregated Skills count', () => {
    render(<ConfigStatsCard />)
    // 3 + 0 = 3
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('renders aggregated Hooks count', () => {
    render(<ConfigStatsCard />)
    // 0 + 2 = 2
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Hooks')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading', () => {
    storeState.isLoading = true
    const { container } = render(<ConfigStatsCard />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders stat icons', () => {
    render(<ConfigStatsCard />)
    expect(screen.getByTestId('icon-server')).toBeInTheDocument()
    expect(screen.getByTestId('icon-bot')).toBeInTheDocument()
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument()
    expect(screen.getByTestId('icon-webhook')).toBeInTheDocument()
  })
})

describe('ConfigChartCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
      isLoading: false,
    }
  })

  it('renders chart title with project count', () => {
    render(<ConfigChartCard />)
    expect(screen.getByText('Configuration by Project (2 projects)')).toBeInTheDocument()
  })

  it('renders bar chart when data present', () => {
    render(<ConfigChartCard />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading', () => {
    storeState.isLoading = true
    const { container } = render(<ConfigChartCard />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('shows empty state when no projects', () => {
    storeState.projects = []
    render(<ConfigChartCard />)
    expect(screen.getByText('No projects registered')).toBeInTheDocument()
  })
})

describe('ProjectConfigStats', () => {
  it('returns null (deprecated component)', () => {
    const { container } = render(<ProjectConfigStats />)
    expect(container.firstChild).toBeNull()
  })
})
