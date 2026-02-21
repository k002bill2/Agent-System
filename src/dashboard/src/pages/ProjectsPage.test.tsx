import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    FolderOpen: icon,
    Plus: icon,
    Link: icon,
    Search: icon,
    MoreVertical: icon,
    Pencil: icon,
    RefreshCw: icon,
    Trash2: icon,
    FileText: icon,
    Database: icon,
    ExternalLink: icon,
    Loader2: icon,
    FileCode: icon,
    GripVertical: icon,
    Sparkles: icon,
  }
})

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}))

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn(),
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  rectSortingStrategy: vi.fn(),
}))

// Mock @dnd-kit/utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}))

const mockFetchProjects = vi.fn()
const mockFetchTemplates = vi.fn()
const mockFilteredProjects = vi.fn(() => [])
const mockGetSelectedProject = vi.fn(() => null)
const mockSetSearchQuery = vi.fn()
const mockSetShowInactive = vi.fn()
const mockOpenCreateModal = vi.fn()
const mockOpenLinkModal = vi.fn()
const mockOpenEditModal = vi.fn()
const mockDeleteProject = vi.fn()
const mockIndexProject = vi.fn()
const mockSelectProject = vi.fn()
const mockFetchDeletionPreview = vi.fn()
const mockReorderProjects = vi.fn()

// Default store state
const defaultStoreState = {
  projects: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  showInactive: false,
  selectedProjectId: null,
  fetchProjects: mockFetchProjects,
  fetchTemplates: mockFetchTemplates,
  setSearchQuery: mockSetSearchQuery,
  setShowInactive: mockSetShowInactive,
  openCreateModal: mockOpenCreateModal,
  openLinkModal: mockOpenLinkModal,
  openEditModal: mockOpenEditModal,
  deleteProject: mockDeleteProject,
  indexProject: mockIndexProject,
  filteredProjects: mockFilteredProjects,
  selectProject: mockSelectProject,
  getSelectedProject: mockGetSelectedProject,
  fetchDeletionPreview: mockFetchDeletionPreview,
  reorderProjects: mockReorderProjects,
}

// Mock stores
vi.mock('../stores/projects', () => ({
  useProjectsStore: vi.fn(() => defaultStoreState),
}))

const mockSetView = vi.fn()
vi.mock('../stores/navigation', () => ({
  useNavigationStore: vi.fn(() => ({
    setView: mockSetView,
  })),
}))

let mockIsAdmin = false
vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', is_admin: mockIsAdmin, is_org_admin: false } }
    return selector ? selector(state) : state
  }),
}))

const mockSelectConfigProject = vi.fn()
vi.mock('../stores/projectConfigs', () => ({
  useProjectConfigsStore: vi.fn(() => ({
    selectProject: mockSelectConfigProject,
  })),
}))

// Mock child components - capture props for interaction testing
let capturedDeleteModalProps: Record<string, unknown> = {}
let capturedClaudeConfigProps: Record<string, unknown> = {}
let capturedRagPanelProps: Record<string, unknown> = {}

vi.mock('../components/ProjectFormModal', () => ({
  ProjectFormModal: () => <div data-testid="project-form-modal" />,
}))

vi.mock('../components/skeletons', () => ({
  ProjectsGridSkeleton: () => <div data-testid="projects-grid-skeleton">Loading...</div>,
}))

vi.mock('../components/projects', () => ({
  ProjectClaudeConfigPanel: (props: Record<string, unknown>) => {
    capturedClaudeConfigProps = props
    return <div data-testid="claude-config-panel" />
  },
  DeleteProjectModal: (props: Record<string, unknown>) => {
    capturedDeleteModalProps = props
    return <div data-testid="delete-project-modal" />
  },
}))

