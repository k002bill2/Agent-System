import { render, screen, fireEvent } from '@testing-library/react'
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
}))

// Store mocks - need to match actual selector pattern
const mockFetchProjects = vi.fn()
const mockFetchCheckConfig = vi.fn()
const mockFetchProjectHealth = vi.fn()
const mockFetchWorkflowChecks = vi.fn()
const mockRunAllChecks = vi.fn()
const mockClearError = vi.fn()

let mockSelectedProjectId: string | null = null
let mockProjects: Array<{ id: string; name: string; path: string }> = []
let mockError: string | null = null
let mockIsLoadingHealth = false
let mockProjectHealthMap: Record<string, unknown> = {}

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
      fetchCheckConfig: mockFetchCheckConfig,
      fetchProjectHealth: mockFetchProjectHealth,
      fetchWorkflowChecks: mockFetchWorkflowChecks,
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

  it('calls refresh when Refresh button clicked', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(mockFetchProjectHealth).toHaveBeenCalledWith('proj-1')
  })

  it('calls runAllChecks when Run All button clicked', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]
    mockProjectHealthMap = { 'proj-1': { status: 'healthy' } }

    render(<MonitorPage />)
    fireEvent.click(screen.getByText('Run All'))
    expect(mockRunAllChecks).toHaveBeenCalledWith('proj-1')
  })

  it('fetches health and checks when project changes', () => {
    mockSelectedProjectId = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'Test', path: '/test' }]

    render(<MonitorPage />)
    expect(mockFetchProjectHealth).toHaveBeenCalledWith('proj-1')
    expect(mockFetchWorkflowChecks).toHaveBeenCalledWith('proj-1')
  })
})
