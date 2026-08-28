import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MonitorPage } from './MonitorPage'

// Mock child components
vi.mock('../components/monitor', () => ({
  HealthOverview: ({ projectId }: { projectId: string }) => (
    <div data-testid="health-overview">Health: {projectId}</div>
  ),
  OutputLog: ({ projectId }: { projectId: string }) => (
    <div data-testid="output-log">Log: {projectId}</div>
  ),
  ContextPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="context-panel">Context: {projectId}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="resizable-panel">{children}</div>
  ),
  ProjectsPanel: () => <div data-testid="projects-panel">Projects</div>,
  DiagnosticsPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="diagnostics-panel">Diagnostics: {projectId}</div>
  ),
  TopologyMap: ({ projectId }: { projectId: string }) => (
    <div data-testid="topology-map">Topology: {projectId}</div>
  ),
  VaultHealthDetail: ({ projectId }: { projectId: string }) => (
    <div data-testid="vault-health-detail">Vault: {projectId}</div>
  ),
}))

// Store mocks - need to match actual selector pattern
const mockFetchProjects = vi.fn()
const mockFetchCheckConfig = vi.fn()
const mockFetchProjectHealth = vi.fn()
const mockFetchMonitoringCapabilities = vi.fn()
const mockFetchWorkflowChecks = vi.fn()
const mockRunAllChecks = vi.fn()
const mockClearError = vi.fn()

let mockSelectedProjectId: string | null = null
let mockProjects: Array<{ id: string; name: string; path: string }> = []
let mockError: string | null = null
let mockIsLoadingHealth = false
let mockProjectHealthMap: Record<string, unknown> = {}
let mockCapabilities: Record<string, unknown> = {}

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      selectedProjectId: mockSelectedProjectId,
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../stores/monitoring', () => ({
  useMonitoringStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      getProjectHealth: (id: string) => mockProjectHealthMap[id] || null,
      getRunningChecks: () => new Set(),
      isLoadingHealth: mockIsLoadingHealth,
      error: mockError,
      getMonitoringCapabilities: (id: string) => mockCapabilities[id] || null,
      fetchCheckConfig: mockFetchCheckConfig,
      fetchProjectHealth: mockFetchProjectHealth,
      fetchMonitoringCapabilities: mockFetchMonitoringCapabilities,
      fetchWorkflowChecks: mockFetchWorkflowChecks,
      resetMonitoringSelection: vi.fn(),
      runAllChecks: mockRunAllChecks,
      clearError: mockClearError,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

