import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowRunLogs } from '../WorkflowRunLogs'

let mockWorkflowStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/workflows', () => ({
  useWorkflowStore: () => mockWorkflowStoreState,
}))

const mockActiveRun = {
  id: 'r1',
  workflow_id: 'w1',
  workflow_name: 'CI Pipeline',
  trigger_type: 'manual' as const,
  trigger_payload: {},
  status: 'running' as const,
  started_at: '2024-01-01T10:00:00Z',
  total_cost: 0.01,
  jobs: [],
}

const mockLogs = [
  { timestamp: '2024-01-01T10:00:00Z', level: 'run', message: 'Workflow started' },
  { timestamp: '2024-01-01T10:00:01Z', level: 'job', message: 'Job: build' },
  { timestamp: '2024-01-01T10:00:02Z', level: 'error', message: 'Build failed' },
]

// Mock scrollIntoView which is not available in jsdom
Element.prototype.scrollIntoView = vi.fn()

describe('WorkflowRunLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      activeRun: mockActiveRun,
      runLogs: { r1: mockLogs },
      cancelRun: vi.fn(),
      retryRun: vi.fn(),
      setActiveRun: vi.fn(),
      stopLogStream: vi.fn(),
    }
  })

  it('returns null when no active run', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, activeRun: null }
    const { container } = render(<WorkflowRunLogs />)
    expect(container.innerHTML).toBe('')
  })

  it('renders Run Logs heading', () => {
    render(<WorkflowRunLogs />)
    expect(screen.getByText('Run Logs')).toBeInTheDocument()
  })

  it('shows active run status', () => {
    render(<WorkflowRunLogs />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('renders log messages', () => {
    render(<WorkflowRunLogs />)
    expect(screen.getByText('Workflow started')).toBeInTheDocument()
    expect(screen.getByText('Job: build')).toBeInTheDocument()
    expect(screen.getByText('Build failed')).toBeInTheDocument()
  })

  it('shows waiting state when no logs', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      runLogs: { r1: [] },
    }
    render(<WorkflowRunLogs />)
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument()
  })

  it('shows cancel button when run is active (running)', () => {
    render(<WorkflowRunLogs />)
    const cancelBtn = screen.getByTitle('Cancel')
    expect(cancelBtn).toBeInTheDocument()
  })

  it('calls cancelRun on cancel button click', () => {
    render(<WorkflowRunLogs />)
    fireEvent.click(screen.getByTitle('Cancel'))
    expect(mockWorkflowStoreState.cancelRun).toHaveBeenCalledWith('r1')
  })

  it('shows retry button when run has failed', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      activeRun: { ...mockActiveRun, status: 'failed' },
    }
    render(<WorkflowRunLogs />)
    expect(screen.getByTitle('Retry')).toBeInTheDocument()
  })

  it('calls retryRun on retry button click', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      activeRun: { ...mockActiveRun, status: 'failed' },
    }
    render(<WorkflowRunLogs />)
    fireEvent.click(screen.getByTitle('Retry'))
    expect(mockWorkflowStoreState.retryRun).toHaveBeenCalledWith('r1')
  })

  it('calls setActiveRun(null) and stopLogStream on close', () => {
    render(<WorkflowRunLogs />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(mockWorkflowStoreState.setActiveRun).toHaveBeenCalledWith(null)
    expect(mockWorkflowStoreState.stopLogStream).toHaveBeenCalled()
  })

  it('does not show cancel button for completed run', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      activeRun: { ...mockActiveRun, status: 'completed' },
    }
    render(<WorkflowRunLogs />)
    expect(screen.queryByTitle('Cancel')).not.toBeInTheDocument()
  })

  it('does not show retry button for running run', () => {
    render(<WorkflowRunLogs />)
    expect(screen.queryByTitle('Retry')).not.toBeInTheDocument()
  })
})
