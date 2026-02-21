import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { TaskPanel } from '../TaskPanel'
import type { Task, TaskStatus } from '@/stores/orchestration'

// Selector-compatible mock helper
const selectorMock = (state: Record<string, unknown>) =>
  ((selector?: (s: Record<string, unknown>) => unknown) => selector ? selector(state) : state) as never

// ── Mock stores ──

const mockPauseTask = vi.fn().mockResolvedValue(undefined)
const mockResumeTask = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      tasks: {},
      rootTaskId: null,
      isProcessing: false,
      sessionId: null,
      selectedProjectId: null,
      projects: [],
      pauseTask: mockPauseTask,
      resumeTask: mockResumeTask,
    }
    return selector ? selector(state) : state
  }),
}))

// Mock feedback components (they have their own tests)
vi.mock('../feedback/FeedbackButton', () => ({
  FeedbackButton: ({ taskId }: { taskId: string }) => (
    <div data-testid={`feedback-btn-${taskId}`}>FeedbackBtn</div>
  ),
}))

vi.mock('../feedback/TaskEvaluationCard', () => ({
  TaskEvaluationCard: ({ sessionId }: { sessionId: string }) => (
    <div data-testid={`eval-card-${sessionId}`}>EvalCard</div>
  ),
}))

import { useOrchestrationStore } from '@/stores/orchestration'

// ── Helper to create tasks ──

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    description: '',
    status: 'pending' as TaskStatus,
    parentId: null,
    children: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pausedAt: null,
    pauseReason: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  }
}

describe('TaskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Empty state ──

  it('shows empty state when no tasks', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks: {},
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    expect(screen.getByText('Send a message to start orchestration')).toBeInTheDocument()
  })

  // ── 2. Header ──

  it('renders Task Tree header', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks: {},
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Task Tree')).toBeInTheDocument()
  })

  it('shows Processing indicator when isProcessing is true', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks: {},
        rootTaskId: null,
        isProcessing: true,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  // ── 3. Rendering tasks ──

  it('renders a single task with correct title and status', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Setup Database', status: 'completed' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Setup Database')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders multiple tasks', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Task A', status: 'pending' }),
      't2': makeTask({ id: 't2', title: 'Task B', status: 'in_progress' }),
      't3': makeTask({ id: 't3', title: 'Task C', status: 'failed' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
    expect(screen.getByText('Task C')).toBeInTheDocument()
  })

  // ── 4. Root task hierarchy ──

  it('renders root task and children hierarchy', () => {
    const tasks: Record<string, Task> = {
      'root': makeTask({ id: 'root', title: 'Root Task', status: 'in_progress', children: ['child1'] }),
      'child1': makeTask({ id: 'child1', title: 'Child Task', status: 'pending', parentId: 'root' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: 'root',
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Root Task')).toBeInTheDocument()
    expect(screen.getByText('Child Task')).toBeInTheDocument()
  })

  // ── 5. Status labels ──

  it('shows correct status labels for each status type', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Pending T', status: 'pending' }),
      't2': makeTask({ id: 't2', title: 'Progress T', status: 'in_progress' }),
      't3': makeTask({ id: 't3', title: 'Completed T', status: 'completed' }),
      't4': makeTask({ id: 't4', title: 'Failed T', status: 'failed' }),
      't5': makeTask({ id: 't5', title: 'Paused T', status: 'paused' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  // ── 6. Stats footer ──

  it('shows task stats in footer', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'A', status: 'pending' }),
      't2': makeTask({ id: 't2', title: 'B', status: 'completed' }),
      't3': makeTask({ id: 't3', title: 'C', status: 'in_progress' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText(/1 Pending/)).toBeInTheDocument()
    expect(screen.getByText(/1 Active/)).toBeInTheDocument()
    expect(screen.getByText(/1 Done/)).toBeInTheDocument()
    expect(screen.getByText(/0 Paused/)).toBeInTheDocument()
  })

  // ── 7. Deleted tasks filtered ──

  it('filters out deleted tasks', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Visible Task', status: 'pending' }),
      't2': makeTask({ id: 't2', title: 'Deleted Task', status: 'pending', isDeleted: true, deletedAt: '2026-01-01' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText('Visible Task')).toBeInTheDocument()
    expect(screen.queryByText('Deleted Task')).not.toBeInTheDocument()
  })

  // ── 8. Pause reason display ──

  it('shows pause reason when task is paused with reason', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({
        id: 't1',
        title: 'Paused Task',
        status: 'paused',
        pauseReason: 'Awaiting approval',
      }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByText(/Awaiting approval/)).toBeInTheDocument()
  })

  // ── 9. Pause button ──

  it('shows pause button for pending/in_progress tasks and calls pauseTask', async () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Running Task', status: 'in_progress' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    const pauseButton = screen.getByTitle('Pause task')
    fireEvent.click(pauseButton)

    await waitFor(() => {
      expect(mockPauseTask).toHaveBeenCalledWith('t1')
    })
  })

  // ── 10. Resume button ──

  it('shows resume button for paused tasks and calls resumeTask', async () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Paused Task', status: 'paused' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    const resumeButton = screen.getByTitle('Resume task')
    fireEvent.click(resumeButton)

    await waitFor(() => {
      expect(mockResumeTask).toHaveBeenCalledWith('t1')
    })
  })

  // ── 11. Feedback button for completed tasks ──

  it('shows feedback button for completed tasks when sessionId exists', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Done Task', status: 'completed' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: 'session-123',
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByTestId('feedback-btn-t1')).toBeInTheDocument()
  })

  it('does not show feedback button for completed tasks without sessionId', () => {
    const tasks: Record<string, Task> = {
      't1': makeTask({ id: 't1', title: 'Done Task', status: 'completed' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: null,
        isProcessing: false,
        sessionId: null,
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.queryByTestId('feedback-btn-t1')).not.toBeInTheDocument()
  })

  // ── 12. Evaluation card for completed root task ──

  it('shows evaluation card when root task is completed with sessionId', () => {
    const tasks: Record<string, Task> = {
      'root': makeTask({ id: 'root', title: 'Root', status: 'completed', description: 'Root desc' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: 'root',
        isProcessing: false,
        sessionId: 'session-abc',
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.getByTestId('eval-card-session-abc')).toBeInTheDocument()
  })

  it('does not show evaluation card when root task is not completed', () => {
    const tasks: Record<string, Task> = {
      'root': makeTask({ id: 'root', title: 'Root', status: 'in_progress' }),
    }

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        tasks,
        rootTaskId: 'root',
        isProcessing: false,
        sessionId: 'session-abc',
        selectedProjectId: null,
        projects: [],
        pauseTask: mockPauseTask,
        resumeTask: mockResumeTask,
      })
    )

    render(<TaskPanel />)

    expect(screen.queryByTestId('eval-card-session-abc')).not.toBeInTheDocument()
  })
})
