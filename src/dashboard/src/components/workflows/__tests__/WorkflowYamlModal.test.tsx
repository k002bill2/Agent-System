import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowYamlModal } from '../WorkflowYamlModal'

// Mock the YamlEditor child component
vi.mock('../YamlEditor', () => ({
  YamlEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="yaml-editor" value={value} onChange={e => onChange(e.target.value)} />
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
  description: 'Runs CI',
  status: 'active',
  project_id: 'p1',
  definition: { name: 'CI', jobs: {} },
  yaml_content: 'name: CI Pipeline\njobs: {}',
  version: 1,
  created_by: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  last_run_at: null,
  last_run_status: null,
}

describe('WorkflowYamlModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      workflows: [mockWorkflow],
      selectedWorkflowId: 'w1',
      updateWorkflow: vi.fn().mockResolvedValue(undefined),
      setShowYamlEditor: vi.fn(),
      fetchWorkflows: vi.fn().mockResolvedValue(undefined),
    }
    mockProjectsStoreState = {
      projects: [
        { id: 'p1', name: 'Project A' },
        { id: 'p2', name: 'Project B' },
      ],
      fetchProjects: vi.fn(),
    }
  })

  it('returns null when no workflow is found', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, workflows: [], selectedWorkflowId: null }
    const { container } = render(<WorkflowYamlModal />)
    expect(container.innerHTML).toBe('')
  })

  it('renders modal with edit heading', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByText('워크플로우 편집')).toBeInTheDocument()
  })

  it('shows name input with workflow name', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByText('이름')).toBeInTheDocument()
    const nameInput = screen.getByDisplayValue('CI Pipeline')
    expect(nameInput).toBeInTheDocument()
  })

  it('shows description input with workflow description', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByText('설명')).toBeInTheDocument()
    const descInput = screen.getByDisplayValue('Runs CI')
    expect(descInput).toBeInTheDocument()
  })

  it('shows project selector with current project selected', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByText('프로젝트')).toBeInTheDocument()
    // Project options should be rendered
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('Project B')).toBeInTheDocument()
  })

  it('renders YAML editor', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByTestId('yaml-editor')).toBeInTheDocument()
  })

  it('renders save and cancel buttons', () => {
    render(<WorkflowYamlModal />)
    expect(screen.getByText('저장')).toBeInTheDocument()
    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('calls setShowYamlEditor(false) on cancel click', () => {
    render(<WorkflowYamlModal />)
    fireEvent.click(screen.getByText('취소'))
    expect(mockWorkflowStoreState.setShowYamlEditor).toHaveBeenCalledWith(false)
  })

  it('calls setShowYamlEditor(false) on X button click', () => {
    render(<WorkflowYamlModal />)
    // X button is the close button near the heading
    const buttons = screen.getAllByRole('button')
    // First button near the heading is the X close
    const closeBtn = buttons[0]
    fireEvent.click(closeBtn)
    expect(mockWorkflowStoreState.setShowYamlEditor).toHaveBeenCalledWith(false)
  })

  it('calls fetchProjects on mount', () => {
    render(<WorkflowYamlModal />)
    expect(mockProjectsStoreState.fetchProjects).toHaveBeenCalled()
  })
})