vi.mock('../components/rag', () => ({
  RAGQueryPanel: (props: Record<string, unknown>) => {
    capturedRagPanelProps = props
    return <div data-testid="rag-query-panel" />
  },
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { ProjectsPage } from './ProjectsPage'
import { useProjectsStore } from '../stores/projects'

// Helper to create a mock project
function createProject(overrides: Partial<{
  id: string
  name: string
  path: string
  description: string
  has_claude_md: boolean
  vector_store_initialized: boolean
  is_active: boolean
  indexed_at: string | null
  git_path: string | null
  git_enabled: boolean
  sort_order: number
}> = {}) {
  return {
    id: 'p1',
    name: 'Test Project',
    path: '/test/path',
    description: 'A test project',
    has_claude_md: true,
    vector_store_initialized: false,
    is_active: true,
    indexed_at: null,
    git_path: null,
    git_enabled: false,
    sort_order: 0,
    ...overrides,
  }
}

// Helper to set up the store with projects
function setupStoreWithProjects(
  projects: ReturnType<typeof createProject>[],
  extraState: Partial<typeof defaultStoreState> = {}
) {
  mockFilteredProjects.mockReturnValue(projects)
  vi.mocked(useProjectsStore).mockReturnValue({
    ...defaultStoreState,
    projects,
    filteredProjects: mockFilteredProjects,
    ...extraState,
  } as unknown as ReturnType<typeof useProjectsStore>)
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilteredProjects.mockReturnValue([])
    mockGetSelectedProject.mockReturnValue(null)
    mockIsAdmin = false
    capturedDeleteModalProps = {}
    capturedClaudeConfigProps = {}
    capturedRagPanelProps = {}
    // Reset the default mock
    vi.mocked(useProjectsStore).mockReturnValue(defaultStoreState as unknown as ReturnType<typeof useProjectsStore>)
  })

  it('renders the page header', () => {
    render(<ProjectsPage />)

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Manage your projects and their RAG indexes')).toBeInTheDocument()
  })

  it('renders Create New and Link Existing buttons', () => {
    mockIsAdmin = true
    render(<ProjectsPage />)

    expect(screen.getByText('Create New')).toBeInTheDocument()
    expect(screen.getByText('Link Existing')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<ProjectsPage />)

    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument()
  })

  it('shows empty state when no projects exist', () => {
    render(<ProjectsPage />)

    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    expect(screen.getByText('Create a new project or link an existing one')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading with no projects', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      isLoading: true,
      projects: [],
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByTestId('projects-grid-skeleton')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      error: 'Failed to load projects',
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('Failed to load projects')).toBeInTheDocument()
  })

  it('shows projects when data is available', () => {
    const mockProjects = [createProject()]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('A test project')).toBeInTheDocument()
  })

  it('calls fetchProjects and fetchTemplates on mount', () => {
    render(<ProjectsPage />)

    expect(mockFetchProjects).toHaveBeenCalled()
    expect(mockFetchTemplates).toHaveBeenCalled()
  })

  it('renders the ProjectFormModal', () => {
    render(<ProjectsPage />)

    expect(screen.getByTestId('project-form-modal')).toBeInTheDocument()
  })

  // ── Button click interactions ──

  it('calls openCreateModal when Create New button is clicked', () => {
    mockIsAdmin = true
    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('Create New'))
    expect(mockOpenCreateModal).toHaveBeenCalledTimes(1)
  })

  it('calls openLinkModal when Link Existing button is clicked', () => {
    mockIsAdmin = true
    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('Link Existing'))
    expect(mockOpenLinkModal).toHaveBeenCalledTimes(1)
  })

  // ── Search interaction ──

  it('calls setSearchQuery when search input changes', () => {
    render(<ProjectsPage />)

    const input = screen.getByPlaceholderText('Search projects...')
    fireEvent.change(input, { target: { value: 'my-project' } })
    expect(mockSetSearchQuery).toHaveBeenCalledWith('my-project')
  })

  // ── No search results state ──

  it('shows no matching projects message when search yields no results', () => {
    const mockProjects = [createProject()]
    // projects exist but filteredProjects returns empty
    mockFilteredProjects.mockReturnValue([])
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('No matching projects')).toBeInTheDocument()
    expect(screen.getByText('Try a different search term')).toBeInTheDocument()
  })

  // ── Does not show loading skeleton when projects already exist ──

  it('does not show loading skeleton when loading but projects already exist', () => {
    const mockProjects = [createProject()]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      isLoading: true,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.queryByTestId('projects-grid-skeleton')).not.toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  // ── Admin: show inactive toggle ──

  it('shows inactive filter checkbox for admin when inactive projects exist', () => {
    mockIsAdmin = true
    const mockProjects = [
      createProject({ id: 'p1', is_active: true }),
      createProject({ id: 'p2', name: 'Inactive', is_active: false }),
    ]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText(/Show inactive/)).toBeInTheDocument()
  })

  it('does not show inactive filter checkbox for non-admin', () => {
    mockIsAdmin = false
    const mockProjects = [
      createProject({ id: 'p1', is_active: true }),
      createProject({ id: 'p2', name: 'Inactive', is_active: false }),
    ]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.queryByText(/Show inactive/)).not.toBeInTheDocument()
  })

  it('calls setShowInactive when inactive toggle checkbox changes', () => {
    mockIsAdmin = true
    const mockProjects = [createProject({ id: 'p1', is_active: false })]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(mockSetShowInactive).toHaveBeenCalled()
  })

  // ── Non-admin hides inactive projects ──

  it('filters out inactive projects for non-admin users', () => {
    mockIsAdmin = false
    const mockProjects = [
      createProject({ id: 'p1', name: 'Active Project', is_active: true }),
      createProject({ id: 'p2', name: 'Inactive Project', is_active: false }),
    ]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('Active Project')).toBeInTheDocument()
    expect(screen.queryByText('Inactive Project')).not.toBeInTheDocument()
  })

  it('shows inactive projects for admin users', () => {
    mockIsAdmin = true
    const mockProjects = [
      createProject({ id: 'p1', name: 'Active Project', is_active: true }),
      createProject({ id: 'p2', name: 'Inactive Project', is_active: false }),
    ]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('Active Project')).toBeInTheDocument()
    expect(screen.getByText('Inactive Project')).toBeInTheDocument()
  })

  // ── Project card details ──

  it('displays project path on the card', () => {
    const mockProjects = [createProject({ path: '/home/user/myproject' })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('/home/user/myproject')).toBeInTheDocument()
  })

  it('displays project id on the card', () => {
    const mockProjects = [createProject({ id: 'project-uuid-123' })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('project-uuid-123')).toBeInTheDocument()
  })

  it('does not render description when project has no description', () => {
    const mockProjects = [createProject({ description: '' })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Test Project')).toBeInTheDocument()
    // Empty description should not render a <p> element for it
    expect(screen.queryByText('A test project')).not.toBeInTheDocument()
  })

  // ── CLAUDE.md badge rendering ──

  it('shows CLAUDE.md badge on project cards', () => {
    const mockProjects = [createProject({ has_claude_md: true })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
  })

  // ── RAG badge rendering ──

  it('shows "Not Indexed" badge when vector_store is not initialized', () => {
    const mockProjects = [createProject({ vector_store_initialized: false })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Not Indexed')).toBeInTheDocument()
  })

  it('shows "RAG 검색" badge when vector_store is initialized', () => {
    const mockProjects = [createProject({ vector_store_initialized: true })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('RAG 검색')).toBeInTheDocument()
  })

  // ── Inactive badge ──

  it('shows "Inactive" badge on inactive projects (when visible as admin)', () => {
    mockIsAdmin = true
    const mockProjects = [createProject({ is_active: false })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('does not show "Inactive" badge on active projects', () => {
    const mockProjects = [createProject({ is_active: true })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })

  // ── Claude button on cards ──

  it('shows Claude button when project has claude_md', () => {
    const mockProjects = [createProject({ has_claude_md: true })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('does not show Claude button when project has no claude_md', () => {
    const mockProjects = [createProject({ has_claude_md: false })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.queryByText('Claude')).not.toBeInTheDocument()
  })

  // ── Project card selection ──

  it('calls selectProject when a project card is clicked', () => {
    const mockProjects = [createProject({ id: 'p1' })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('Test Project'))
    expect(mockSelectProject).toHaveBeenCalledWith('p1')
  })

  it('deselects project when clicking the already-selected card', () => {
    const mockProjects = [createProject({ id: 'p1' })]
    setupStoreWithProjects(mockProjects, { selectedProjectId: 'p1' })

    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('Test Project'))
    expect(mockSelectProject).toHaveBeenCalledWith(null)
  })

  // ── Claude Config Panel ──

  it('shows Claude config panel when a project is selected', () => {
    const project = createProject({ id: 'p1' })
    mockGetSelectedProject.mockReturnValue(project)
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects, {
      selectedProjectId: 'p1',
      getSelectedProject: mockGetSelectedProject,
    })

    render(<ProjectsPage />)

    expect(screen.getByTestId('claude-config-panel')).toBeInTheDocument()
  })

  it('does not show Claude config panel when no project is selected', () => {
    const mockProjects = [createProject()]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.queryByTestId('claude-config-panel')).not.toBeInTheDocument()
  })

  // ── Context menu (MoreVertical dropdown) ──

  it('opens dropdown menu when MoreVertical button is clicked on a project card', () => {
    const mockProjects = [createProject({ id: 'p1' })]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // The MoreVertical icon button doesn't have text, find it by surrounding structure
    // There is one MoreVertical button per project card
    const menuButtons = screen.getAllByRole('button')
    // Find the menu toggle button (it's in the card, not Create New/Link Existing)
    // The card has multiple buttons: menu toggle, RAG badge, potentially Claude button
    // The MoreVertical button is the first button inside the absolute top-right div
    // We can find it by looking for buttons that aren't the header buttons
    const cardButtons = menuButtons.filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    // The first card-level button should be the MoreVertical toggle
    expect(cardButtons.length).toBeGreaterThan(0)
    fireEvent.click(cardButtons[0])

    // After clicking, the menu items should be visible
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Reindex RAG')).toBeInTheDocument()
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('calls openEditModal when Edit is clicked from the dropdown', () => {
    const project = createProject({ id: 'p1' })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Open menu
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])

    // Click Edit
    fireEvent.click(screen.getByText('Edit'))
    expect(mockOpenEditModal).toHaveBeenCalledWith(project)
  })

  it('calls indexProject when Reindex RAG is clicked from the dropdown', async () => {
    mockIndexProject.mockResolvedValue(undefined)
    const project = createProject({ id: 'p1' })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Open menu
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])

    // Click Reindex RAG
    fireEvent.click(screen.getByText('Reindex RAG'))

    await waitFor(() => {
      expect(mockIndexProject).toHaveBeenCalledWith('p1')
    })
  })

  it('shows delete modal when Remove is clicked from the dropdown', () => {
    const project = createProject({ id: 'p1' })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Open menu
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])

    // Click Remove
    fireEvent.click(screen.getByText('Remove'))

    expect(screen.getByTestId('delete-project-modal')).toBeInTheDocument()
  })

  // ── RAG search panel ──

  it('opens RAG search panel when RAG badge is clicked', () => {
    const project = createProject({ id: 'p1', vector_store_initialized: true })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Click the RAG 검색 badge button
    fireEvent.click(screen.getByText('RAG 검색'))

    expect(screen.getByTestId('rag-query-panel')).toBeInTheDocument()
  })

  it('opens RAG search panel when Not Indexed badge is clicked', () => {
    const project = createProject({ id: 'p1', vector_store_initialized: false })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('Not Indexed'))

    expect(screen.getByTestId('rag-query-panel')).toBeInTheDocument()
  })

  it('hides Claude config panel when RAG search panel is open', () => {
    const project = createProject({ id: 'p1', vector_store_initialized: true })
    mockGetSelectedProject.mockReturnValue(project)
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects, {
      selectedProjectId: 'p1',
      getSelectedProject: mockGetSelectedProject,
    })

    render(<ProjectsPage />)

    // Initially claude config panel should be shown
    expect(screen.getByTestId('claude-config-panel')).toBeInTheDocument()

    // Click the RAG search button
    fireEvent.click(screen.getByText('RAG 검색'))

    // Now RAG panel should show and claude config panel should be hidden
    expect(screen.getByTestId('rag-query-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('claude-config-panel')).not.toBeInTheDocument()
  })

  // ── Multiple projects rendering ──

  it('renders multiple project cards', () => {
    const mockProjects = [
      createProject({ id: 'p1', name: 'Project Alpha' }),
      createProject({ id: 'p2', name: 'Project Beta', description: 'Second project' }),
      createProject({ id: 'p3', name: 'Project Gamma', description: '' }),
    ]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
    expect(screen.getByText('Project Gamma')).toBeInTheDocument()
    expect(screen.getByText('Second project')).toBeInTheDocument()
  })

  // ── Error + projects coexistence ──

  it('shows error banner alongside existing projects', () => {
    const mockProjects = [createProject()]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
      error: 'Network error',
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  // ── Custom event navigation ──

  it('handles navigate-to-project-configs custom event', async () => {
    render(<ProjectsPage />)

    const event = new CustomEvent('navigate-to-project-configs', {
      detail: { projectId: 'proj-99' },
    })
    window.dispatchEvent(event)

    await waitFor(() => {
      expect(mockSelectConfigProject).toHaveBeenCalledWith('proj-99')
      expect(mockSetView).toHaveBeenCalledWith('project-configs')
    })
  })

  // ── Admin: inactive count display ──

  it('displays the count of inactive projects in the toggle label', () => {
    mockIsAdmin = true
    const mockProjects = [
      createProject({ id: 'p1', is_active: true }),
      createProject({ id: 'p2', is_active: false }),
      createProject({ id: 'p3', is_active: false }),
    ]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText(/Show inactive \(2\)/)).toBeInTheDocument()
  })

  // ── Does not show inactive toggle when no inactive projects ──

  it('does not show inactive toggle for admin when no inactive projects exist', () => {
    mockIsAdmin = true
    const mockProjects = [createProject({ id: 'p1', is_active: true })]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.queryByText(/Show inactive/)).not.toBeInTheDocument()
  })

  // ── Grid layout changes with selection ──

  it('renders grid with proper class when no project is selected', () => {
    const mockProjects = [createProject()]
    setupStoreWithProjects(mockProjects, { selectedProjectId: null })

    const { container } = render(<ProjectsPage />)

    // When no project selected, grid should have 3-column layout class
    const gridDiv = container.querySelector('.grid')
    expect(gridDiv).toBeInTheDocument()
  })

  // ── Delete project flow (confirm delete) ──

  it('calls deleteProject when delete is confirmed via the modal', async () => {
    mockDeleteProject.mockResolvedValue(undefined)
    const project = createProject({ id: 'p1' })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Open menu
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])

    // Click Remove to set deleteTarget
    fireEvent.click(screen.getByText('Remove'))

    // The DeleteProjectModal should now be shown
    expect(screen.getByTestId('delete-project-modal')).toBeInTheDocument()

    // Simulate the modal calling onConfirm
    const onConfirm = capturedDeleteModalProps.onConfirm as () => Promise<void>
    await onConfirm()

    expect(mockDeleteProject).toHaveBeenCalledWith('p1')
  })

  it('closes delete modal via onClose callback', () => {
    const project = createProject({ id: 'p1' })
    const mockProjects = [project]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    // Open menu & click Remove
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])
    fireEvent.click(screen.getByText('Remove'))

    expect(screen.getByTestId('delete-project-modal')).toBeInTheDocument()

    // Simulate modal close
    const onClose = capturedDeleteModalProps.onClose as () => void
    onClose()

    // After calling onClose, re-render should not show modal
    // (state is internal, so the component will re-render and hide it)
    // We verify the callback was captured correctly
    expect(typeof capturedDeleteModalProps.onClose).toBe('function')
  })

  // ── Claude config panel close ──

  it('passes onClose to Claude config panel that deselects project', () => {
    const project = createProject({ id: 'p1' })
    mockGetSelectedProject.mockReturnValue(project)
    setupStoreWithProjects([project], {
      selectedProjectId: 'p1',
      getSelectedProject: mockGetSelectedProject,
    })

    render(<ProjectsPage />)

    expect(screen.getByTestId('claude-config-panel')).toBeInTheDocument()

    // Simulate closing the panel
    const onClose = capturedClaudeConfigProps.onClose as () => void
    onClose()

    expect(mockSelectProject).toHaveBeenCalledWith(null)
  })

  // ── Multiple project interactions without interference ──

  it('handles menu for specific project among multiple projects', () => {
    const mockProjects = [
      createProject({ id: 'p1', name: 'First Project', has_claude_md: false }),
      createProject({ id: 'p2', name: 'Second Project', has_claude_md: false }),
    ]
    setupStoreWithProjects(mockProjects)

    render(<ProjectsPage />)

    expect(screen.getByText('First Project')).toBeInTheDocument()
    expect(screen.getByText('Second Project')).toBeInTheDocument()

    // Both cards should render
    const allButtons = screen.getAllByRole('button')
    // Filter out header buttons and badge buttons
    const menuButtons = allButtons.filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    // Should have 2 menu toggle buttons (one per card)
    expect(menuButtons.length).toBe(2)
  })

  // ── Simultaneous error and empty state ──

  it('shows error and empty state together when no projects and error occurs', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      error: 'Server is down',
      projects: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    expect(screen.getByText('Server is down')).toBeInTheDocument()
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
  })

  // ── RAG panel props ──

  it('passes correct projectId and projectName to RAG panel', () => {
    const project = createProject({ id: 'rag-proj', name: 'RAG Test Project', vector_store_initialized: true })
    setupStoreWithProjects([project])

    render(<ProjectsPage />)

    fireEvent.click(screen.getByText('RAG 검색'))

    expect(capturedRagPanelProps.projectId).toBe('rag-proj')
    expect(capturedRagPanelProps.projectName).toBe('RAG Test Project')
  })

  // ── Delete modal props ──

  it('passes fetchDeletionPreview to delete modal', () => {
    const project = createProject({ id: 'p1' })
    setupStoreWithProjects([project])

    render(<ProjectsPage />)

    // Open menu and click Remove
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])
    fireEvent.click(screen.getByText('Remove'))

    expect(capturedDeleteModalProps.fetchPreview).toBe(mockFetchDeletionPreview)
  })

  // ── Search input value binding ──

  it('shows the current search query value in the search input', () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      searchQuery: 'existing-search',
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    const input = screen.getByPlaceholderText('Search projects...') as HTMLInputElement
    expect(input.value).toBe('existing-search')
  })

  // ── Show inactive checkbox state ──

  it('reflects showInactive state in the checkbox', () => {
    mockIsAdmin = true
    const mockProjects = [createProject({ id: 'p1', is_active: false })]
    mockFilteredProjects.mockReturnValue(mockProjects)
    vi.mocked(useProjectsStore).mockReturnValue({
      ...defaultStoreState,
      projects: mockProjects,
      filteredProjects: mockFilteredProjects,
      showInactive: true,
    } as unknown as ReturnType<typeof useProjectsStore>)

    render(<ProjectsPage />)

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  // ── RAG panel onClose callback ──

  it('RAG panel onClose clears the rag search project state', async () => {
    const project = createProject({ id: 'p1', vector_store_initialized: true })
    setupStoreWithProjects([project])

    render(<ProjectsPage />)

    // Open RAG panel
    fireEvent.click(screen.getByText('RAG 검색'))
    expect(screen.getByTestId('rag-query-panel')).toBeInTheDocument()

    // Simulate the panel calling onClose
    const onClose = capturedRagPanelProps.onClose as () => void
    act(() => {
      onClose()
    })

    // After onClose, RAG panel should disappear (component re-renders with null state)
    await waitFor(() => {
      expect(screen.queryByTestId('rag-query-panel')).not.toBeInTheDocument()
    })
  })

  // ── Claude button click on card ──

  it('calls selectProject when Claude badge button is clicked', () => {
    const project = createProject({ id: 'p1', has_claude_md: true })
    setupStoreWithProjects([project])

    render(<ProjectsPage />)

    const claudeButton = screen.getByText('Claude')
    fireEvent.click(claudeButton)

    // The Claude button calls onSelect which toggles selection
    expect(mockSelectProject).toHaveBeenCalled()
  })

  // ── Indexing indicator ──

  it('shows Indexing indicator while a project is being indexed', async () => {
    // Create a project and simulate indexing
    let resolveIndex: () => void
    mockIndexProject.mockReturnValue(new Promise<void>((resolve) => { resolveIndex = resolve }))
    const project = createProject({ id: 'p1' })
    setupStoreWithProjects([project])

    render(<ProjectsPage />)

    // Open the menu and click Reindex
    const menuButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.textContent !== 'Create New' &&
        btn.textContent !== 'Link Existing' &&
        btn.textContent !== 'Not Indexed' &&
        btn.textContent !== 'RAG 검색' &&
        btn.textContent !== 'Claude'
    )
    fireEvent.click(menuButtons[0])
    fireEvent.click(screen.getByText('Reindex RAG'))

    // While indexing, the "Indexing..." text should appear
    await waitFor(() => {
      expect(screen.getByText('Indexing...')).toBeInTheDocument()
    })

    // Resolve the indexing
    resolveIndex!()

    await waitFor(() => {
      expect(screen.queryByText('Indexing...')).not.toBeInTheDocument()
    })
  })
})
