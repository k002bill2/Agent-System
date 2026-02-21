import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lib/utils
vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// Mock child components
vi.mock('../ClaudeCodeSessionSelector', () => ({
  ClaudeCodeSessionSelector: ({ selectedSessionId, onSelect }: {
    selectedSessionId: string | null
    onSelect: (id: string | null) => void
  }) => (
    <div data-testid="session-selector">
      <span>Selected: {selectedSessionId || 'none'}</span>
      <button onClick={() => onSelect('session-1')}>Select Session 1</button>
    </div>
  ),
}))

vi.mock('../VerticalSplitPanel', () => ({
  VerticalSplitPanel: ({ topContent, bottomContent }: {
    topContent: React.ReactNode
    bottomContent: React.ReactNode
  }) => (
    <div data-testid="vertical-split">
      <div data-testid="top-content">{topContent}</div>
      <div data-testid="bottom-content">{bottomContent}</div>
    </div>
  ),
}))

// Store mock states
const mockActivityState = {
  activeSessionId: null as string | null,
  activities: [] as Array<{
    id: string
    type: string
    timestamp: string
    content?: string
    tool_name?: string
    tool_input?: Record<string, unknown>
    tool_result?: string
    session_id: string
  }>,
  isLoadingActivity: false,
  error: null as string | null,
  setActiveSession: vi.fn(),
  clearError: vi.fn(),
}

const mockSessionsState = {
  sessions: [] as Array<{
    session_id: string
    slug: string
    status: string
    model: string
    project_path: string
    project_name: string
    git_branch: string
    cwd: string
    version: string
    created_at: string
    last_activity: string
    message_count: number
    user_message_count: number
    assistant_message_count: number
    tool_call_count: number
    total_input_tokens: number
    total_output_tokens: number
    estimated_cost: number
    file_path: string
    file_size: number
    summary?: string
  }>,
}

vi.mock('../../stores/claudeCodeActivity', () => ({
  useClaudeCodeActivityStore: vi.fn(() => mockActivityState),
}))

vi.mock('../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => mockSessionsState),
}))

import { ClaudeCodeTasks } from '../ClaudeCodeTasks'

describe('ClaudeCodeTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActivityState.activeSessionId = null
    mockActivityState.activities = []
    mockActivityState.isLoadingActivity = false
    mockActivityState.error = null
    mockActivityState.setActiveSession = vi.fn()
    mockActivityState.clearError = vi.fn()
    mockSessionsState.sessions = []
  })

  it('renders the session selector', () => {
    render(<ClaudeCodeTasks />)
    expect(screen.getByTestId('session-selector')).toBeInTheDocument()
  })

  it('shows placeholder when no session is selected', () => {
    render(<ClaudeCodeTasks />)
    expect(screen.getByText('Select a session to view details')).toBeInTheDocument()
  })

  it('shows vertical split panel when a session is selected', () => {
    mockActivityState.activeSessionId = 'session-1'
    mockSessionsState.sessions = [{
      session_id: 'session-1',
      slug: 'test-slug',
      status: 'active',
      model: 'claude-3',
      project_path: '/test',
      project_name: 'Test Project',
      git_branch: 'main',
      cwd: '/test',
      version: '1.0',
      created_at: '2025-01-01T00:00:00Z',
      last_activity: '2025-01-01T10:00:00Z',
      message_count: 10,
      user_message_count: 5,
      assistant_message_count: 5,
      tool_call_count: 3,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      estimated_cost: 0.05,
      file_path: '/test/file',
      file_size: 1024,
      summary: 'Test summary',
    }]

    render(<ClaudeCodeTasks />)
    expect(screen.getByTestId('vertical-split')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockActivityState.error = 'Connection failed'

    render(<ClaudeCodeTasks />)
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('can dismiss error', () => {
    mockActivityState.error = 'Connection failed'

    render(<ClaudeCodeTasks />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockActivityState.clearError).toHaveBeenCalled()
  })

  it('does not show error section when no error', () => {
    mockActivityState.error = null

    render(<ClaudeCodeTasks />)
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument()
  })

  it('passes correct props to session selector', () => {
    mockActivityState.activeSessionId = 'session-1'

    render(<ClaudeCodeTasks />)
    expect(screen.getByText('Selected: session-1')).toBeInTheDocument()
  })

  it('passes setActiveSession to session selector onSelect', () => {
    render(<ClaudeCodeTasks />)
    fireEvent.click(screen.getByText('Select Session 1'))
    expect(mockActivityState.setActiveSession).toHaveBeenCalledWith('session-1')
  })
})
