import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowDetail } from '../WorkflowDetail'

// Mock child components
vi.mock('../WorkflowDAG', () => ({
  WorkflowDAG: ({ definition }: { definition: unknown }) => (
    <div data-testid="workflow-dag">DAG: {JSON.stringify(definition)}</div>
  ),
}))

vi.mock('../WorkflowRunsTable', () => ({
  WorkflowRunsTable: ({ runs }: { runs: unknown[] }) => (
    <div data-testid="workflow-runs-table">Runs: {runs.length}</div>
  ),
}))

let mockWorkflowStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/workflows', () => ({
  useWorkflowStore: () => mockWorkflowStoreState,
}))

let mockProjectsStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/projects', () => ({
  useProjectsStore: () => mockProjectsStoreState,
}))

const mockWorkflow = {
  id: 'w1',
  name: 'CI Pipeline',
  description: 'Runs tests and builds',
  status: 'active' as const,
  version: 3,
  project_id: 'p1',
  definition: {
    name: 'CI Pipeline',
    jobs: {
      build: { steps: [{ name: 'Build', run: 'echo build' }] },
      test: { needs: ['build'], steps: [{ name: 'Test', run: 'echo test' }] },
    },
  },
  yaml_content: 'name: CI Pipeline',
  created_by: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  last_run_at: null,
  last_run_status: null,
}

describe('WorkflowDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      workflows: [mockWorkflow],
      selectedWorkflowId: 'w1',
      runs: { w1: [] },
      isRunning: false,
      fetchRuns: vi.fn(),
      triggerRun: vi.fn(),
      deleteWorkflow: vi.fn(),
      setShowYamlEditor: vi.fn(),
    }
    mockProjectsStoreState = {
      projects: [{ id: 'p1', name: 'Test Project' }],
    }
  })

  it('returns null when no workflow is selected', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      workflows: [],
      selectedWorkflowId: null,
    }
    const { container } = render(<WorkflowDetail />)
    expect(container.innerHTML).toBe('')
  })

  it('renders workflow name and description', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('CI Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Runs tests and builds')).toBeInTheDocument()
  })

  it('shows version and job count', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('Jobs: 2')).toBeInTheDocument()
  })

  it('shows associated project name', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('renders Pipeline heading', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
  })

  it('renders Run History heading', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('Run History')).toBeInTheDocument()
  })

  it('renders YAML button', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('YAML')).toBeInTheDocument()
  })

  it('calls setShowYamlEditor on YAML button click', () => {
    render(<WorkflowDetail />)
    fireEvent.click(screen.getByText('YAML'))
    expect(mockWorkflowStoreState.setShowYamlEditor).toHaveBeenCalledWith(true)
  })

  it('renders Run button', () => {
    render(<WorkflowDetail />)
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('calls triggerRun on Run button click', () => {
    render(<WorkflowDetail />)
    fireEvent.click(screen.getByText('Run'))
    expect(mockWorkflowStoreState.triggerRun).toHaveBeenCalledWith('w1')
  })

  it('shows Running... when isRunning is true', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, isRunning: true }
    render(<WorkflowDetail />)
    expect(screen.getByText('Running...')).toBeInTheDocument()
  })

  it('calls fetchRuns on mount', () => {
    render(<WorkflowDetail />)
    expect(mockWorkflowStoreState.fetchRuns).toHaveBeenCalledWith('w1')
  })

  it('renders DAG and RunsTable child components', () => {
    render(<WorkflowDetail />)
    expect(screen.getByTestId('workflow-dag')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-runs-table')).toBeInTheDocument()
  })
})
