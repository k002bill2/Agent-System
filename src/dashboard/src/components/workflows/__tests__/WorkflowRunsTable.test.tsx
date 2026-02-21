import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowRunsTable } from '../WorkflowRunsTable'
import type { WorkflowRun } from '../../../types/workflow'

let mockWorkflowStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/workflows', () => ({
  useWorkflowStore: () => mockWorkflowStoreState,
}))

const mockRuns: WorkflowRun[] = [
  {
    id: 'r1',
    workflow_id: 'w1',
    workflow_name: 'CI Pipeline',
    trigger_type: 'manual',
    trigger_payload: {},
    status: 'completed',
    started_at: '2024-01-01T10:00:00Z',
    completed_at: '2024-01-01T10:05:00Z',
    duration_seconds: 300,
    total_cost: 0.0125,
    jobs: [],
  },
  {
    id: 'r2',
    workflow_id: 'w1',
    workflow_name: 'CI Pipeline',
    trigger_type: 'push',
    trigger_payload: {},
    status: 'failed',
    started_at: '2024-01-02T10:00:00Z',
    duration_seconds: 45,
    total_cost: 0.005,
    jobs: [],
  },
  {
    id: 'r3',
    workflow_id: 'w1',
    workflow_name: 'CI Pipeline',
    trigger_type: 'schedule',
    trigger_payload: {},
    status: 'running',
    started_at: '2024-01-03T10:00:00Z',
    total_cost: 0,
    jobs: [],
  },
]

describe('WorkflowRunsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      setActiveRun: vi.fn(),
      streamRunLogs: vi.fn(),
    }
  })

  it('renders empty state when no runs', () => {
    render(<WorkflowRunsTable runs={[]} />)
    expect(screen.getByText('아직 실행 이력이 없습니다')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('Started')).toBeInTheDocument()
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
  })

  it('renders run statuses', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('renders trigger types', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    expect(screen.getByText('manual')).toBeInTheDocument()
    expect(screen.getByText('push')).toBeInTheDocument()
    expect(screen.getByText('schedule')).toBeInTheDocument()
  })

  it('formats duration correctly', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    expect(screen.getByText('5m 0s')).toBeInTheDocument()
    expect(screen.getByText('45s')).toBeInTheDocument()
  })

  it('shows dash for runs without duration', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    // r3 has no duration_seconds
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1)
  })

  it('formats cost with 4 decimal places', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    expect(screen.getByText('$0.0125')).toBeInTheDocument()
    expect(screen.getByText('$0.0050')).toBeInTheDocument()
  })

  it('calls setActiveRun on row click', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    fireEvent.click(screen.getByText('completed'))
    expect(mockWorkflowStoreState.setActiveRun).toHaveBeenCalledWith(mockRuns[0])
  })

  it('calls streamRunLogs when clicking a running run', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    fireEvent.click(screen.getByText('running'))
    expect(mockWorkflowStoreState.setActiveRun).toHaveBeenCalledWith(mockRuns[2])
    expect(mockWorkflowStoreState.streamRunLogs).toHaveBeenCalledWith('r3')
  })

  it('does not call streamRunLogs when clicking a completed run', () => {
    render(<WorkflowRunsTable runs={mockRuns} />)
    fireEvent.click(screen.getByText('completed'))
    expect(mockWorkflowStoreState.streamRunLogs).not.toHaveBeenCalled()
  })
})
