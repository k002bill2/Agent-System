import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Must use vi.hoisted for variables used inside vi.mock factories
const { mockSetState } = vi.hoisted(() => ({
  mockSetState: vi.fn(),
}))

// Mock lib/utils
vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// Store mock state
const mockOrchestrationState = {
  tasks: {} as Record<string, {
    id: string
    title: string
    status: string
    children: string[]
    error?: string
  }>,
  rootTaskId: null as string | null,
  connected: false,
  connectionStatus: 'disconnected' as string,
  reconnect: vi.fn(),
  isProcessing: false,
  sessionId: null as string | null,
}

const mockAgentsState = {
  clearExecution: vi.fn(),
}

vi.mock('../../stores/orchestration', () => {
  const hook = vi.fn(() => mockOrchestrationState)
  ;(hook as unknown as Record<string, unknown>).setState = mockSetState
  return { useOrchestrationStore: hook }
})

vi.mock('../../stores/agents', () => ({
  useAgentsStore: vi.fn(() => mockAgentsState),
}))

import { ExecutionProgress } from '../ExecutionProgress'

describe('ExecutionProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrchestrationState.tasks = {}
    mockOrchestrationState.rootTaskId = null
    mockOrchestrationState.connected = false
    mockOrchestrationState.connectionStatus = 'disconnected'
    mockOrchestrationState.reconnect = vi.fn()
    mockOrchestrationState.isProcessing = false
    mockAgentsState.clearExecution = vi.fn()
  })

  it('renders the header', () => {
    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Execution Progress')).toBeInTheDocument()
  })

  it('shows disconnected status when not connected', () => {
    mockOrchestrationState.connected = false
    mockOrchestrationState.connectionStatus = 'disconnected'

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows connected status when connected', () => {
    mockOrchestrationState.connected = true
    mockOrchestrationState.connectionStatus = 'connected'

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows reconnecting status', () => {
    mockOrchestrationState.connected = false
    mockOrchestrationState.connectionStatus = 'reconnecting'

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument()
  })

  it('shows 0/0 subtasks when no root task', () => {
    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('0/0 subtasks')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows waiting message when connected but no tasks', () => {
    mockOrchestrationState.connected = true
    mockOrchestrationState.isProcessing = false

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Waiting for tasks to appear...')).toBeInTheDocument()
  })

  it('shows connecting message when not connected', () => {
    mockOrchestrationState.connected = false
    mockOrchestrationState.isProcessing = false

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Connecting to session...')).toBeInTheDocument()
  })

  it('shows initializing message when processing but no tasks', () => {
    mockOrchestrationState.connected = true
    mockOrchestrationState.isProcessing = true

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Initializing execution...')).toBeInTheDocument()
  })

  it('renders subtask cards', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root Task', status: 'in_progress', children: ['sub-1', 'sub-2'] },
      'sub-1': { id: 'sub-1', title: 'Subtask 1', status: 'completed', children: [] },
      'sub-2': { id: 'sub-2', title: 'Subtask 2', status: 'in_progress', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)

    expect(screen.getByText('Subtask 1')).toBeInTheDocument()
    expect(screen.getByText('Subtask 2')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows correct progress calculation', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'in_progress', children: ['sub-1', 'sub-2', 'sub-3', 'sub-4'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
      'sub-2': { id: 'sub-2', title: 'Sub 2', status: 'completed', children: [] },
      'sub-3': { id: 'sub-3', title: 'Sub 3', status: 'in_progress', children: [] },
      'sub-4': { id: 'sub-4', title: 'Sub 4', status: 'pending', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)

    expect(screen.getByText('2/4 subtasks')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows success banner when all tasks completed', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1', 'sub-2'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
      'sub-2': { id: 'sub-2', title: 'Sub 2', status: 'completed', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)

    expect(screen.getByText('All subtasks completed successfully!')).toBeInTheDocument()
  })

  it('shows error banner when some tasks failed', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1', 'sub-2'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
      'sub-2': { id: 'sub-2', title: 'Sub 2', status: 'failed', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)

    expect(screen.getByText('Execution completed with errors (1 failed)')).toBeInTheDocument()
  })

  it('shows Close button when all tasks are done', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)

    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('calls clearExecution when Close is clicked', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    fireEvent.click(screen.getByText('Close'))
    expect(mockAgentsState.clearExecution).toHaveBeenCalled()
  })

  it('does not show Close button when tasks are still running', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'in_progress', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'in_progress', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.queryByText('Close')).not.toBeInTheDocument()
  })

  it('shows task error message', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Failed Task', status: 'failed', children: [], error: 'Something went wrong' },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('counts failed and cancelled tasks as completed for progress', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1', 'sub-2', 'sub-3'] },
      'sub-1': { id: 'sub-1', title: 'Sub 1', status: 'completed', children: [] },
      'sub-2': { id: 'sub-2', title: 'Sub 2', status: 'failed', children: [] },
      'sub-3': { id: 'sub-3', title: 'Sub 3', status: 'cancelled', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('3/3 subtasks')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders pending status correctly', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'in_progress', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Pending Task', status: 'pending', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders cancelled status correctly', () => {
    mockOrchestrationState.rootTaskId = 'root-1'
    mockOrchestrationState.tasks = {
      'root-1': { id: 'root-1', title: 'Root', status: 'completed', children: ['sub-1'] },
      'sub-1': { id: 'sub-1', title: 'Cancelled Task', status: 'cancelled', children: [] },
    }

    render(<ExecutionProgress sessionId="test-session" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('triggers reconnect when session is provided but not connected', () => {
    mockOrchestrationState.connected = false
    mockOrchestrationState.connectionStatus = 'disconnected'

    render(<ExecutionProgress sessionId="test-session" />)
    expect(mockSetState).toHaveBeenCalledWith({ sessionId: 'test-session' })
    expect(mockOrchestrationState.reconnect).toHaveBeenCalled()
  })
})
