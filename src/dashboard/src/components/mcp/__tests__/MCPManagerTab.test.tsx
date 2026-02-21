import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MCPManagerTab } from '../MCPManagerTab'
import type { MCPServer, MCPManagerStats } from '../../../stores/mcp'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Server: (props: Record<string, unknown>) => <svg data-testid="icon-server" {...props} />,
  Filter: (props: Record<string, unknown>) => <svg data-testid="icon-filter" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg data-testid="icon-refresh" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="icon-alert" {...props} />,
  Folder: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
  Square: (props: Record<string, unknown>) => <svg data-testid="icon-square" {...props} />,
  RotateCw: (props: Record<string, unknown>) => <svg data-testid="icon-rotate" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder-open" {...props} />,
  Github: (props: Record<string, unknown>) => <svg data-testid="icon-github" {...props} />,
  Globe: (props: Record<string, unknown>) => <svg data-testid="icon-globe" {...props} />,
  Database: (props: Record<string, unknown>) => <svg data-testid="icon-database" {...props} />,
  Settings: (props: Record<string, unknown>) => <svg data-testid="icon-settings" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <svg data-testid="icon-chevron-down" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <svg data-testid="icon-chevron-up" {...props} />,
  Wrench: (props: Record<string, unknown>) => <svg data-testid="icon-wrench" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
  Send: (props: Record<string, unknown>) => <svg data-testid="icon-send" {...props} />,
  Plus: (props: Record<string, unknown>) => <svg data-testid="icon-plus" {...props} />,
  Minus: (props: Record<string, unknown>) => <svg data-testid="icon-minus" {...props} />,
  X: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
  Trash2: (props: Record<string, unknown>) => <svg data-testid="icon-trash" {...props} />,
  Copy: (props: Record<string, unknown>) => <svg data-testid="icon-copy" {...props} />,
  Loader2: (props: Record<string, unknown>) => <svg data-testid="icon-loader" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check-circle" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x-circle" {...props} />,
}))

// Mock stores
const mockFetchServers = vi.fn()
const mockFetchStats = vi.fn()
const mockFetchServerTools = vi.fn()
const mockStartServer = vi.fn()
const mockStopServer = vi.fn()
const mockRestartServer = vi.fn()
const mockSetSelectedServer = vi.fn()
const mockSetStatusFilter = vi.fn()
const mockClearError = vi.fn()

let mockServers: MCPServer[] = []
let mockStats: MCPManagerStats | null = null
let mockIsLoading = false
let mockError: string | null = null
let mockSelectedServerId: string | null = null
let mockStatusFilter: string | null = null

vi.mock('../../../stores/mcp', () => ({
  useMCPStore: () => ({
    servers: mockServers,
    stats: mockStats,
    isLoading: mockIsLoading,
    error: mockError,
    selectedServerId: mockSelectedServerId,
    statusFilter: mockStatusFilter,
    fetchServers: mockFetchServers,
    fetchStats: mockFetchStats,
    fetchServerTools: mockFetchServerTools,
    startServer: mockStartServer,
    stopServer: mockStopServer,
    restartServer: mockRestartServer,
    setSelectedServer: mockSetSelectedServer,
    setStatusFilter: mockSetStatusFilter,
    clearError: mockClearError,
  }),
}))

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => ({
    selectedProject: null,
    fetchProjectSummary: vi.fn(),
  }),
}))

// Mock sub-components to keep tests focused
vi.mock('../MCPStatsPanel', () => ({
  MCPStatsPanel: ({ stats, isLoading }: { stats: unknown; isLoading: boolean }) => (
    <div data-testid="mcp-stats-panel">{isLoading ? 'Loading stats...' : stats ? 'Stats loaded' : 'No stats'}</div>
  ),
}))

vi.mock('../MCPToolCaller', () => ({
  MCPToolCaller: () => <div data-testid="mcp-tool-caller">Tool Caller</div>,
}))

vi.mock('../MCPServerCard', () => ({
  MCPServerCard: ({ server, onClick }: { server: MCPServer; onClick: () => void }) => (
    <div data-testid={`server-card-${server.id}`} onClick={onClick}>
      {server.name} - {server.status}
    </div>
  ),
}))

describe('MCPManagerTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServers = []
    mockStats = null
    mockIsLoading = false
    mockError = null
    mockSelectedServerId = null
    mockStatusFilter = null
  })

  it('calls fetchServers and fetchStats on mount', () => {
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(mockFetchServers).toHaveBeenCalled()
    expect(mockFetchStats).toHaveBeenCalled()
  })

  it('renders filter buttons', () => {
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('calls setStatusFilter when a filter button is clicked', () => {
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    fireEvent.click(screen.getByText('Running'))
    expect(mockSetStatusFilter).toHaveBeenCalledWith('running')
  })

  it('shows stats panel when not project-filtered', () => {
    mockStats = { total_servers: 3, running_servers: 1, total_tools: 5, servers_by_type: {} }
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByTestId('mcp-stats-panel')).toBeInTheDocument()
  })

  it('hides stats panel when project-filtered', () => {
    const project = { id: 'p1', name: 'Project A', path: '/a', description: '', has_claude_md: true }
    render(<MCPManagerTab projectFilter="p1" selectedProject={project} />)
    expect(screen.queryByTestId('mcp-stats-panel')).not.toBeInTheDocument()
  })

  it('shows error banner when error is set', () => {
    mockError = 'Failed to load servers'
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByText('Failed to load servers')).toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
  })

  it('calls clearError when Dismiss is clicked', () => {
    mockError = 'Some error'
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockClearError).toHaveBeenCalled()
  })

  it('shows loading skeletons when isLoading is true', () => {
    mockIsLoading = true
    const { container } = render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows empty state when no servers found', () => {
    mockServers = []
    mockIsLoading = false
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByText('No servers found')).toBeInTheDocument()
    expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
  })

  it('shows status-specific empty message when filtering', () => {
    mockServers = []
    mockStatusFilter = 'running'
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByText('No servers found')).toBeInTheDocument()
    expect(screen.getByText('No servers with status "running"')).toBeInTheDocument()
  })

  it('renders server cards for each server', () => {
    mockServers = [
      { id: 's1', name: 'Server 1', type: 'filesystem', description: '', status: 'running', tool_count: 0, tools: [] },
      { id: 's2', name: 'Server 2', type: 'github', description: '', status: 'stopped', tool_count: 0, tools: [] },
    ]
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByTestId('server-card-s1')).toBeInTheDocument()
    expect(screen.getByTestId('server-card-s2')).toBeInTheDocument()
  })

  it('renders tool caller component', () => {
    render(<MCPManagerTab projectFilter={null} selectedProject={undefined} />)
    expect(screen.getByTestId('mcp-tool-caller')).toBeInTheDocument()
  })
})
