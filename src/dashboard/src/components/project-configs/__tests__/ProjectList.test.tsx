import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectList } from '../ProjectList'

const mockSelectProject = vi.fn()
const mockCreateDBProject = vi.fn()
const mockDeleteDBProject = vi.fn()
const mockFetchDBProjects = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
  // Need to export ProjectInfo type mock
}))

const mockProjects = [
  {
    project_id: 'proj-1',
    project_name: 'Project Alpha',
    skill_count: 3,
    agent_count: 2,
    mcp_server_count: 1,
    command_count: 5,
  },
  {
    project_id: 'proj-2',
    project_name: 'Project Beta',
    skill_count: 0,
    agent_count: 1,
    mcp_server_count: 0,
    command_count: 0,
  },
]

describe('ProjectList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      projects: mockProjects,
      selectedProjectId: null,
      selectProject: mockSelectProject,
      createDBProject: mockCreateDBProject,
      deleteDBProject: mockDeleteDBProject,
      fetchDBProjects: mockFetchDBProjects,
      dbProjects: [],
      isLoading: false,
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoading = true
    const { container } = render(<ProjectList />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders project count in header', () => {
    render(<ProjectList />)
    expect(screen.getByText('Projects (2)')).toBeInTheDocument()
  })

  it('renders project names', () => {
    render(<ProjectList />)
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('renders project stats', () => {
    render(<ProjectList />)
    expect(screen.getByText('3 skills')).toBeInTheDocument()
    expect(screen.getByText('2 agents')).toBeInTheDocument()
    expect(screen.getByText('1 MCP')).toBeInTheDocument()
    expect(screen.getByText('5 commands')).toBeInTheDocument()
  })

  it('calls selectProject on project click', () => {
    render(<ProjectList />)
    fireEvent.click(screen.getByText('Project Alpha'))
    expect(mockSelectProject).toHaveBeenCalledWith('proj-1')
  })

  it('calls fetchDBProjects on mount', () => {
    render(<ProjectList />)
    expect(mockFetchDBProjects).toHaveBeenCalledTimes(1)
  })

  it('shows add project form on plus button click', () => {
    render(<ProjectList />)
    const addButton = screen.getByTitle('Add project')
    fireEvent.click(addButton)
    expect(screen.getByPlaceholderText('Project name *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument()
  })

  it('shows empty state when no projects', () => {
    mockStoreState.projects = []
    render(<ProjectList />)
    expect(screen.getByText(/No projects found/)).toBeInTheDocument()
    expect(screen.getByText(/Add a project above/)).toBeInTheDocument()
  })

  it('disables Add Project button when name is empty', () => {
    render(<ProjectList />)
    fireEvent.click(screen.getByTitle('Add project'))
    const addBtn = screen.getByText('Add Project')
    expect(addBtn).toBeDisabled()
  })

  it('enables Add Project button when name is filled', () => {
    render(<ProjectList />)
    fireEvent.click(screen.getByTitle('Add project'))
    const nameInput = screen.getByPlaceholderText('Project name *')
    fireEvent.change(nameInput, { target: { value: 'New Project' } })
    const addBtn = screen.getByText('Add Project')
    expect(addBtn).not.toBeDisabled()
  })
})
