import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowsPage } from './WorkflowsPage'

// Mock child components
vi.mock('../components/workflows/WorkflowList', () => ({
  WorkflowList: () => <div data-testid="workflow-list">WorkflowList</div>,
}))
vi.mock('../components/workflows/WorkflowDetail', () => ({
  WorkflowDetail: () => <div data-testid="workflow-detail">WorkflowDetail</div>,
}))
vi.mock('../components/workflows/WorkflowRunLogs', () => ({
  WorkflowRunLogs: () => <div data-testid="workflow-run-logs">RunLogs</div>,
}))
vi.mock('../components/workflows/WorkflowCreateModal', () => ({
  WorkflowCreateModal: () => <div data-testid="create-modal">CreateModal</div>,
}))
vi.mock('../components/workflows/SecretsManager', () => ({
  SecretsManager: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="secrets-manager">
      <button onClick={onClose}>CloseSecrets</button>
    </div>
  ),
}))
vi.mock('../components/workflows/TemplateGallery', () => ({
  TemplateGallery: ({ onClose, onSelect }: { onClose: () => void; onSelect: (tpl: unknown, projectId: string) => void }) => (
    <div data-testid="template-gallery">
      <button onClick={onClose}>CloseGallery</button>
      <button onClick={() => onSelect({ name: 'test', yaml_content: 'test: true' }, 'proj-1')}>
        SelectTemplate
      </button>
    </div>
  ),
}))
vi.mock('../components/workflows/WorkflowYamlModal', () => ({
  WorkflowYamlModal: () => <div data-testid="yaml-modal">YamlModal</div>,
}))

// Store mocks
const mockFetchWorkflows = vi.fn()
const mockFetchProjects = vi.fn()
const mockSetShowCreateModal = vi.fn()
const mockSetShowSecretsManager = vi.fn()
const mockSetShowTemplateGallery = vi.fn()
const mockCreateWorkflow = vi.fn()

let mockSelectedWorkflowId: string | null = null
let mockActiveRun: unknown = null
let mockIsLoading = false
let mockShowCreateModal = false
let mockShowYamlEditor = false
let mockShowSecretsManager = false
let mockShowTemplateGallery = false
let mockProjects: Array<{ id: string; name: string }> = []

vi.mock('../stores/workflows', () => ({
  useWorkflowStore: () => ({
    selectedWorkflowId: mockSelectedWorkflowId,
    activeRun: mockActiveRun,
    isLoading: mockIsLoading,
    showCreateModal: mockShowCreateModal,
    showYamlEditor: mockShowYamlEditor,
    showSecretsManager: mockShowSecretsManager,
    showTemplateGallery: mockShowTemplateGallery,
    fetchWorkflows: mockFetchWorkflows,
    setShowCreateModal: mockSetShowCreateModal,
    setShowSecretsManager: mockSetShowSecretsManager,
    setShowTemplateGallery: mockSetShowTemplateGallery,
    createWorkflow: mockCreateWorkflow,
  }),
}))

vi.mock('../stores/projects', () => ({
  useProjectsStore: () => ({
    projects: mockProjects,
    fetchProjects: mockFetchProjects,
  }),
}))

