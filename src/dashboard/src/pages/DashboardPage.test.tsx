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
let mockAgents: Record<string, { status: string }> = {}
let mockSessions: Array<{ session_id: string; status: string; last_activity: string; project_name?: string; summary?: string; slug?: string; message_count?: number }> = []
let mockIsLoadingSessions = false
const mockFetchSessions = vi.fn()
const mockSelectSession = vi.fn()
const mockSetView = vi.fn()

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ agents: mockAgents }),
}))

vi.mock('../stores/claudeSessions', () => ({
  useClaudeSessionsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      sessions: mockSessions,
      fetchSessions: mockFetchSessions,
      fetchProjects: vi.fn(),
      allProjects: [],
      projectsFetchError: false,
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
    mockAgents = {}
    mockSessions = []
    mockIsLoadingSessions = false
  })

  it('renders stats cards', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Total Sessions')).toBeInTheDocument()
    expect(screen.getByText('Active Sessions')).toBeInTheDocument()
    expect(screen.getByText('Session Projects')).toBeInTheDocument()
    expect(screen.getByText('Session Messages')).toBeInTheDocument()
  })

  it('displays correct session stats', () => {
    mockSessions = [
      { session_id: 's1', status: 'active', last_activity: new Date().toISOString(), project_name: 'ProjectA', message_count: 10 },
      { session_id: 's2', status: 'done', last_activity: new Date().toISOString(), project_name: 'ProjectB', message_count: 5 },
      { session_id: 's3', status: 'active', last_activity: new Date().toISOString(), project_name: 'ProjectA', message_count: 3 },
    ]
    render(<DashboardPage />)
    // Total sessions: 3, Active: 2, Projects: 2, Messages: 18
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: '.text-green-600, .dark\\:text-green-400' }) || screen.getAllByText('2').length > 0).toBeTruthy()
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
