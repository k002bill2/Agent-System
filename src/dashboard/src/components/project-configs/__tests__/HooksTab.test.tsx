import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HooksTab } from '../HooksTab'

const mockAddHookEntry = vi.fn()
const mockDeleteHook = vi.fn()
const mockCopyHook = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

// Mock child modals
vi.mock('../HookEditModal', () => ({
  HookEditModal: () => null,
}))
vi.mock('../ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}))
vi.mock('../CopyToProjectModal', () => ({
  CopyToProjectModal: () => null,
}))

const mockHooks = [
  {
    hook_id: 'PreToolUse_0_0',
    project_id: 'proj-1',
    event: 'PreToolUse',
    matcher: 'Edit|Write',
    command: 'echo "pre-tool"',
    hook_type: 'command',
    file_path: '/path/.claude/settings.json',
  },
  {
    hook_id: 'PostToolUse_0_0',
    project_id: 'proj-1',
    event: 'PostToolUse',
    matcher: '*',
    command: 'echo "post-tool"',
    hook_type: 'command',
    file_path: '/path/.claude/settings.json',
  },
]

describe('HooksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: {
        project: { project_id: 'proj-1' },
        hooks: mockHooks,
      },
      isLoadingProject: false,
      addHookEntry: mockAddHookEntry,
      deleteHook: mockDeleteHook,
      copyHook: mockCopyHook,
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<HooksTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<HooksTab />)
    expect(screen.getByText('Select a project to view hooks')).toBeInTheDocument()
  })

  it('renders hooks count in header', () => {
    render(<HooksTab />)
    expect(screen.getByText('Hooks (2)')).toBeInTheDocument()
  })

  it('renders hook events as group headers', () => {
    render(<HooksTab />)
    expect(screen.getByText('PreToolUse')).toBeInTheDocument()
    expect(screen.getByText('PostToolUse')).toBeInTheDocument()
  })

  it('renders hook matchers', () => {
    render(<HooksTab />)
    expect(screen.getByText('Edit|Write')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders hook commands', () => {
    render(<HooksTab />)
    expect(screen.getByText('echo "pre-tool"')).toBeInTheDocument()
    expect(screen.getByText('echo "post-tool"')).toBeInTheDocument()
  })

  it('shows Add Hook button', () => {
    render(<HooksTab />)
    expect(screen.getByText('Add Hook')).toBeInTheDocument()
  })

  it('shows empty state when no hooks', () => {
    mockStoreState.selectedProject = {
      project: { project_id: 'proj-1' },
      hooks: [],
    }
    render(<HooksTab />)
    expect(screen.getByText('No hooks configured')).toBeInTheDocument()
  })

  it('shows Matcher label for each hook', () => {
    render(<HooksTab />)
    const matchers = screen.getAllByText('Matcher:')
    expect(matchers.length).toBe(2)
  })
})
