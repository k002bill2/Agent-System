import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowCreateModal } from '../WorkflowCreateModal'

let mockWorkflowStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/workflows', () => ({
  useWorkflowStore: () => mockWorkflowStoreState,
}))

let mockProjectsStoreState: Record<string, unknown> = {}
vi.mock('../../../stores/projects', () => ({
  useProjectsStore: () => mockProjectsStoreState,
}))

describe('WorkflowCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState = {
      createWorkflow: vi.fn().mockResolvedValue({ id: 'new-w' }),
      setShowCreateModal: vi.fn(),
      isLoading: false,
      error: null,
      workflows: [],
    }
    mockProjectsStoreState = {
      projects: [
        { id: 'p1', name: 'Project Alpha' },
        { id: 'p2', name: 'Project Beta' },
      ],
      fetchProjects: vi.fn(),
    }
  })

  it('renders create modal heading', () => {
    render(<WorkflowCreateModal />)
    expect(screen.getByText('새 워크플로우 생성')).toBeInTheDocument()
  })

  it('renders name and description inputs', () => {
    render(<WorkflowCreateModal />)
    expect(screen.getByText('이름')).toBeInTheDocument()
    expect(screen.getByText('설명')).toBeInTheDocument()
  })

  it('renders project selector with required indicator', () => {
    render(<WorkflowCreateModal />)
    expect(screen.getByText('프로젝트를 선택하세요')).toBeInTheDocument()
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('renders YAML textarea with sample content', () => {
    const { container } = render(<WorkflowCreateModal />)
    expect(screen.getByText('Workflow Definition (YAML)')).toBeInTheDocument()
    const textarea = container.querySelector('textarea')
    expect(textarea).toBeInTheDocument()
    expect(textarea!.value).toContain('CI Pipeline')
  })

  it('renders create and cancel buttons', () => {
    render(<WorkflowCreateModal />)
    expect(screen.getByText('생성')).toBeInTheDocument()
    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('calls setShowCreateModal(false) on cancel click', () => {
    render(<WorkflowCreateModal />)
    fireEvent.click(screen.getByText('취소'))
    expect(mockWorkflowStoreState.setShowCreateModal).toHaveBeenCalledWith(false)
  })

  it('calls setShowCreateModal(false) on X button click', () => {
    render(<WorkflowCreateModal />)
    const buttons = screen.getAllByRole('button')
    // X button is the one in the header
    const closeBtn = buttons.find(b => b.querySelector('svg') && b.closest('.border-b'))
    if (closeBtn) fireEvent.click(closeBtn)
    expect(mockWorkflowStoreState.setShowCreateModal).toHaveBeenCalledWith(false)
  })

  it('shows project error when submitting without project', () => {
    render(<WorkflowCreateModal />)
    fireEvent.click(screen.getByText('생성'))
    expect(screen.getByText('프로젝트를 선택해주세요')).toBeInTheDocument()
  })

  it('shows loading state when isLoading is true', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, isLoading: true }
    render(<WorkflowCreateModal />)
    expect(screen.getByText('생성 중...')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockWorkflowStoreState = { ...mockWorkflowStoreState, error: 'Creation failed' }
    render(<WorkflowCreateModal />)
    expect(screen.getByText('Creation failed')).toBeInTheDocument()
  })

  it('calls fetchProjects on mount', () => {
    render(<WorkflowCreateModal />)
    expect(mockProjectsStoreState.fetchProjects).toHaveBeenCalled()
  })

  it('shows duplicate warning when same name exists in project', () => {
    mockWorkflowStoreState = {
      ...mockWorkflowStoreState,
      workflows: [{ id: 'existing', name: 'New Workflow', project_id: 'p1' }],
    }
    render(<WorkflowCreateModal />)
    // Select project p1 - default name is 'New Workflow' when name input is empty
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'p1' } })
    // Should show duplicate warning
    expect(screen.getByText(/이미 존재합니다/)).toBeInTheDocument()
    expect(screen.getByText('그래도 생성')).toBeInTheDocument()
  })
})