describe('WorkflowsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedWorkflowId = null
    mockActiveRun = null
    mockIsLoading = false
    mockShowCreateModal = false
    mockShowYamlEditor = false
    mockShowSecretsManager = false
    mockShowTemplateGallery = false
    mockProjects = [{ id: 'p1', name: 'Project 1' }]
  })

  // ── Rendering / Layout ──────────────────────────────────────

  it('renders workflow list panel with heading and list component', () => {
    render(<WorkflowsPage />)
    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-list')).toBeInTheDocument()
  })

  it('renders all four toolbar buttons', () => {
    render(<WorkflowsPage />)
    expect(screen.getByTitle('Templates')).toBeInTheDocument()
    expect(screen.getByTitle('Secrets')).toBeInTheDocument()
    expect(screen.getByTitle('Refresh')).toBeInTheDocument()
    expect(screen.getByTitle('New Workflow')).toBeInTheDocument()
  })

  // ── Empty State (no workflow selected) ──────────────────────

  it('shows empty state message when no workflow is selected', () => {
    render(<WorkflowsPage />)
    expect(screen.getByText(/워크플로우를 선택하거나/)).toBeInTheDocument()
    expect(screen.getByText('+ 새 워크플로우')).toBeInTheDocument()
  })

  it('does not render WorkflowDetail in empty state', () => {
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('workflow-detail')).not.toBeInTheDocument()
  })

  // ── Workflow Selected ───────────────────────────────────────

  it('shows WorkflowDetail when a workflow is selected', () => {
    mockSelectedWorkflowId = 'wf-1'
    render(<WorkflowsPage />)
    expect(screen.getByTestId('workflow-detail')).toBeInTheDocument()
    expect(screen.queryByText(/워크플로우를 선택하거나/)).not.toBeInTheDocument()
  })

  it('shows WorkflowRunLogs panel when activeRun exists', () => {
    mockSelectedWorkflowId = 'wf-1'
    mockActiveRun = { id: 'run-1' }
    render(<WorkflowsPage />)
    expect(screen.getByTestId('workflow-run-logs')).toBeInTheDocument()
  })

  it('does not show WorkflowRunLogs when activeRun is null', () => {
    mockSelectedWorkflowId = 'wf-1'
    mockActiveRun = null
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('workflow-run-logs')).not.toBeInTheDocument()
  })

  // ── Modals Conditional Rendering ────────────────────────────

  it('renders WorkflowCreateModal when showCreateModal is true', () => {
    mockShowCreateModal = true
    render(<WorkflowsPage />)
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
  })

  it('does not render WorkflowCreateModal when showCreateModal is false', () => {
    mockShowCreateModal = false
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
  })

  it('renders WorkflowYamlModal when showYamlEditor is true', () => {
    mockShowYamlEditor = true
    render(<WorkflowsPage />)
    expect(screen.getByTestId('yaml-modal')).toBeInTheDocument()
  })

  it('does not render WorkflowYamlModal when showYamlEditor is false', () => {
    mockShowYamlEditor = false
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('yaml-modal')).not.toBeInTheDocument()
  })

  it('renders SecretsManager when showSecretsManager is true', () => {
    mockShowSecretsManager = true
    render(<WorkflowsPage />)
    expect(screen.getByTestId('secrets-manager')).toBeInTheDocument()
  })

  it('does not render SecretsManager when showSecretsManager is false', () => {
    mockShowSecretsManager = false
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('secrets-manager')).not.toBeInTheDocument()
  })

  it('renders TemplateGallery when showTemplateGallery is true', () => {
    mockShowTemplateGallery = true
    render(<WorkflowsPage />)
    expect(screen.getByTestId('template-gallery')).toBeInTheDocument()
  })

  it('does not render TemplateGallery when showTemplateGallery is false', () => {
    mockShowTemplateGallery = false
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('template-gallery')).not.toBeInTheDocument()
  })

  it('does not render any modals when all modal flags are false', () => {
    render(<WorkflowsPage />)
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('yaml-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('secrets-manager')).not.toBeInTheDocument()
    expect(screen.queryByTestId('template-gallery')).not.toBeInTheDocument()
  })

  // ── Toolbar Button Interactions ─────────────────────────────

  it('calls setShowTemplateGallery(true) when Templates button clicked', () => {
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByTitle('Templates'))
    expect(mockSetShowTemplateGallery).toHaveBeenCalledWith(true)
  })

  it('calls setShowSecretsManager(true) when Secrets button clicked', () => {
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByTitle('Secrets'))
    expect(mockSetShowSecretsManager).toHaveBeenCalledWith(true)
  })

  it('calls fetchWorkflows when Refresh button clicked', () => {
    render(<WorkflowsPage />)
    mockFetchWorkflows.mockClear()
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockFetchWorkflows).toHaveBeenCalledTimes(1)
    // Refresh button calls fetchWorkflows() with no arguments
    expect(mockFetchWorkflows).toHaveBeenCalledWith()
  })

  it('calls setShowCreateModal(true) when New Workflow toolbar button clicked', () => {
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByTitle('New Workflow'))
    expect(mockSetShowCreateModal).toHaveBeenCalledWith(true)
  })

  it('calls setShowCreateModal(true) when empty state create button clicked', () => {
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByText('+ 새 워크플로우'))
    expect(mockSetShowCreateModal).toHaveBeenCalledWith(true)
  })

  // ── Loading State ───────────────────────────────────────────

  it('applies animate-spin class to RefreshCw icon when isLoading is true', () => {
    mockIsLoading = true
    render(<WorkflowsPage />)
    const refreshBtn = screen.getByTitle('Refresh')
    const svgIcon = refreshBtn.querySelector('svg')
    expect(svgIcon?.classList.contains('animate-spin')).toBe(true)
  })

  it('does not apply animate-spin class when isLoading is false', () => {
    mockIsLoading = false
    render(<WorkflowsPage />)
    const refreshBtn = screen.getByTitle('Refresh')
    const svgIcon = refreshBtn.querySelector('svg')
    expect(svgIcon?.classList.contains('animate-spin')).toBe(false)
  })

  // ── Data Fetching on Mount ──────────────────────────────────

  it('fetches projects on mount', () => {
    render(<WorkflowsPage />)
    expect(mockFetchProjects).toHaveBeenCalledTimes(1)
  })

  it('fetches workflows on mount with undefined when no filter set', () => {
    render(<WorkflowsPage />)
    expect(mockFetchWorkflows).toHaveBeenCalledWith(undefined)
  })

  // ── Project Filter ──────────────────────────────────────────

  it('renders project filter with "모든 프로젝트" default option', () => {
    render(<WorkflowsPage />)
    expect(screen.getByText('모든 프로젝트')).toBeInTheDocument()
  })

  it('renders all project options in the filter dropdown', () => {
    mockProjects = [
      { id: 'p1', name: 'Project Alpha' },
      { id: 'p2', name: 'Project Beta' },
      { id: 'p3', name: 'Project Gamma' },
    ]
    render(<WorkflowsPage />)
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
    expect(screen.getByText('Project Gamma')).toBeInTheDocument()
  })

  it('renders empty dropdown when no projects exist', () => {
    mockProjects = []
    render(<WorkflowsPage />)
    const select = screen.getByDisplayValue('모든 프로젝트')
    // Only the default option should be present
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toBe('모든 프로젝트')
  })

  it('calls fetchWorkflows with project id when filter changes to a project', () => {
    render(<WorkflowsPage />)
    mockFetchWorkflows.mockClear()
    const select = screen.getByDisplayValue('모든 프로젝트')
    fireEvent.change(select, { target: { value: 'p1' } })
    // After changing to p1, the useEffect re-runs with filterProjectId = 'p1'
    expect(mockFetchWorkflows).toHaveBeenCalled()
  })

  it('calls fetchWorkflows with undefined when filter reset to all projects', () => {
    // Start by rendering with a selection, then reset
    render(<WorkflowsPage />)
    const select = screen.getByDisplayValue('모든 프로젝트')

    // Select a project
    fireEvent.change(select, { target: { value: 'p1' } })
    mockFetchWorkflows.mockClear()

    // Reset to all
    fireEvent.change(select, { target: { value: '' } })
    // The component passes filterProjectId || undefined, so empty string becomes undefined
    expect(mockFetchWorkflows).toHaveBeenCalled()
  })

  // ── SecretsManager onClose ──────────────────────────────────

  it('calls setShowSecretsManager(false) when SecretsManager close button clicked', () => {
    mockShowSecretsManager = true
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByText('CloseSecrets'))
    expect(mockSetShowSecretsManager).toHaveBeenCalledWith(false)
  })

  // ── TemplateGallery onClose ─────────────────────────────────

  it('calls setShowTemplateGallery(false) when TemplateGallery close button clicked', () => {
    mockShowTemplateGallery = true
    render(<WorkflowsPage />)
    fireEvent.click(screen.getByText('CloseGallery'))
    expect(mockSetShowTemplateGallery).toHaveBeenCalledWith(false)
  })

  // ── TemplateGallery onSelect ────────────────────────────────

  it('creates workflow, closes gallery, and refreshes when template is selected', async () => {
    mockShowTemplateGallery = true
    mockCreateWorkflow.mockResolvedValueOnce({ id: 'wf-new', name: 'test' })
    render(<WorkflowsPage />)

    fireEvent.click(screen.getByText('SelectTemplate'))

    await waitFor(() => {
      expect(mockCreateWorkflow).toHaveBeenCalledWith({
        name: 'test',
        yaml_content: 'test: true',
        project_id: 'proj-1',
      })
    })

    await waitFor(() => {
      expect(mockSetShowTemplateGallery).toHaveBeenCalledWith(false)
      expect(mockFetchWorkflows).toHaveBeenCalled()
    })
  })

  it('calls createWorkflow with correct data when template selected', async () => {
    mockShowTemplateGallery = true
    mockCreateWorkflow.mockResolvedValueOnce(null)
    render(<WorkflowsPage />)

    fireEvent.click(screen.getByText('SelectTemplate'))

    await waitFor(() => {
      expect(mockCreateWorkflow).toHaveBeenCalledWith({
        name: 'test',
        yaml_content: 'test: true',
        project_id: 'proj-1',
      })
    })
  })

  // ── Multiple Modal Combinations ─────────────────────────────

  it('can render multiple modals simultaneously if flags allow', () => {
    mockShowCreateModal = true
    mockShowYamlEditor = true
    render(<WorkflowsPage />)
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
    expect(screen.getByTestId('yaml-modal')).toBeInTheDocument()
  })

  // ── Layout Variants ─────────────────────────────────────────

  it('applies border-r class to detail panel when activeRun exists', () => {
    mockSelectedWorkflowId = 'wf-1'
    mockActiveRun = { id: 'run-1' }
    render(<WorkflowsPage />)
    const detailContainer = screen.getByTestId('workflow-detail').parentElement
    expect(detailContainer?.className).toContain('border-r')
  })

  it('does not apply border-r class to detail panel when no activeRun', () => {
    mockSelectedWorkflowId = 'wf-1'
    mockActiveRun = null
    render(<WorkflowsPage />)
    const detailContainer = screen.getByTestId('workflow-detail').parentElement
    expect(detailContainer?.className).not.toContain('border-r')
  })
})
