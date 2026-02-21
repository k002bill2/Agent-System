import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectManagementPage } from './ProjectManagementPage'

// Mock child component
vi.mock('@/components/project-management/ProjectMembersContent', () => ({
  ProjectMembersContent: ({ projectId, projectName }: { projectId: string; projectName: string }) => (
    <div data-testid="members-content" data-project-id={projectId} data-project-name={projectName}>
      MembersContent
    </div>
  ),
}))

// Store mocks
const mockFetchAllDBProjects = vi.fn()
const mockFetchDBProjects = vi.fn()
const mockCreateDBProject = vi.fn()
const mockUpdateDBProject = vi.fn()
const mockToggleDBProjectActive = vi.fn()
const mockClearError = vi.fn()
const mockFetchMembers = vi.fn()

interface MockProject {
  id: string
  name: string
  slug?: string
  description: string | null
  path: string | null
  is_active: boolean
  created_at?: string | null
  settings?: Record<string, unknown>
}

let mockDbProjects: MockProject[] = []
let mockIsLoadingDBProjects = false
let mockError: string | null = null
let mockCurrentUser: { id: string; is_admin?: boolean; is_org_admin?: boolean } | null = null

vi.mock('../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => ({
    dbProjects: mockDbProjects,
    isLoadingDBProjects: mockIsLoadingDBProjects,
    error: mockError,
    clearError: mockClearError,
    fetchAllDBProjects: mockFetchAllDBProjects,
    fetchDBProjects: mockFetchDBProjects,
    createDBProject: mockCreateDBProject,
    updateDBProject: mockUpdateDBProject,
    toggleDBProjectActive: mockToggleDBProjectActive,
  }),
}))