describe('MonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedProjectId = null
    mockProjects = []
    mockError = null
    mockIsLoadingHealth = false
    mockProjectHealthMap = {}
    mockCapabilities = {
      'proj-1': {
        project_id: 'proj-1', mode: 'filesystem', health_config: 'available',
        health: 'available', checks: 'available', reason: null,
      },
    }
    mockFetchMonitoringCapabilities.mockResolvedValue({
      project_id: 'proj-1', mode: 'filesystem', health_config: 'available',
      health: 'available', checks: 'available', reason: null,
    })
  })

  it('shows select project prompt when no project selected', () => {
    render(<MonitorPage />)
    expect(screen.getByText('Select a Project')).toBeInTheDocument()
    expect(screen.getByTestId('projects-panel')).toBeInTheDocument()
  })

  it('fetches projects on mount', () => {
    render(<MonitorPage />)
    expect(mockFetchProjects).toHaveBeenCalledTimes(1)
  })

  it('renders project monitor when project is selected', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test Project', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    expect(screen.getByText('Project Monitor')).toBeInTheDocument()
    expect(screen.getByText('Test Project - /test')).toBeInTheDocument()
  })

  it('shows health overview and output log when health data available', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    expect(screen.getByTestId('health-overview')).toBeInTheDocument()
    expect(screen.getByTestId('output-log')).toBeInTheDocument()
  })

  it('shows error banner when error exists', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockError = 'Failed to fetch health'

    render(<MonitorPage />)
    expect(screen.getByText('Failed to fetch health')).toBeInTheDocument()
  })

  it('clears error when dismiss clicked', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockError = 'Some error'

    render(<MonitorPage />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockClearError).toHaveBeenCalledTimes(1)
  })

  it('calls refresh when Refresh button clicked', async () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    fireEvent.click(screen.getByText('Refresh'))
    await waitFor(() => expect(mockFetchProjectHealth).toHaveBeenCalledWith('proj-1', expect.any(Function)))
  })

  it('calls runAllChecks when Run All button clicked', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    fireEvent.click(screen.getByText('Run All'))
    expect(mockRunAllChecks).toHaveBeenCalledWith('proj-1')
  })

  it('fetches capabilities before health and checks when project changes', async () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]

    render(<MonitorPage />)
    await waitFor(() => {
      expect(mockFetchMonitoringCapabilities).toHaveBeenCalledWith('proj-1', expect.any(Function))
      expect(mockFetchProjectHealth).toHaveBeenCalledWith('proj-1', expect.any(Function))
      expect(mockFetchWorkflowChecks).toHaveBeenCalledWith('proj-1', expect.any(Function))
    })
  })
  // Database mode is no longer a blanket "monitoring off" state: the backend
  // now serves health from the DB-registered project path, so the page must
  // key off the capability flags rather than the mode string. A project whose
  // DB row has no inspectable path stays fail-closed and keeps the banner.
  describe('database-backed monitoring', () => {
    const dbProjectId = '3f9c1b74-6d20-4a8e-9c31-5b7e0d2a8f61'

    it('renders health without the unavailable banner when database mode reports available', async () => {
      const capabilities = {
        project_id: dbProjectId, mode: 'database', health_config: 'available',
        health: 'available', checks: 'available', reason: null,
      }
      mockSelectedProjectId = dbProjectId
      mockProjects = [{ id: dbProjectId, name: 'Test', path: '/test' }]
      mockProjectHealthMap = { [dbProjectId]: { status: 'healthy' } }
      mockCapabilities = { [dbProjectId]: capabilities }
      mockFetchMonitoringCapabilities.mockResolvedValue(capabilities)

      render(<MonitorPage />)

      await waitFor(() => {
        expect(mockFetchCheckConfig).toHaveBeenCalledWith(dbProjectId, expect.any(Function))
        expect(mockFetchProjectHealth).toHaveBeenCalledWith(dbProjectId, expect.any(Function))
      })
      expect(screen.queryByText(/unavailable in database mode/)).not.toBeInTheDocument()
      expect(screen.getByTestId('health-overview')).toBeInTheDocument()
      expect(screen.getByText('Run All')).not.toBeDisabled()
    })

    it('keeps the fail-closed banner when database mode reports every operation disabled', async () => {
      const capabilities = {
        project_id: dbProjectId, mode: 'database', health_config: 'disabled',
        health: 'disabled', checks: 'disabled',
        reason: 'Project has no registered filesystem path for health monitoring',
      }
      mockSelectedProjectId = dbProjectId
      mockProjects = [{ id: dbProjectId, name: 'Test', path: '/test' }]
      mockCapabilities = { [dbProjectId]: capabilities }
      mockFetchMonitoringCapabilities.mockResolvedValue(capabilities)

      render(<MonitorPage />)

      expect(screen.getByText(/unavailable in database mode/)).toBeInTheDocument()
      expect(
        screen.getByText(/no registered filesystem path for health monitoring/),
      ).toBeInTheDocument()
      expect(screen.getByText('Run All')).toBeDisabled()
      await waitFor(() => expect(mockFetchMonitoringCapabilities).toHaveBeenCalled())
      expect(mockFetchCheckConfig).not.toHaveBeenCalled()
      expect(mockFetchProjectHealth).not.toHaveBeenCalled()
    })
  })
})
