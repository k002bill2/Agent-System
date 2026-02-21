import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowList } from '../WorkflowList'
import type { Workflow } from '../../../types/workflow'

let mockWorkflowStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/workflows', () => ({
  useWorkflowStore: () => mockWorkflowStoreState,
}))

let mockProjectsStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/projects', () => ({
  useProjectsStore: () => mockProjectsStoreState,
}))

const mockWorkflows: Workflow[] = [
  {
    id: 'w1',
    name: 'CI Pipeline',
    description: 'Run tests',
    status: 'active',
    project_id: 'p1',
    definition: { name: 'CI', jobs: {} },
    yaml_content: '',
    version: 1,
    created_by: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    last_run_at: '2024-01-01T10:00:00Z',
    last_run_status: 'completed',
  },
  {
    id: 'w2',
    name: 'Deploy',
    description: 'Deploy to prod',
    status: 'inactive',
    project_id: null,
    definition: { name: 'Deploy', jobs: {} },
    yaml_content: '',
    version: 2,
    created_by: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    last_run_at: null,
    last_run_status: null,
  },
]

describe('WorkflowList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      workflows: mockWorkflows,
      selectedWorkflowId: null,
      selectWorkflow: vi.fn(),
      fetchRuns: vi.fn(),
    }
    mockProjectsStoreState = {
      projects: [{ id: 'p1', name: 'Test Project' }],
    }
  })

  it('renders empty state when no workflows', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, workflows: [] }
    render(<WorkflowList />)
    expect(screen.getByText('워크플로우가 없습니다')).toBeInTheDocument()
  })

  it('renders workflow names', () => {
    render(<WorkflowList />)
    expect(screen.getByText('CI Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('shows status badges', () => {
    render(<WorkflowList />)
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('inactive')).toBeInTheDocument()
  })

  it('shows last run time for workflows with runs', () => {
    render(<WorkflowList />)
    // w2 has no last_run_at, so it should show "never"
    expect(screen.getByText('never')).toBeInTheDocument()
  })

  it('shows project name for workflows linked to a project', () => {
    render(<WorkflowList />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('calls selectWorkflow and fetchRuns on click', () => {
    render(<WorkflowList />)
    fireEvent.click(screen.getByText('CI Pipeline'))
    expect(mockWorkflowStoreState.selectWorkflow).toHaveBeenCalledWith('w1')
    expect(mockWorkflowStoreState.fetchRuns).toHaveBeenCalledWith('w1')
  })

  it('highlights selected workflow', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, selectedWorkflowId: 'w1' }
    render(<WorkflowList />)
    const selectedButton = screen.getByText('CI Pipeline').closest('button')!
    expect(selectedButton.className).toContain('primary')
  })
})
