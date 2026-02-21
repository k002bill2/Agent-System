import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectConfigsPage } from './ProjectConfigsPage'

// Mock child components
vi.mock('../components/project-configs', () => ({
  ProjectList: () => <div data-testid="project-list">ProjectList</div>,
  OverviewTab: () => <div data-testid="overview-tab">OverviewTab</div>,
  SkillsTab: () => <div data-testid="skills-tab">SkillsTab</div>,
  AgentsTab: () => <div data-testid="agents-tab">AgentsTab</div>,
  MCPTab: () => <div data-testid="mcp-tab">MCPTab</div>,
  HooksTab: () => <div data-testid="hooks-tab">HooksTab</div>,
  CommandsTab: () => <div data-testid="commands-tab">CommandsTab</div>,
}))

// Store mocks
const mockFetchProjects = vi.fn()
const mockStartStreaming = vi.fn()
const mockStopStreaming = vi.fn()
const mockSetActiveTab = vi.fn()
const mockClearError = vi.fn()
const mockRefresh = vi.fn()

let mockActiveTab = 'overview'
let mockError: string | null = null
let mockIsLoading = false
let mockSelectedProject: Record<string, unknown> | null = null

vi.mock('../stores/projectConfigs', () => ({
  useProjectConfigsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      fetchProjects: mockFetchProjects,
      startStreaming: mockStartStreaming,
      stopStreaming: mockStopStreaming,
      activeTab: mockActiveTab,
      setActiveTab: mockSetActiveTab,
      error: mockError,
      clearError: mockClearError,
      refresh: mockRefresh,
      isLoading: mockIsLoading,
      selectedProject: mockSelectedProject,
    }),
  TabType: {},
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

describe('ProjectConfigsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveTab = 'overview'
    mockError = null
    mockIsLoading = false
    mockSelectedProject = null
  })

  it('renders project list sidebar', () => {
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('project-list')).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<ProjectConfigsPage />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Commands')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('Hooks')).toBeInTheDocument()
  })

  it('renders overview tab content by default', () => {
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()
  })

  it('calls setActiveTab when tab clicked', () => {
    render(<ProjectConfigsPage />)
    fireEvent.click(screen.getByText('Skills'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('skills')
  })

  it('renders skills tab when activeTab is skills', () => {
    mockActiveTab = 'skills'
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('skills-tab')).toBeInTheDocument()
  })

  it('renders agents tab when activeTab is agents', () => {
    mockActiveTab = 'agents'
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('agents-tab')).toBeInTheDocument()
  })

  it('renders mcp tab when activeTab is mcp', () => {
    mockActiveTab = 'mcp'
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('mcp-tab')).toBeInTheDocument()
  })

  it('renders commands tab when activeTab is commands', () => {
    mockActiveTab = 'commands'
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('commands-tab')).toBeInTheDocument()
  })

  it('renders hooks tab when activeTab is hooks', () => {
    mockActiveTab = 'hooks'
    render(<ProjectConfigsPage />)
    expect(screen.getByTestId('hooks-tab')).toBeInTheDocument()
  })

  it('shows error banner when error exists', () => {
    mockError = 'Failed to load'
    render(<ProjectConfigsPage />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
  })

  it('clears error when Dismiss clicked', () => {
    mockError = 'Error msg'
    render(<ProjectConfigsPage />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockClearError).toHaveBeenCalledTimes(1)
  })

  it('calls refresh when refresh button clicked', () => {
    render(<ProjectConfigsPage />)
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('fetches projects and starts streaming on mount', () => {
    render(<ProjectConfigsPage />)
    expect(mockFetchProjects).toHaveBeenCalledTimes(1)
    expect(mockStartStreaming).toHaveBeenCalledTimes(1)
  })

  it('stops streaming on unmount', () => {
    const { unmount } = render(<ProjectConfigsPage />)
    unmount()
    expect(mockStopStreaming).toHaveBeenCalledTimes(1)
  })

  it('shows badge count for skills tab when project has skills', () => {
    mockSelectedProject = { skills: [{ name: 'skill1' }, { name: 'skill2' }] }
    render(<ProjectConfigsPage />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows badge count for agents tab when project has agents', () => {
    mockSelectedProject = { agents: [{ name: 'agent1' }] }
    render(<ProjectConfigsPage />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
