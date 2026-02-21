import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextPanel } from '../ContextPanel'
import type { ProjectContext } from '../../../types/monitoring'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileText: (props: Record<string, unknown>) => <svg data-testid="icon-file-text" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Activity: (props: Record<string, unknown>) => <svg data-testid="icon-activity" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg data-testid="icon-refresh" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
  Hash: (props: Record<string, unknown>) => <svg data-testid="icon-hash" {...props} />,
  Users: (props: Record<string, unknown>) => <svg data-testid="icon-users" {...props} />,
  Target: (props: Record<string, unknown>) => <svg data-testid="icon-target" {...props} />,
}))

// Store mock state
const mockFetchProjectContext = vi.fn()
const mockSetActiveContextTab = vi.fn()

let mockProjectContext: ProjectContext | null = null
let mockIsLoadingContext = false
let mockActiveContextTab: 'claude-md' | 'dev-docs' | 'session' = 'claude-md'

vi.mock('../../../stores/monitoring', () => ({
  useMonitoringStore: () => ({
    projectContext: mockProjectContext,
    isLoadingContext: mockIsLoadingContext,
    activeContextTab: mockActiveContextTab,
    fetchProjectContext: mockFetchProjectContext,
    setActiveContextTab: mockSetActiveContextTab,
  }),
}))

const makeContext = (overrides?: Partial<ProjectContext>): ProjectContext => ({
  project_id: 'proj-1',
  project_name: 'Test Project',
  project_path: '/test',
  claude_md: '# Test CLAUDE.md content',
  dev_docs: [],
  session_info: null,
  ...overrides,
})

describe('ContextPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectContext = null
    mockIsLoadingContext = false
    mockActiveContextTab = 'claude-md'
  })

  it('renders "Project Context" heading', () => {
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('Project Context')).toBeInTheDocument()
  })

  it('renders tab buttons', () => {
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
    expect(screen.getByText('Dev Docs')).toBeInTheDocument()
    expect(screen.getByText('Session')).toBeInTheDocument()
  })

  it('calls fetchProjectContext on mount', () => {
    render(<ContextPanel projectId="proj-1" />)
    expect(mockFetchProjectContext).toHaveBeenCalledWith('proj-1')
  })

  it('shows "No context available" when projectContext is null and not loading', () => {
    mockProjectContext = null
    mockIsLoadingContext = false
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('No context available')).toBeInTheDocument()
  })

  it('shows CLAUDE.md content when on claude-md tab', () => {
    mockActiveContextTab = 'claude-md'
    mockProjectContext = makeContext({ claude_md: '# Hello World' })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('# Hello World')).toBeInTheDocument()
  })

  it('shows "No CLAUDE.md found" when claude_md is null', () => {
    mockActiveContextTab = 'claude-md'
    mockProjectContext = makeContext({ claude_md: null })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('No CLAUDE.md found in this project')).toBeInTheDocument()
  })

  it('shows "No dev docs found" on dev-docs tab when empty', () => {
    mockActiveContextTab = 'dev-docs'
    mockProjectContext = makeContext({ dev_docs: [] })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('No dev docs found in dev/active folder')).toBeInTheDocument()
  })

  it('shows dev docs when present', () => {
    mockActiveContextTab = 'dev-docs'
    mockProjectContext = makeContext({
      dev_docs: [
        { name: 'plan.md', path: '/dev/active/plan.md', content: 'Plan content', modified_at: '2024-01-01T00:00:00Z' },
      ],
    })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('plan.md')).toBeInTheDocument()
    expect(screen.getByText('Plan content')).toBeInTheDocument()
  })

  it('shows "No active session" on session tab when session_info is null', () => {
    mockActiveContextTab = 'session'
    mockProjectContext = makeContext({ session_info: null })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('No active session for this project')).toBeInTheDocument()
  })

  it('shows session stats when session_info is present', () => {
    mockActiveContextTab = 'session'
    mockProjectContext = makeContext({
      session_info: {
        session_id: 'abcdefgh-1234-5678-9abc-def012345678',
        tasks_count: 5,
        agents_count: 3,
        iteration_count: 12,
        current_task_id: null,
      },
    })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('abcdefgh...')).toBeInTheDocument()
  })

  it('shows current task when session has one', () => {
    mockActiveContextTab = 'session'
    mockProjectContext = makeContext({
      session_info: {
        session_id: 'abcdefgh-1234',
        tasks_count: 1,
        agents_count: 1,
        iteration_count: 1,
        current_task_id: 'task-abc-123',
      },
    })
    render(<ContextPanel projectId="proj-1" />)
    expect(screen.getByText('Current Task')).toBeInTheDocument()
    expect(screen.getByText('task-abc-123')).toBeInTheDocument()
  })

  it('calls setActiveContextTab when a tab is clicked', () => {
    render(<ContextPanel projectId="proj-1" />)
    fireEvent.click(screen.getByText('Dev Docs'))
    expect(mockSetActiveContextTab).toHaveBeenCalledWith('dev-docs')
  })

  it('calls fetchProjectContext when refresh button is clicked', () => {
    render(<ContextPanel projectId="proj-1" />)
    // The refresh button has title "Refresh context"
    const refreshBtn = screen.getByTitle('Refresh context')
    fireEvent.click(refreshBtn)
    // Once on mount + once on click
    expect(mockFetchProjectContext).toHaveBeenCalledTimes(2)
  })
})
