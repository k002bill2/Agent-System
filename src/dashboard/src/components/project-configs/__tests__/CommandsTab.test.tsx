import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandsTab } from '../CommandsTab'

const mockOpenCommandModal = vi.fn()
const mockDeleteCommand = vi.fn()
const mockCopyCommand = vi.fn()
const mockFetchCommandContent = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

// Mock child modals
vi.mock('../CommandEditModal', () => ({
  CommandEditModal: () => null,
}))
vi.mock('../ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}))
vi.mock('../CopyToProjectModal', () => ({
  CopyToProjectModal: () => null,
}))

const mockCommands = [
  {
    command_id: 'deploy',
    project_id: 'proj-1',
    name: 'deploy',
    description: 'Deploy to production',
    file_path: '/path/deploy.md',
    allowed_tools: 'Bash(git:*)',
    argument_hint: 'branch name',
    modified_at: null,
  },
  {
    command_id: 'review',
    project_id: 'proj-1',
    name: 'review',
    description: null,
    file_path: '/path/review.md',
    allowed_tools: null,
    argument_hint: null,
    modified_at: null,
  },
]

describe('CommandsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: {
        project: { project_id: 'proj-1' },
        commands: mockCommands,
      },
      isLoadingProject: false,
      fetchCommandContent: mockFetchCommandContent,
      commandContent: null,
      isLoadingContent: false,
      openCommandModal: mockOpenCommandModal,
      deleteCommand: mockDeleteCommand,
      deletingCommands: new Set(),
      copyCommand: mockCopyCommand,
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<CommandsTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<CommandsTab />)
    expect(screen.getByText('Select a project to view commands')).toBeInTheDocument()
  })

  it('renders commands count in header', () => {
    render(<CommandsTab />)
    expect(screen.getByText('Commands (2)')).toBeInTheDocument()
  })

  it('renders command names with slash prefix', () => {
    render(<CommandsTab />)
    expect(screen.getByText('/deploy')).toBeInTheDocument()
    expect(screen.getByText('/review')).toBeInTheDocument()
  })

  it('renders command description', () => {
    render(<CommandsTab />)
    expect(screen.getByText('Deploy to production')).toBeInTheDocument()
  })

  it('renders command allowed_tools', () => {
    render(<CommandsTab />)
    expect(screen.getByText('Bash(git:*)')).toBeInTheDocument()
  })

  it('renders command argument_hint', () => {
    render(<CommandsTab />)
    expect(screen.getByText('branch name')).toBeInTheDocument()
  })

  it('shows Create Command button', () => {
    render(<CommandsTab />)
    expect(screen.getByText('Create Command')).toBeInTheDocument()
  })

  it('calls openCommandModal on Create Command click', () => {
    render(<CommandsTab />)
    fireEvent.click(screen.getByText('Create Command'))
    expect(mockOpenCommandModal).toHaveBeenCalledWith('create')
  })

  it('shows empty state when no commands', () => {
    mockStoreState.selectedProject = {
      project: { project_id: 'proj-1' },
      commands: [],
    }
    render(<CommandsTab />)
    expect(screen.getByText('No commands found in this project')).toBeInTheDocument()
  })
})
