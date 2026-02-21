import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardPage } from './DashboardPage'

// Mock child components
vi.mock('../components/CostMonitor', () => ({
  CostMonitor: () => <div data-testid="cost-monitor">CostMonitor</div>,
}))
vi.mock('../components/usage/ClaudeUsageDashboard', () => ({
  ClaudeUsageDashboard: () => <div data-testid="usage-dashboard">UsageDashboard</div>,
}))
vi.mock('../components/ProjectConfigStats', () => ({
  ConfigStatsCard: () => <div data-testid="config-stats">ConfigStats</div>,
  ConfigChartCard: () => <div data-testid="config-chart">ConfigChart</div>,
}))
vi.mock('../components/ProcessMonitorWidget', () => ({
  ProcessMonitorWidget: () => <div data-testid="process-monitor">ProcessMonitor</div>,
}))

// Store mocks
let mockTasks: Record<string, { status: string; isDeleted?: boolean }> = {}
let mockAgents: Record<string, { status: string }> = {}
let mockSessions: Array<{ session_id: string; status: string; last_activity: string; project_name?: string; summary?: string; slug?: string }> = []
let mockIsLoadingSessions = false
const mockFetchSessions = vi.fn()
const mockSelectSession = vi.fn()
const mockSetView = vi.fn()

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ tasks: mockTasks, agents: mockAgents }),
}))

vi.mock('../stores/claudeSessions', () => ({
  useClaudeSessionsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      sessions: mockSessions,
      fetchSessions: mockFetchSessions,
      isLoading: mockIsLoadingSessions,
      selectSession: mockSelectSession,
    }),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setView: mockSetView }),
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTasks = {}
    mockAgents = {}
    mockSessions = []
    mockIsLoadingSessions = false
  })

  it('renders stats cards', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Total Tasks')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('displays correct task counts', () => {
    mockTasks = {
      t1: { status: 'completed' },
      t2: { status: 'in_progress' },
      t3: { status: 'failed' },
      t4: { status: 'pending' },
      t5: { status: 'completed', isDeleted: true }, // should be excluded
    }
    render(<DashboardPage />)
    // Total should be 4 (excluding deleted)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders agent status section', () => {
    mockAgents = {
      a1: { status: 'in_progress' },
      a2: { status: 'idle' },
    }
    render(<DashboardPage />)
    expect(screen.getByText('Agent Status')).toBeInTheDocument()
    expect(screen.getByText('Total Agents')).toBeInTheDocument()
  })

  it('renders dashboard widgets', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('cost-monitor')).toBeInTheDocument()
    expect(screen.getByTestId('usage-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('config-stats')).toBeInTheDocument()
    expect(screen.getByTestId('process-monitor')).toBeInTheDocument()
  })

  it('renders Recent Sessions section', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument()
  })

  it('shows no recent sessions message when empty', () => {
    render(<DashboardPage />)
    expect(screen.getByText('No recent sessions')).toBeInTheDocument()
  })

  it('shows loading skeleton when sessions loading', () => {
    mockIsLoadingSessions = true
    const { container } = render(<DashboardPage />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('fetches sessions on mount', () => {
    render(<DashboardPage />)
    expect(mockFetchSessions).toHaveBeenCalledTimes(1)
  })

  it('renders session items with project name', () => {
    mockSessions = [
      {
        session_id: 's1',
        status: 'active',
        last_activity: new Date().toISOString(),
        project_name: 'TestProject',
        summary: 'Working on feature',
      },
    ]
    render(<DashboardPage />)
    expect(screen.getByText('TestProject')).toBeInTheDocument()
    expect(screen.getByText('Working on feature')).toBeInTheDocument()
  })
})