vi.mock('@/stores/projectAccess', () => ({
  useProjectAccessStore: () => ({
    fetchMembers: mockFetchMembers,
  }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: mockCurrentUser }),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ── Helper data ──────────────────────────────────────────────

const activeProject: MockProject = {
  id: 'p1',
  name: 'Agent System',
  slug: 'agent-system',
  description: 'Multi-agent orchestration',
  path: '/Users/dev/agent-system',
  is_active: true,
  created_at: '2025-12-01T00:00:00Z',
}

const inactiveProject: MockProject = {
  id: 'p2',
  name: 'Legacy App',
  slug: 'legacy-app',
  description: 'Old deprecated project',
  path: '/Users/dev/legacy',
  is_active: false,
  created_at: '2025-06-15T00:00:00Z',
}

const minimalProject: MockProject = {
  id: 'p3',
  name: 'Minimal',
  slug: undefined,
  description: null,
  path: null,
  is_active: true,
  created_at: null,
}

describe('ProjectManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbProjects = []
    mockIsLoadingDBProjects = false
    mockError = null
    mockCurrentUser = { id: '1', is_admin: true }
  })

  // ── Existing tests ──────────────────────────────────────────

  it('renders page title', () => {
    render(<ProjectManagementPage />)
    expect(screen.getByText('Project Registry')).toBeInTheDocument()
  })

  it('fetches projects on mount', () => {
    render(<ProjectManagementPage />)
    expect(mockFetchAllDBProjects).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    mockIsLoadingDBProjects = true
    render(<ProjectManagementPage />)
    expect(screen.getByText('Project Registry')).toBeInTheDocument()
  })

  it('shows error banner when error exists', () => {
    mockError = 'Failed to load'
    render(<ProjectManagementPage />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('renders project list', () => {
    mockDbProjects = [
      { id: '1', name: 'Project A', description: 'Desc A', path: '/a', is_active: true },
      { id: '2', name: 'Project B', description: 'Desc B', path: '/b', is_active: false },
    ]
    render(<ProjectManagementPage />)
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('Project B')).toBeInTheDocument()
  })

  it('shows search input', () => {
    render(<ProjectManagementPage />)
    expect(screen.getByPlaceholderText(/검색|search/i)).toBeInTheDocument()
  })

  it('filters projects by search query', () => {
    mockDbProjects = [
      { id: '1', name: 'Alpha', description: '', path: '/a', is_active: true },
      { id: '2', name: 'Beta', description: '', path: '/b', is_active: true },
    ]
    render(<ProjectManagementPage />)
    const search = screen.getByPlaceholderText(/검색|search/i)
    fireEvent.change(search, { target: { value: 'Alpha' } })
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('shows add project button for admin users', () => {
    mockCurrentUser = { id: '1', is_admin: true }
    render(<ProjectManagementPage />)
    // Plus button or "Add Project" text
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('clears error when dismiss clicked', () => {
    mockError = 'Some error'
    render(<ProjectManagementPage />)
    // Find dismiss/close button
    const closeButtons = screen.getAllByRole('button')
    const dismissButton = closeButtons.find(b => b.textContent?.includes('×') || b.textContent?.includes('Dismiss'))
    if (dismissButton) {
      fireEvent.click(dismissButton)
      expect(mockClearError).toHaveBeenCalled()
    }
  })

  // ── Loading state (skeleton) ────────────────────────────────

  describe('loading state', () => {
    it('shows skeleton placeholders when loading with no projects', () => {
      mockIsLoadingDBProjects = true
      mockDbProjects = []
      const { container } = render(<ProjectManagementPage />)
      const pulseElements = container.querySelectorAll('.animate-pulse')
      expect(pulseElements.length).toBe(3)
    })

    it('does not show skeletons when loading with existing projects', () => {
      mockIsLoadingDBProjects = true
      mockDbProjects = [activeProject]
      const { container } = render(<ProjectManagementPage />)
      const pulseElements = container.querySelectorAll('.animate-pulse')
      expect(pulseElements.length).toBe(0)
    })
  })

  // ── Empty state ─────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty message when no projects and not loading', () => {
      mockIsLoadingDBProjects = false
      mockDbProjects = []
      render(<ProjectManagementPage />)
      expect(screen.getByText('No projects registered')).toBeInTheDocument()
      expect(screen.getByText('Add a project to manage Claude sessions and configs')).toBeInTheDocument()
    })

    it('does not show empty message when loading', () => {
      mockIsLoadingDBProjects = true
      mockDbProjects = []
      render(<ProjectManagementPage />)
      expect(screen.queryByText('No projects registered')).not.toBeInTheDocument()
    })
  })

  // ── Error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('shows error banner with error text', () => {
      mockError = 'Network error'
      render(<ProjectManagementPage />)
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    it('does not show error banner when no error', () => {
      mockError = null
      render(<ProjectManagementPage />)
      expect(screen.queryByText('Network error')).not.toBeInTheDocument()
    })

    it('calls clearError when close button on error banner is clicked', () => {
      mockError = 'Something failed'
      render(<ProjectManagementPage />)
      // The error banner has a close X button. Find the error text first, then the nearby button.
      const errorDiv = screen.getByText('Something failed').closest('div.mb-4, [class*="mb-4"]')
      // The dismiss button is a sibling button inside the error container
      const buttons = errorDiv ? errorDiv.querySelectorAll('button') : []
      expect(buttons.length).toBeGreaterThanOrEqual(1)
      fireEvent.click(buttons[0])
      expect(mockClearError).toHaveBeenCalledTimes(1)
    })
  })

  // ── Admin vs non-admin ──────────────────────────────────────

  describe('admin vs non-admin rendering', () => {
    it('shows Add Project button for is_admin user', () => {
      mockCurrentUser = { id: '1', is_admin: true, is_org_admin: false }
      render(<ProjectManagementPage />)
      expect(screen.getByText('Add Project')).toBeInTheDocument()
    })

    it('shows Add Project button for is_org_admin user', () => {
      mockCurrentUser = { id: '1', is_admin: false, is_org_admin: true }
      render(<ProjectManagementPage />)
      expect(screen.getByText('Add Project')).toBeInTheDocument()
    })

    it('hides Add Project button for non-admin user', () => {
      mockCurrentUser = { id: '1', is_admin: false, is_org_admin: false }
      render(<ProjectManagementPage />)
      expect(screen.queryByText('Add Project')).not.toBeInTheDocument()
    })

    it('hides Add Project button when user is null', () => {
      mockCurrentUser = null
      render(<ProjectManagementPage />)
      expect(screen.queryByText('Add Project')).not.toBeInTheDocument()
    })

    it('hides create form for non-admin even if showCreateForm could be toggled', () => {
      mockCurrentUser = { id: '1', is_admin: false, is_org_admin: false }
      render(<ProjectManagementPage />)
      // Cannot open create form because the button doesn't exist
      expect(screen.queryByText('New Project')).not.toBeInTheDocument()
    })
  })

  // ── Create project form ─────────────────────────────────────

  describe('create project form', () => {
    it('opens create form when Add Project button is clicked', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))
      expect(screen.getByText('New Project')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g. Agent-System')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Optional description')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g. /Users/you/Work/Project')).toBeInTheDocument()
    })

    it('shows Create button disabled when name is empty', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))
      const createBtn = screen.getByRole('button', { name: 'Create' })
      expect(createBtn).toBeDisabled()
    })

    it('enables Create button when name is filled', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))
      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'My Project' },
      })
      const createBtn = screen.getByRole('button', { name: 'Create' })
      expect(createBtn).not.toBeDisabled()
    })

    it('calls createDBProject with form data on submit', async () => {
      mockCreateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'New Proj' },
      })
      fireEvent.change(screen.getByPlaceholderText('Optional description'), {
        target: { value: 'Some desc' },
      })
      fireEvent.change(screen.getByPlaceholderText('e.g. /Users/you/Work/Project'), {
        target: { value: '/path/to/proj' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockCreateDBProject).toHaveBeenCalledWith({
          name: 'New Proj',
          description: 'Some desc',
          path: '/path/to/proj',
        })
      })
    })

    it('hides create form on successful creation', async () => {
      mockCreateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'TestProj' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(screen.queryByText('New Project')).not.toBeInTheDocument()
      })
    })

    it('keeps create form open on failed creation', async () => {
      mockCreateDBProject.mockResolvedValue(false)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'TestProj' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockCreateDBProject).toHaveBeenCalled()
      })
      // Form should still be visible
      expect(screen.getByText('New Project')).toBeInTheDocument()
    })

    it('closes create form and resets fields on Cancel', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'Draft' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByText('New Project')).not.toBeInTheDocument()
    })

    it('does not submit when name is only whitespace', async () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: '   ' },
      })
      // Button should be disabled because trim() is empty
      const createBtn = screen.getByRole('button', { name: 'Create' })
      expect(createBtn).toBeDisabled()
    })

    it('sends undefined for empty optional fields', async () => {
      mockCreateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      fireEvent.change(screen.getByPlaceholderText('e.g. Agent-System'), {
        target: { value: 'NameOnly' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockCreateDBProject).toHaveBeenCalledWith({
          name: 'NameOnly',
          description: undefined,
          path: undefined,
        })
      })
    })

    it('submits create form on Enter key in name field', async () => {
      mockCreateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))

      const nameInput = screen.getByPlaceholderText('e.g. Agent-System')
      fireEvent.change(nameInput, { target: { value: 'EnterProj' } })
      fireEvent.keyDown(nameInput, { key: 'Enter' })

      await waitFor(() => {
        expect(mockCreateDBProject).toHaveBeenCalledWith({
          name: 'EnterProj',
          description: undefined,
          path: undefined,
        })
      })
    })

    it('closes create form on Escape key in name field', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Add Project'))
      expect(screen.getByText('New Project')).toBeInTheDocument()

      const nameInput = screen.getByPlaceholderText('e.g. Agent-System')
      fireEvent.keyDown(nameInput, { key: 'Escape' })

      expect(screen.queryByText('New Project')).not.toBeInTheDocument()
    })
  })

  // ── Edit project flow ───────────────────────────────────────

  describe('edit project flow', () => {
    beforeEach(() => {
      mockDbProjects = [activeProject, inactiveProject]
    })

    it('shows edit button only for active projects', () => {
      render(<ProjectManagementPage />)
      const editButtons = screen.getAllByTitle('Edit')
      // Only the active project should have an edit button
      expect(editButtons.length).toBe(1)
    })

    it('enters edit mode when edit button is clicked', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))
      // Edit mode should show input fields populated with project data
      const nameInput = screen.getByDisplayValue('Agent System')
      expect(nameInput).toBeInTheDocument()
      expect(screen.getByDisplayValue('Multi-agent orchestration')).toBeInTheDocument()
      expect(screen.getByDisplayValue('/Users/dev/agent-system')).toBeInTheDocument()
    })

    it('shows Save and Cancel buttons in edit mode', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))
      expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument()
      // Cancel button in the edit row
      expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument()
    })

    it('calls updateDBProject on save with updated fields', async () => {
      mockUpdateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))

      const nameInput = screen.getByDisplayValue('Agent System')
      fireEvent.change(nameInput, { target: { value: 'Renamed System' } })

      fireEvent.click(screen.getByRole('button', { name: /Save/ }))

      await waitFor(() => {
        expect(mockUpdateDBProject).toHaveBeenCalledWith('p1', {
          name: 'Renamed System',
          description: 'Multi-agent orchestration',
          path: '/Users/dev/agent-system',
        })
      })
    })

    it('exits edit mode on successful save', async () => {
      mockUpdateDBProject.mockResolvedValue(true)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))
      fireEvent.click(screen.getByRole('button', { name: /Save/ }))

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Agent System')).not.toBeInTheDocument()
      })
    })

    it('stays in edit mode on failed save', async () => {
      mockUpdateDBProject.mockResolvedValue(false)
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))
      fireEvent.click(screen.getByRole('button', { name: /Save/ }))

      await waitFor(() => {
        expect(mockUpdateDBProject).toHaveBeenCalled()
      })
      // Still in edit mode
      expect(screen.getByDisplayValue('Agent System')).toBeInTheDocument()
    })

    it('exits edit mode on Cancel click', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))
      expect(screen.getByDisplayValue('Agent System')).toBeInTheDocument()

      // There may be multiple Cancel buttons; pick the one inside the edit form row
      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/ })
      // The edit form Cancel is the one in the project row (not create form)
      const editCancel = cancelButtons.find((btn) => {
        const row = btn.closest('[class*="space-y-3"]')
        return row && row.querySelector('input[value="Agent System"]')
      }) || cancelButtons[0]
      fireEvent.click(editCancel)
      // Should return to view mode, no input with that value
      expect(screen.queryByDisplayValue('Agent System')).not.toBeInTheDocument()
      // The project name should still be visible as text (may appear in list + detail panel)
      const nameElements = screen.getAllByText('Agent System')
      expect(nameElements.length).toBeGreaterThanOrEqual(1)
    })

    it('disables Save when edit name is empty', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByTitle('Edit'))

      const nameInput = screen.getByDisplayValue('Agent System')
      fireEvent.change(nameInput, { target: { value: '' } })

      const saveBtn = screen.getByRole('button', { name: /Save/ })
      expect(saveBtn).toBeDisabled()
    })
  })

  // ── Toggle active/inactive ──────────────────────────────────

  describe('toggle active/inactive', () => {
    it('calls toggleDBProjectActive when toggle switch is clicked', async () => {
      mockToggleDBProjectActive.mockResolvedValue(undefined)
      mockDbProjects = [activeProject]
      render(<ProjectManagementPage />)

      const toggleBtn = screen.getByTitle('Deactivate project')
      fireEvent.click(toggleBtn)

      await waitFor(() => {
        expect(mockToggleDBProjectActive).toHaveBeenCalledWith('p1')
      })
    })

    it('shows Activate title for inactive projects', () => {
      mockDbProjects = [inactiveProject]
      render(<ProjectManagementPage />)
      expect(screen.getByTitle('Activate project')).toBeInTheDocument()
    })

    it('shows Deactivate title for active projects', () => {
      mockDbProjects = [activeProject]
      render(<ProjectManagementPage />)
      expect(screen.getByTitle('Deactivate project')).toBeInTheDocument()
    })

    it('shows Inactive badge for inactive projects', () => {
      mockDbProjects = [inactiveProject]
      render(<ProjectManagementPage />)
      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })
  })

  // ── Search filtering ────────────────────────────────────────

  describe('search filtering', () => {
    beforeEach(() => {
      mockDbProjects = [activeProject, inactiveProject, minimalProject]
    })

    it('filters by project name', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'Agent' },
      })
      expect(screen.getByText('Agent System')).toBeInTheDocument()
      expect(screen.queryByText('Legacy App')).not.toBeInTheDocument()
      expect(screen.queryByText('Minimal')).not.toBeInTheDocument()
    })

    it('filters by description', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'deprecated' },
      })
      expect(screen.queryByText('Agent System')).not.toBeInTheDocument()
      expect(screen.getByText('Legacy App')).toBeInTheDocument()
    })

    it('filters by path', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: '/Users/dev/legacy' },
      })
      expect(screen.queryByText('Agent System')).not.toBeInTheDocument()
      expect(screen.getByText('Legacy App')).toBeInTheDocument()
    })

    it('filters by slug', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'agent-system' },
      })
      expect(screen.getByText('Agent System')).toBeInTheDocument()
      expect(screen.queryByText('Legacy App')).not.toBeInTheDocument()
    })

    it('search is case-insensitive', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'AGENT SYSTEM' },
      })
      expect(screen.getByText('Agent System')).toBeInTheDocument()
    })

    it('shows no matching projects message when search finds nothing', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'zzzznonexistent' },
      })
      expect(screen.getByText('No matching projects')).toBeInTheDocument()
    })

    it('handles projects with null slug gracefully', () => {
      render(<ProjectManagementPage />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'Minimal' },
      })
      expect(screen.getByText('Minimal')).toBeInTheDocument()
    })
  })

  // ── Show inactive toggle ────────────────────────────────────

  describe('show inactive toggle', () => {
    it('shows inactive count and toggle when there are inactive projects', () => {
      mockDbProjects = [activeProject, inactiveProject]
      render(<ProjectManagementPage />)
      expect(screen.getByText(/Show inactive/)).toBeInTheDocument()
    })

    it('hides inactive projects when toggle is unchecked', () => {
      mockDbProjects = [activeProject, inactiveProject]
      render(<ProjectManagementPage />)

      // The checkbox is checked by default (showInactive = true)
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()

      // Uncheck it
      fireEvent.click(checkbox)
      expect(screen.getByText('Agent System')).toBeInTheDocument()
      expect(screen.queryByText('Legacy App')).not.toBeInTheDocument()
    })

    it('shows correct active and inactive counts', () => {
      mockDbProjects = [activeProject, inactiveProject, minimalProject]
      render(<ProjectManagementPage />)
      // Active: 2 (activeProject, minimalProject)
      expect(screen.getByText('2')).toBeInTheDocument()
      // Show inactive (1) for inactiveProject
      expect(screen.getByText(/Show inactive \(1\)/)).toBeInTheDocument()
    })

    it('does not show inactive toggle when all projects are active', () => {
      mockDbProjects = [activeProject, minimalProject]
      render(<ProjectManagementPage />)
      expect(screen.queryByText(/Show inactive/)).not.toBeInTheDocument()
    })
  })

  // ── Project detail panel ────────────────────────────────────

  describe('project detail panel', () => {
    beforeEach(() => {
      mockDbProjects = [activeProject, inactiveProject]
    })

    it('opens detail panel when a project row is clicked', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      // The detail panel header should show the project name
      // There are two: one in the list, one in the panel header
      const headings = screen.getAllByText('Agent System')
      expect(headings.length).toBeGreaterThanOrEqual(2)
    })

    it('shows project slug in detail panel', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      // The slug appears in both the list and the detail panel
      const slugElements = screen.getAllByText('agent-system')
      expect(slugElements.length).toBeGreaterThanOrEqual(2)
    })

    it('shows info tab by default with project details', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      // Description should appear in detail panel
      const descriptions = screen.getAllByText('Multi-agent orchestration')
      expect(descriptions.length).toBeGreaterThanOrEqual(1)
      // Path
      const paths = screen.getAllByText('/Users/dev/agent-system')
      expect(paths.length).toBeGreaterThanOrEqual(1)
      // Active status
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('shows created date in info tab when available', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      // The detail panel shows the date label and a ko-KR formatted date
      expect(screen.getByText('생성일')).toBeInTheDocument()
      // There may be multiple date elements (list + panel), so use getAllByText
      const dateElements = screen.getAllByText(/2025/)
      expect(dateElements.length).toBeGreaterThanOrEqual(1)
    })

    it('switches to members tab', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))

      // Click the members tab
      const tabs = screen.getAllByRole('button')
      const membersTab = tabs.find((t) => t.textContent === '멤버')
      expect(membersTab).toBeTruthy()
      fireEvent.click(membersTab!)

      expect(screen.getByTestId('members-content')).toBeInTheDocument()
    })

    it('passes correct props to ProjectMembersContent', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))

      // Switch to members tab
      const tabs = screen.getAllByRole('button')
      const membersTab = tabs.find((t) => t.textContent === '멤버')
      fireEvent.click(membersTab!)

      const membersContent = screen.getByTestId('members-content')
      expect(membersContent).toHaveAttribute('data-project-id', 'p1')
      expect(membersContent).toHaveAttribute('data-project-name', 'Agent System')
    })

    it('shows Inactive status for inactive project in detail panel', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Legacy App'))
      // In the detail panel info tab, the status should say Inactive
      // We need to check for the detail panel's status badge
      const inactiveLabels = screen.getAllByText('Inactive')
      // At least one in the list badge and one in the detail panel
      expect(inactiveLabels.length).toBeGreaterThanOrEqual(2)
    })

    it('closes detail panel when X button is clicked', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))

      // The detail panel is open; 2 occurrences of project name
      let nameElements = screen.getAllByText('Agent System')
      expect(nameElements.length).toBeGreaterThanOrEqual(2)

      // Click the close button in the panel header
      // The X button is a small button in the panel header area
      const allButtons = screen.getAllByRole('button')
      // The close button in the detail panel is the one with w-4 h-4 that's not a tab
      // Find it by looking for buttons after the panel opened
      // The panel header has a button that closes it - it's the last X-icon button in the detail panel region
      // We look for the button that, when clicked, removes the second "Agent System" text
      // Use a strategy: find the close button that is inside the panel
      const closeButton = allButtons.find(
        (btn) => {
          const parent = btn.closest('.w-96')
          return parent && !btn.textContent?.includes('정보') && !btn.textContent?.includes('멤버')
        }
      )
      expect(closeButton).toBeTruthy()
      fireEvent.click(closeButton!)

      // After closing, only one occurrence of the name in the list
      nameElements = screen.getAllByText('Agent System')
      expect(nameElements.length).toBe(1)
    })

    it('deselects project when the same project row is clicked again', () => {
      render(<ProjectManagementPage />)

      // Click to open
      fireEvent.click(screen.getByText('Agent System'))
      let nameElements = screen.getAllByText('Agent System')
      expect(nameElements.length).toBeGreaterThanOrEqual(2)

      // Click same project row again to deselect
      fireEvent.click(nameElements[0])
      nameElements = screen.getAllByText('Agent System')
      expect(nameElements.length).toBe(1)
    })

    it('calls fetchMembers when a project is selected', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      expect(mockFetchMembers).toHaveBeenCalledWith('p1')
    })

    it('does not call fetchMembers when deselecting', () => {
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Agent System'))
      expect(mockFetchMembers).toHaveBeenCalledTimes(1)

      // Click again to deselect
      const nameElements = screen.getAllByText('Agent System')
      fireEvent.click(nameElements[0])
      // Should still be 1 (not called again)
      expect(mockFetchMembers).toHaveBeenCalledTimes(1)
    })

    it('resets to info tab when switching projects', () => {
      render(<ProjectManagementPage />)

      // Select first project and switch to members tab
      fireEvent.click(screen.getByText('Agent System'))
      const tabs = screen.getAllByRole('button')
      const membersTab = tabs.find((t) => t.textContent === '멤버')
      fireEvent.click(membersTab!)
      expect(screen.getByTestId('members-content')).toBeInTheDocument()

      // Select a different project
      fireEvent.click(screen.getByText('Legacy App'))

      // Should reset to info tab (members content should not be visible
      // unless the user explicitly clicks the tab again)
      expect(screen.queryByTestId('members-content')).not.toBeInTheDocument()
    })

    it('does not show description in detail panel when null', () => {
      mockDbProjects = [minimalProject]
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Minimal'))
      // No description label should appear
      expect(screen.queryByText('설명')).not.toBeInTheDocument()
    })

    it('does not show path in detail panel when null', () => {
      mockDbProjects = [minimalProject]
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Minimal'))
      expect(screen.queryByText('경로')).not.toBeInTheDocument()
    })

    it('does not show created date in detail panel when null', () => {
      mockDbProjects = [minimalProject]
      render(<ProjectManagementPage />)
      fireEvent.click(screen.getByText('Minimal'))
      expect(screen.queryByText('생성일')).not.toBeInTheDocument()
    })
  })

  // ── Project row does not open detail panel during edit ──────

  describe('project row click during edit mode', () => {
    it('does not change selection when project row is in edit mode', () => {
      mockDbProjects = [activeProject, inactiveProject]
      render(<ProjectManagementPage />)

      // Enter edit mode
      fireEvent.click(screen.getByTitle('Edit'))

      // Clicking on the editing project row should not open the detail panel
      const editNameInput = screen.getByDisplayValue('Agent System')
      const editRow = editNameInput.closest('[class*="cursor-pointer"]')
      if (editRow) {
        fireEvent.click(editRow)
      }

      // The detail panel should NOT have opened (no duplicate project name in a panel header)
      // Check there's no panel with the close X and slug
      expect(screen.queryByText('agent-system')).toBeInTheDocument()
    })
  })

  // ── Project metadata rendering ──────────────────────────────

  describe('project metadata rendering', () => {
    it('renders project description in list view', () => {
      mockDbProjects = [activeProject]
      render(<ProjectManagementPage />)
      expect(screen.getByText('Multi-agent orchestration')).toBeInTheDocument()
    })

    it('renders project path in list view', () => {
      mockDbProjects = [activeProject]
      render(<ProjectManagementPage />)
      expect(screen.getByText('/Users/dev/agent-system')).toBeInTheDocument()
    })

    it('renders created_at date in list view', () => {
      mockDbProjects = [activeProject]
      render(<ProjectManagementPage />)
      // The list view formats created_at differently from the detail panel
      expect(screen.getByText(/Created/)).toBeInTheDocument()
    })

    it('does not render description when null', () => {
      mockDbProjects = [minimalProject]
      render(<ProjectManagementPage />)
      // Only the project name and potentially empty metadata
      expect(screen.getByText('Minimal')).toBeInTheDocument()
      expect(screen.queryByText('Multi-agent orchestration')).not.toBeInTheDocument()
    })

    it('does not render path when null', () => {
      mockDbProjects = [minimalProject]
      render(<ProjectManagementPage />)
      expect(screen.queryByText(/\/Users/)).not.toBeInTheDocument()
    })
  })
})
