import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectMembersContent } from '../ProjectMembersContent'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    X: icon('x'),
    UserPlus: icon('user-plus'),
    Loader2: icon('loader'),
    Users: icon('users'),
  }
})

// Mock project access store
const mockFetchMembers = vi.fn()
const mockFetchMyAccess = vi.fn()
const mockFetchAvailableOrgMembers = vi.fn()
const mockAddMember = vi.fn()
const mockUpdateRole = vi.fn()
const mockRemoveMember = vi.fn()
const mockClearError = vi.fn()

let mockProjectAccessState: Record<string, unknown> = {}

vi.mock('../../../stores/projectAccess', () => ({
  useProjectAccessStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = mockProjectAccessState
    return selector ? selector(state) : state
  },
}))

// Mock auth store
vi.mock('../../../stores/auth', () => ({
  useAuthStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { user: { is_admin: false } }
    return selector ? selector(state) : state
  },
}))

const makeMember = (overrides?: Record<string, unknown>) => ({
  id: 'mem-1',
  project_id: 'proj-1',
  user_id: 'user-1',
  user_email: 'alice@test.com',
  user_name: 'Alice',
  role: 'editor',
  granted_by: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

describe('ProjectMembersContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectAccessState = {
      members: [],
      myAccess: null,
      loading: false,
      error: null,
      availableOrgMembers: [],
      isLoadingAvailableMembers: false,
      fetchMembers: mockFetchMembers,
      fetchMyAccess: mockFetchMyAccess,
      fetchAvailableOrgMembers: mockFetchAvailableOrgMembers,
      addMember: mockAddMember,
      updateRole: mockUpdateRole,
      removeMember: mockRemoveMember,
      clearError: mockClearError,
    }
  })

  it('calls fetchMembers and fetchMyAccess on mount', () => {
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(mockFetchMembers).toHaveBeenCalledWith('proj-1')
    expect(mockFetchMyAccess).toHaveBeenCalledWith('proj-1')
    expect(mockFetchAvailableOrgMembers).toHaveBeenCalledWith('proj-1')
  })

  it('shows loading state when loading and no members', () => {
    mockProjectAccessState.loading = true
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('shows empty state when no members', () => {
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText(/멤버가 없습니다/)).toBeInTheDocument()
  })

  it('renders member list', () => {
    mockProjectAccessState.members = [makeMember()]
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  it('shows member count in header', () => {
    mockProjectAccessState.members = [makeMember()]
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText(/멤버 \(1\)/)).toBeInTheDocument()
  })

  it('shows error message', () => {
    mockProjectAccessState.error = 'Something went wrong'
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows role badge for non-managers', () => {
    mockProjectAccessState.members = [makeMember()]
    mockProjectAccessState.myAccess = { role: 'viewer', has_access: true, project_id: 'proj-1' }
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  it('shows add button for owner', () => {
    mockProjectAccessState.myAccess = { role: 'owner', has_access: true, project_id: 'proj-1' }
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText('추가')).toBeInTheDocument()
  })

  it('does not show add button for non-owner non-admin', () => {
    mockProjectAccessState.myAccess = { role: 'viewer', has_access: true, project_id: 'proj-1' }
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.queryByText('추가')).not.toBeInTheDocument()
  })

  it('shows my role in footer', () => {
    mockProjectAccessState.myAccess = { role: 'editor', has_access: true, project_id: 'proj-1' }
    render(<ProjectMembersContent projectId="proj-1" />)
    expect(screen.getByText(/내 역할/)).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  it('toggles add form on button click', () => {
    mockProjectAccessState.myAccess = { role: 'owner', has_access: true, project_id: 'proj-1' }
    render(<ProjectMembersContent projectId="proj-1" />)

    fireEvent.click(screen.getByText('추가'))
    expect(screen.getByText('조직 멤버에서 선택')).toBeInTheDocument()

    fireEvent.click(screen.getByText('취소'))
    expect(screen.queryByText('조직 멤버에서 선택')).not.toBeInTheDocument()
  })

  it('shows no available members message', () => {
    mockProjectAccessState.myAccess = { role: 'owner', has_access: true, project_id: 'proj-1' }
    mockProjectAccessState.availableOrgMembers = []
    render(<ProjectMembersContent projectId="proj-1" />)

    fireEvent.click(screen.getByText('추가'))
    expect(screen.getByText(/추가 가능한 조직 멤버가 없습니다/)).toBeInTheDocument()
  })
})
