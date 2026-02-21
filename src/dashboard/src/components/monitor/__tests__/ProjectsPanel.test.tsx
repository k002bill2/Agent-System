import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectsPanel } from '../ProjectsPanel'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Check: (props: Record<string, unknown>) => <svg data-testid="icon-check" {...props} />,
  Filter: (props: Record<string, unknown>) => <svg data-testid="icon-filter" {...props} />,
  Settings2: (props: Record<string, unknown>) => <svg data-testid="icon-settings" {...props} />,
}))

// Store mocks
const mockSelectProject = vi.fn()
const mockSetView = vi.fn()

let mockProjects: Array<{ id: string; name: string; path: string; description: string; has_claude_md: boolean; is_active?: boolean }> = []
let mockSelectedProjectId: string | null = null
let mockIsAdmin = false

vi.mock('../../../stores/orchestration', () => ({
  useOrchestrationStore: () => ({
    projects: mockProjects,
    selectedProjectId: mockSelectedProjectId,
    selectProject: mockSelectProject,
  }),
}))

vi.mock('../../../stores/navigation', () => ({
  useNavigationStore: () => ({
    setView: mockSetView,
  }),
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: (selector: (state: { user: { is_admin: boolean } | null }) => unknown) =>
    selector({ user: { is_admin: mockIsAdmin } }),
}))

describe('ProjectsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjects = [
      { id: 'p1', name: 'Project A', path: '/a', description: 'Desc A', has_claude_md: true, is_active: true },
      { id: 'p2', name: 'Project B', path: '/b', description: '', has_claude_md: false, is_active: true },
    ]
    mockSelectedProjectId = null
    mockIsAdmin = false
  })

  it('renders "Projects" heading', () => {
    render(<ProjectsPanel />)
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('renders project list', () => {
    render(<ProjectsPanel />)
    expect(screen.getByText('Project A')).toBeInTheDocument()
    expect(screen.getByText('Project B')).toBeInTheDocument()
  })

  it('shows project description when present', () => {
    render(<ProjectsPanel />)
    expect(screen.getByText('Desc A')).toBeInTheDocument()
  })

  it('shows empty state when no projects', () => {
    mockProjects = []
    render(<ProjectsPanel />)
    expect(screen.getByText('No projects found')).toBeInTheDocument()
  })

  it('calls selectProject when a project is clicked', () => {
    render(<ProjectsPanel />)
    fireEvent.click(screen.getByText('Project A'))
    expect(mockSelectProject).toHaveBeenCalledWith('p1')
  })

  it('deselects project when clicking the already-selected one', () => {
    mockSelectedProjectId = 'p1'
    render(<ProjectsPanel />)
    fireEvent.click(screen.getByText('Project A'))
    expect(mockSelectProject).toHaveBeenCalledWith(null)
  })

  it('navigates to projects view when Manage Projects is clicked', () => {
    render(<ProjectsPanel />)
    fireEvent.click(screen.getByText('Manage Projects'))
    expect(mockSetView).toHaveBeenCalledWith('projects')
  })

  it('renders Filter button', () => {
    render(<ProjectsPanel />)
    expect(screen.getByText('Filter')).toBeInTheDocument()
  })

  it('hides inactive projects for non-admin users', () => {
    mockIsAdmin = false
    mockProjects = [
      { id: 'p1', name: 'Active', path: '/a', description: '', has_claude_md: true, is_active: true },
      { id: 'p2', name: 'Inactive', path: '/b', description: '', has_claude_md: false, is_active: false },
    ]
    render(<ProjectsPanel />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })

  it('shows all projects for admin users', () => {
    mockIsAdmin = true
    mockProjects = [
      { id: 'p1', name: 'Active', path: '/a', description: '', has_claude_md: true, is_active: true },
      { id: 'p2', name: 'Inactive', path: '/b', description: '', has_claude_md: false, is_active: false },
    ]
    render(<ProjectsPanel />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })
})
