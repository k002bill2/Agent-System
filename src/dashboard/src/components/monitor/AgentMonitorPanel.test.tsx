import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentMonitorPanel } from './AgentMonitorPanel'

// ─────────────────────────────────────────────────────────────
// Mock store state
// ─────────────────────────────────────────────────────────────

const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockSelectAgent = vi.fn()
const mockSetSelectedPeriod = vi.fn()
const mockFetchMetrics = vi.fn()
const mockFetchSummary = vi.fn()
const mockAddEvent = vi.fn()
const mockClearError = vi.fn()

let mockStoreState: Record<string, unknown> = {}

function getDefaultState(): Record<string, unknown> {
  return {
    connectionStatus: 'connected',
    eventSource: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    agents: {
      'agent-planner': {
        agent_id: 'agent-planner',
        name: 'Planner Agent',
        status: 'running',
        last_active: '2025-01-01T00:00:00Z',
        total_tasks: 50,
        successful_tasks: 45,
        total_cost: 12.5,
        avg_duration_ms: 350,
      },
      'agent-executor': {
        agent_id: 'agent-executor',
        name: 'Executor Agent',
        status: 'idle',
        last_active: '2025-01-01T00:00:00Z',
        total_tasks: 30,
        successful_tasks: 28,
        total_cost: 8.0,
        avg_duration_ms: 200,
      },
      'agent-reviewer': {
        agent_id: 'agent-reviewer',
        name: 'Reviewer Agent',
        status: 'error',
        last_active: '2025-01-01T00:00:00Z',
        total_tasks: 20,
        successful_tasks: 18,
        total_cost: 5.0,
        avg_duration_ms: 400,
      },
    },
    selectedAgentId: null,
    eventBuffer: [],
    agentMetrics: null,
    metricsSummary: {
      total_agents: 3,
      active_agents: 2,
      avg_success_rate: 0.91,
      total_cost_24h: 25.5,
      tasks_completed_24h: 100,
    },
    selectedPeriod: '1h',
    isLoadingMetrics: false,
    isLoadingSummary: false,
    error: null,
    connect: mockConnect,
    disconnect: mockDisconnect,
    addEvent: mockAddEvent,
    selectAgent: mockSelectAgent,
    setSelectedPeriod: mockSetSelectedPeriod,
    fetchMetrics: mockFetchMetrics,
    fetchSummary: mockFetchSummary,
    clearError: mockClearError,
  }
}

vi.mock('../../stores/agentMonitor', () => ({
  useAgentMonitorStore: () => mockStoreState,
}))

vi.mock('../../config/api', () => ({
  getApiUrl: (path: string) => `http://localhost:8000${path}`,
}))

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('AgentMonitorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = getDefaultState()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────

  it('renders connection status indicator', () => {
    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('connection-indicator')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('renders agent list with correct count', () => {
    render(<AgentMonitorPanel />)

    expect(screen.getByText('Agents (3)')).toBeInTheDocument()
    expect(screen.getByTestId('agent-list')).toBeInTheDocument()
  })

  it('renders all agents with their names', () => {
    render(<AgentMonitorPanel />)

    expect(screen.getByText('Planner Agent')).toBeInTheDocument()
    expect(screen.getByText('Executor Agent')).toBeInTheDocument()
    expect(screen.getByText('Reviewer Agent')).toBeInTheDocument()
  })

  it('renders summary cards when data is available', () => {
    render(<AgentMonitorPanel />)

    const summaryCards = screen.getByTestId('summary-cards')
    expect(summaryCards).toBeInTheDocument()
    expect(screen.getByText('Total Agents')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders agent status labels', () => {
    render(<AgentMonitorPanel />)

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  // ── Connection ────────────────────────────────────────────

  it('calls connect on mount and disconnect on unmount', () => {
    const { unmount } = render(<AgentMonitorPanel />)

    expect(mockConnect).toHaveBeenCalled()
    expect(mockFetchSummary).toHaveBeenCalled()

    unmount()
    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('shows disconnect button when connected', () => {
    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('connection-toggle')).toHaveTextContent('Disconnect')
  })

  it('shows connect button when disconnected', () => {
    mockStoreState = { ...getDefaultState(), connectionStatus: 'disconnected' }
    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('connection-toggle')).toHaveTextContent('Connect')
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  // ── Interaction ───────────────────────────────────────────

  it('calls selectAgent when an agent row is clicked', () => {
    render(<AgentMonitorPanel />)

    fireEvent.click(screen.getByTestId('agent-row-agent-planner'))
    expect(mockSelectAgent).toHaveBeenCalledWith('agent-planner')
  })

  it('deselects agent when clicking the same agent again', () => {
    mockStoreState = { ...getDefaultState(), selectedAgentId: 'agent-planner' }
    render(<AgentMonitorPanel />)

    fireEvent.click(screen.getByTestId('agent-row-agent-planner'))
    expect(mockSelectAgent).toHaveBeenCalledWith(null)
  })

  // ── Drill-down ────────────────────────────────────────────

  it('shows metrics drilldown when agent is selected', () => {
    mockStoreState = {
      ...getDefaultState(),
      selectedAgentId: 'agent-planner',
      agentMetrics: {
        agent_id: 'agent-planner',
        buckets: [
          {
            timestamp: '2025-01-01T00:00:00Z',
            success_rate: 0.9,
            avg_duration_ms: 300,
            total_cost: 1.5,
            task_count: 10,
          },
        ],
      },
    }

    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('metrics-drilldown')).toBeInTheDocument()
    expect(screen.getByText(/Metrics: Planner Agent/)).toBeInTheDocument()
  })

  it('shows loading state when fetching metrics', () => {
    mockStoreState = {
      ...getDefaultState(),
      selectedAgentId: 'agent-planner',
      isLoadingMetrics: true,
    }

    render(<AgentMonitorPanel />)

    expect(screen.getByText('Loading metrics...')).toBeInTheDocument()
  })

  // ── Error State ───────────────────────────────────────────

  it('displays error banner when error is present', () => {
    mockStoreState = { ...getDefaultState(), error: 'Connection failed' }
    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('error-banner')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  // ── Empty State ───────────────────────────────────────────

  it('shows empty state when no agents', () => {
    mockStoreState = { ...getDefaultState(), agents: {} }
    render(<AgentMonitorPanel />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('No agents registered')).toBeInTheDocument()
  })

  it('shows connect prompt when disconnected and no agents', () => {
    mockStoreState = { ...getDefaultState(), agents: {}, connectionStatus: 'disconnected' }
    render(<AgentMonitorPanel />)

    expect(screen.getByText('Connect to see agents')).toBeInTheDocument()
  })
})
