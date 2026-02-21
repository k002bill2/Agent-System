import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutputLog } from '../OutputLog'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Terminal: (props: Record<string, unknown>) => <svg data-testid="icon-terminal" {...props} />,
  Trash2: (props: Record<string, unknown>) => <svg data-testid="icon-trash" {...props} />,
}))

// Store mock state
const mockSetActiveLogView = vi.fn()
const mockClearLogs = vi.fn()
const mockClearWorkflowLogs = vi.fn()

let mockActiveLogView = 'all' as string
let mockWorkflowChecks: Array<{ id: string; name: string }> = []
let mockCheckLogs: Record<string, Array<{ timestamp: string; text: string; isStderr: boolean; projectId: string }>> = {
  test: [],
  lint: [],
  typecheck: [],
  build: [],
}
let mockWorkflowLogs: Record<string, Array<{ timestamp: string; text: string; isStderr: boolean; projectId: string }>> = {}

vi.mock('../../../stores/monitoring', () => ({
  useMonitoringStore: () => ({
    checkLogs: mockCheckLogs,
    activeLogView: mockActiveLogView,
    setActiveLogView: mockSetActiveLogView,
    clearLogs: mockClearLogs,
    workflowChecks: mockWorkflowChecks,
    workflowLogs: mockWorkflowLogs,
    clearWorkflowLogs: mockClearWorkflowLogs,
  }),
}))

describe('OutputLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveLogView = 'all'
    mockWorkflowChecks = []
    mockCheckLogs = {
      test: [],
      lint: [],
      typecheck: [],
      build: [],
    }
    mockWorkflowLogs = {}
  })

  it('renders "Output Log" heading', () => {
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('Output Log')).toBeInTheDocument()
  })

  it('shows empty state when no logs', () => {
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('No logs yet. Run a check to see output here.')).toBeInTheDocument()
  })

  it('renders tab buttons for all check types', () => {
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Lint')).toBeInTheDocument()
    expect(screen.getByText('TypeCheck')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
  })

  it('calls setActiveLogView when tab is clicked', () => {
    render(<OutputLog projectId="proj-1" />)
    fireEvent.click(screen.getByText('Test'))
    expect(mockSetActiveLogView).toHaveBeenCalledWith('test')
  })

  it('displays log lines when present', () => {
    mockCheckLogs = {
      test: [
        { timestamp: '2024-01-01T00:00:01Z', text: 'Test output line 1', isStderr: false, projectId: 'proj-1' },
        { timestamp: '2024-01-01T00:00:02Z', text: 'Test error line', isStderr: true, projectId: 'proj-1' },
      ],
      lint: [],
      typecheck: [],
      build: [],
    }
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('Test output line 1')).toBeInTheDocument()
    expect(screen.getByText('Test error line')).toBeInTheDocument()
  })

  it('calls clearLogs when clear button is clicked in "all" view', () => {
    mockActiveLogView = 'all'
    render(<OutputLog projectId="proj-1" />)
    const clearBtn = screen.getByTitle('Clear logs')
    fireEvent.click(clearBtn)
    expect(mockClearLogs).toHaveBeenCalled()
    expect(mockClearWorkflowLogs).toHaveBeenCalled()
  })

  it('calls clearLogs with checkType when clear is clicked on a check tab', () => {
    mockActiveLogView = 'test'
    render(<OutputLog projectId="proj-1" />)
    const clearBtn = screen.getByTitle('Clear logs')
    fireEvent.click(clearBtn)
    expect(mockClearLogs).toHaveBeenCalledWith('test')
  })

  it('renders workflow tabs when workflow checks exist', () => {
    mockWorkflowChecks = [
      { id: 'wf-1', name: 'Deploy Workflow' },
    ]
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('Deploy Workflow')).toBeInTheDocument()
  })

  it('filters logs by projectId in "all" view', () => {
    mockCheckLogs = {
      test: [
        { timestamp: '2024-01-01T00:00:01Z', text: 'Matching log', isStderr: false, projectId: 'proj-1' },
        { timestamp: '2024-01-01T00:00:02Z', text: 'Other project log', isStderr: false, projectId: 'proj-2' },
      ],
      lint: [],
      typecheck: [],
      build: [],
    }
    render(<OutputLog projectId="proj-1" />)
    expect(screen.getByText('Matching log')).toBeInTheDocument()
    expect(screen.queryByText('Other project log')).not.toBeInTheDocument()
  })

  it('calls clearWorkflowLogs with workflow id when on workflow tab', () => {
    mockActiveLogView = 'wf-1'
    mockWorkflowChecks = [{ id: 'wf-1', name: 'WF1' }]
    render(<OutputLog projectId="proj-1" />)
    const clearBtn = screen.getByTitle('Clear logs')
    fireEvent.click(clearBtn)
    expect(mockClearWorkflowLogs).toHaveBeenCalledWith('wf-1')
  })
})
