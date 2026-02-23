import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ActivityEvent } from '../../types/claudeCodeActivity'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  User: (props: Record<string, unknown>) => <span data-testid="icon-user" {...props} />,
  Bot: (props: Record<string, unknown>) => <span data-testid="icon-bot" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-info" {...props} />,
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  ListTodo: (props: Record<string, unknown>) => <span data-testid="icon-list-todo" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-check2" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-chevron-down" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-chevron-right" {...props} />,
  Terminal: (props: Record<string, unknown>) => <span data-testid="icon-terminal" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-msg" {...props} />,
  DollarSign: (props: Record<string, unknown>) => <span data-testid="icon-dollar" {...props} />,
}))

// Mock ClaudeCodeSessionSelector
vi.mock('../ClaudeCodeSessionSelector', () => ({
  ClaudeCodeSessionSelector: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <div data-testid="session-selector">
      <button onClick={() => onSelect('sess-1')}>Select Session</button>
    </div>
  ),
}))

// Mock TaskBoard
vi.mock('../TaskBoard', () => ({
  TaskBoard: () => <div data-testid="task-board">TaskBoard</div>,
}))

const mockSetActiveSession = vi.fn()
const mockClearError = vi.fn()

const mockActivities: ActivityEvent[] = [
  {
    id: 'evt-1',
    type: 'user',
    timestamp: '2026-01-15T10:00:00Z',
    content: 'Add authentication',
    session_id: 'sess-1',
  },
  {
    id: 'evt-2',
    type: 'assistant',
    timestamp: '2026-01-15T10:01:00Z',
    content: 'I will implement authentication.',
    session_id: 'sess-1',
  },
  {
    id: 'evt-3',
    type: 'tool_use',
    timestamp: '2026-01-15T10:02:00Z',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/auth.ts' },
    session_id: 'sess-1',
  },
  {
    id: 'evt-4',
    type: 'tool_result',
    timestamp: '2026-01-15T10:03:00Z',
    tool_result: 'File updated successfully',
    session_id: 'sess-1',
  },
  {
    id: 'evt-5',
    type: 'error',
    timestamp: '2026-01-15T10:04:00Z',
    content: 'Something failed',
    session_id: 'sess-1',
  },
]

let storeState = {
  activeSessionId: null as string | null,
  activities: [] as ActivityEvent[],
  tasks: {} as Record<string, unknown>,
  isLoadingActivity: false,
  isLoadingTasks: false,
  error: null as string | null,
  setActiveSession: mockSetActiveSession,
  clearError: mockClearError,
}

vi.mock('../../stores/claudeCodeActivity', () => ({
  useClaudeCodeActivityStore: vi.fn(() => storeState),
}))

import { ClaudeCodeActivity } from '../ClaudeCodeActivity'

describe('ClaudeCodeActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      activeSessionId: null,
      activities: [],
      tasks: {},
      isLoadingActivity: false,
      isLoadingTasks: false,
      error: null,
      setActiveSession: mockSetActiveSession,
      clearError: mockClearError,
    }
  })

  it('renders session selector', () => {
    render(<ClaudeCodeActivity />)
    expect(screen.getByTestId('session-selector')).toBeInTheDocument()
  })

  it('shows placeholder when no session selected', () => {
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('Select a Claude Code session')).toBeInTheDocument()
    expect(screen.getByText('Activity events will appear here')).toBeInTheDocument()
  })

  it('shows loading spinner when loading activity', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.isLoadingActivity = true
    render(<ClaudeCodeActivity />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('shows empty state when session selected but no activities', () => {
    storeState.activeSessionId = 'sess-1'
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('No activity in this session')).toBeInTheDocument()
    expect(screen.getByText('Events will appear as the session progresses')).toBeInTheDocument()
  })

  it('renders activity events', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.activities = mockActivities
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('Add authentication')).toBeInTheDocument()
    expect(screen.getByText('I will implement authentication.')).toBeInTheDocument()
  })

  it('renders tool_use event with tool name', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.activities = [mockActivities[2]]
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('renders tool_result event', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.activities = [mockActivities[3]]
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('File updated successfully')).toBeInTheDocument()
  })

  it('shows error banner when error is set', () => {
    storeState.error = 'Connection lost'
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('Connection lost')).toBeInTheDocument()
  })

  it('calls clearError when dismiss is clicked', () => {
    storeState.error = 'Connection lost'
    render(<ClaudeCodeActivity />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockClearError).toHaveBeenCalled()
  })

  it('renders event type labels', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.activities = [mockActivities[0]]
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('user')).toBeInTheDocument()
  })

  it('renders "No content" for events without content', () => {
    storeState.activeSessionId = 'sess-1'
    storeState.activities = [{
      id: 'evt-empty',
      type: 'assistant',
      timestamp: '2026-01-15T10:00:00Z',
      session_id: 'sess-1',
    }]
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('No content')).toBeInTheDocument()
  })

  it('renders Activity and Tasks tabs', () => {
    render(<ClaudeCodeActivity />)
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('switches to Tasks tab and shows TaskBoard', () => {
    storeState.activeSessionId = 'sess-1'
    render(<ClaudeCodeActivity />)
    fireEvent.click(screen.getByText('Tasks'))
    expect(screen.getByTestId('task-board')).toBeInTheDocument()
  })
})
