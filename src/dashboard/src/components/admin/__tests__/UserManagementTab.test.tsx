import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserManagementTab } from '../UserManagementTab'
import type { AdminUser } from '../types'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Search: (props: Record<string, unknown>) => <span data-testid="icon-search" {...props} />,
  ChevronLeft: (props: Record<string, unknown>) => <span data-testid="icon-chevron-left" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-chevron-right" {...props} />,
  UserCheck: (props: Record<string, unknown>) => <span data-testid="icon-usercheck" {...props} />,
  UserX: (props: Record<string, unknown>) => <span data-testid="icon-userx" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
}))

const mockFetchUsers = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('../api', () => ({
  fetchUsers: (...args: unknown[]) => mockFetchUsers(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}))

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u1',
    email: 'alice@test.com',
    name: 'Alice',
    avatar_url: null,
    oauth_provider: 'google',
    is_active: true,
    is_admin: false,
    role: 'user',
    created_at: '2024-01-01T00:00:00Z',
    last_login_at: '2024-01-10T00:00:00Z',
    ...overrides,
  }
}

const mockUsers = [
  makeUser({ id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'user' }),
  makeUser({ id: 'u2', name: 'Bob', email: 'bob@test.com', role: 'admin', is_admin: true }),
  makeUser({ id: 'u3', name: null, email: 'charlie@test.com', role: 'manager', is_active: false }),
]

describe('UserManagementTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchUsers.mockResolvedValue({ users: mockUsers, total: 3 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading state initially then renders users', async () => {
    render(<UserManagementTab currentUserId="current-user" />)
    // Initially shows loading (both desktop and mobile)
    expect(screen.getAllByText('Loading...').length).toBeGreaterThanOrEqual(1)

    await waitFor(() => {
      // Desktop + Mobile: Alice appears twice
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders search input and search button', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByPlaceholderText('\uC774\uBA54\uC77C \uB610\uB294 \uC774\uB984 \uAC80\uC0C9...')).toBeInTheDocument()
    expect(screen.getByText('\uAC80\uC0C9')).toBeInTheDocument() // 검색
  })

  it('renders filter selects', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('All Status')).toBeInTheDocument()
    expect(screen.getByText('All Roles')).toBeInTheDocument()
  })

  it('shows total user count', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getByText('3 users')).toBeInTheDocument()
    })
  })

  it('renders user emails in both desktop and mobile layouts', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('alice@test.com').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getAllByText('bob@test.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('charlie@test.com').length).toBeGreaterThanOrEqual(1)
  })

  it('shows provider info', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getAllByText('google').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Active/Inactive badges', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Active appears in both desktop/mobile views + in the filter option
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Inactive').length).toBeGreaterThanOrEqual(1)
  })

  it('marks current user with "(you)" label', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getAllByText('(you)').length).toBeGreaterThanOrEqual(1)
  })

  it('disables checkbox for the current user', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    const disabledCheckboxes = checkboxes.filter((cb) => cb.hasAttribute('disabled'))
    // Current user's checkboxes (desktop + mobile) are disabled
    expect(disabledCheckboxes.length).toBeGreaterThanOrEqual(1)
  })

  it('renders error message when fetch fails', async () => {
    mockFetchUsers.mockRejectedValue(new Error('Network error'))
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('shows empty state when no users found', async () => {
    mockFetchUsers.mockResolvedValue({ users: [], total: 0 })
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('No users found').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('triggers search on button click', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const searchInput = screen.getByPlaceholderText('\uC774\uBA54\uC77C \uB610\uB294 \uC774\uB984 \uAC80\uC0C9...')
    fireEvent.change(searchInput, { target: { value: 'bob' } })
    fireEvent.click(screen.getByText('\uAC80\uC0C9'))

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'bob' })
      )
    })
  })

  it('calls updateUser when toggling active status', async () => {
    mockUpdateUser.mockResolvedValue(makeUser({ id: 'u1', is_active: false }))
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // UserX icons represent deactivate buttons for active users
    const userXIcons = screen.getAllByTestId('icon-userx')
    fireEvent.click(userXIcons[0].closest('button')!)

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ is_active: false })
      )
    })
  })

  // ── Search ──────────────────────────────────────────────────

  it('triggers search on Enter key press', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const searchInput = screen.getByPlaceholderText('이메일 또는 이름 검색...')
    fireEvent.change(searchInput, { target: { value: 'charlie' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'charlie', offset: 0 })
      )
    })
  })

  it('does not trigger search on non-Enter key press', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()
    const searchInput = screen.getByPlaceholderText('이메일 또는 이름 검색...')
    fireEvent.keyDown(searchInput, { key: 'a' })

    // Should not have called fetchUsers again (beyond initial load)
    expect(mockFetchUsers).not.toHaveBeenCalled()
  })

  // ── Filters ─────────────────────────────────────────────────

  it('filters by Active status', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()

    // The status filter select: find by its current value "all"
    const statusSelect = screen.getByDisplayValue('All Status')
    fireEvent.change(statusSelect, { target: { value: 'true' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true, offset: 0 })
      )
    })
  })

  it('filters by Inactive status', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()

    const statusSelect = screen.getByDisplayValue('All Status')
    fireEvent.change(statusSelect, { target: { value: 'false' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false, offset: 0 })
      )
    })
  })

  it('resets status filter to all', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const statusSelect = screen.getByDisplayValue('All Status')
    // First set to active
    fireEvent.change(statusSelect, { target: { value: 'true' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      )
    })

    mockFetchUsers.mockClear()

    // Then reset to all
    fireEvent.change(statusSelect, { target: { value: 'all' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: null })
      )
    })
  })

  it('filters by role', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()

    const roleSelect = screen.getByDisplayValue('All Roles')
    fireEvent.change(roleSelect, { target: { value: 'manager' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'manager', offset: 0 })
      )
    })
  })

  it('resets role filter to all', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const roleSelect = screen.getByDisplayValue('All Roles')
    fireEvent.change(roleSelect, { target: { value: 'admin' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' })
      )
    })

    mockFetchUsers.mockClear()

    fireEvent.change(roleSelect, { target: { value: 'all' } })

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: undefined })
      )
    })
  })

  // ── Role change ─────────────────────────────────────────────

  it('changes user role via dropdown and shows saved indicator', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const updatedUser = makeUser({ id: 'u1', role: 'manager' })
    mockUpdateUser.mockResolvedValue(updatedUser)

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Find role selects for the users - they have value 'user' for u1
    const roleSelects = screen.getAllByDisplayValue('일반 (User)')
    fireEvent.change(roleSelects[0], { target: { value: 'manager' } })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('u1', { role: 'manager' })
    })

    // Check icon should appear after successful save
    await waitFor(() => {
      expect(screen.getAllByTestId('icon-check').length).toBeGreaterThanOrEqual(1)
    })

    // After 2s the check icon should disappear
    vi.advanceTimersByTime(2100)

    vi.useRealTimers()
  })

  it('shows error when role change fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('Permission denied'))

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const roleSelects = screen.getAllByDisplayValue('일반 (User)')
    fireEvent.change(roleSelects[0], { target: { value: 'admin' } })

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    })
  })

  it('shows generic message when role change fails with non-Error', async () => {
    mockUpdateUser.mockRejectedValue('unknown')

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const roleSelects = screen.getAllByDisplayValue('일반 (User)')
    fireEvent.change(roleSelects[0], { target: { value: 'admin' } })

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })
  })

  // ── Toggle active error handling ────────────────────────────

  it('shows error when toggle active fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('Server error'))

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const userXIcons = screen.getAllByTestId('icon-userx')
    fireEvent.click(userXIcons[0].closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('shows generic message when toggle active fails with non-Error', async () => {
    mockUpdateUser.mockRejectedValue(42)

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const userXIcons = screen.getAllByTestId('icon-userx')
    fireEvent.click(userXIcons[0].closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })
  })

  it('activates an inactive user via toggle', async () => {
    mockUpdateUser.mockResolvedValue(makeUser({ id: 'u3', is_active: true }))

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('charlie@test.com').length).toBeGreaterThanOrEqual(1)
    })

    // UserCheck icons represent activate buttons for inactive users
    const userCheckIcons = screen.getAllByTestId('icon-usercheck')
    fireEvent.click(userCheckIcons[0].closest('button')!)

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('u3', { is_active: true })
    })
  })

  // ── Fetch error (non-Error) ─────────────────────────────────

  it('shows generic fallback message when fetchUsers rejects with non-Error', async () => {
    mockFetchUsers.mockRejectedValue('random string')
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument()
    })
  })

  // ── Select all / individual selection ───────────────────────

  it('selects all users except current user via select-all checkbox', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Find the header "select all" checkbox - it is in the thead
    const checkboxes = screen.getAllByRole('checkbox')
    // The first checkbox is the select-all in the desktop table header
    const selectAllCheckbox = checkboxes[0]
    fireEvent.click(selectAllCheckbox)

    // Batch action bar should appear with "2명 선택됨" (u2 and u3, not u1 which is current user)
    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })
  })

  it('deselects all users when select-all is unchecked', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    const selectAllCheckbox = checkboxes[0]

    // Select all
    fireEvent.click(selectAllCheckbox)
    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    // Deselect all
    fireEvent.click(selectAllCheckbox)
    await waitFor(() => {
      expect(screen.queryByText('2명 선택됨')).not.toBeInTheDocument()
    })
  })

  it('selects and deselects individual users', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Get all checkboxes - find the one for u2 (Bob) in the desktop table
    // Checkboxes order: select-all, u1 (disabled), u2, u3, then mobile: u1 (disabled), u2, u3
    const checkboxes = screen.getAllByRole('checkbox')
    // u2's desktop checkbox is the 3rd checkbox (index 2)
    const bobCheckbox = checkboxes[2]

    fireEvent.click(bobCheckbox)
    await waitFor(() => {
      expect(screen.getByText('1명 선택됨')).toBeInTheDocument()
    })

    // Deselect
    fireEvent.click(bobCheckbox)
    await waitFor(() => {
      expect(screen.queryByText('1명 선택됨')).not.toBeInTheDocument()
    })
  })

  // ── Batch actions ───────────────────────────────────────────

  it('applies batch activate action', async () => {
    const updatedU2 = makeUser({ id: 'u2', is_active: true })
    const updatedU3 = makeUser({ id: 'u3', is_active: true })
    mockUpdateUser
      .mockResolvedValueOnce(updatedU2)
      .mockResolvedValueOnce(updatedU3)

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Select all (excludes current user u1)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    // Select batch action: activate
    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'activate' } })

    // Click apply
    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('u2', { is_active: true })
      expect(mockUpdateUser).toHaveBeenCalledWith('u3', { is_active: true })
    })
  })

  it('applies batch deactivate action', async () => {
    const updatedU2 = makeUser({ id: 'u2', is_active: false })
    const updatedU3 = makeUser({ id: 'u3', is_active: false })
    mockUpdateUser
      .mockResolvedValueOnce(updatedU2)
      .mockResolvedValueOnce(updatedU3)

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'deactivate' } })

    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('u2', { is_active: false })
      expect(mockUpdateUser).toHaveBeenCalledWith('u3', { is_active: false })
    })
  })

  it('applies batch role change action', async () => {
    const updatedU2 = makeUser({ id: 'u2', role: 'manager' })
    const updatedU3 = makeUser({ id: 'u3', role: 'manager' })
    mockUpdateUser
      .mockResolvedValueOnce(updatedU2)
      .mockResolvedValueOnce(updatedU3)

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'manager' } })

    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('u2', { role: 'manager' })
      expect(mockUpdateUser).toHaveBeenCalledWith('u3', { role: 'manager' })
    })
  })

  it('does nothing when batch apply is clicked without selecting an action', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    // Do not select any batch action, just click apply (disabled, but test handler)
    fireEvent.click(screen.getByText('적용'))

    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows error when batch action fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('Batch failed'))

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'activate' } })
    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(screen.getByText('Batch failed')).toBeInTheDocument()
    })
  })

  it('shows generic error when batch action fails with non-Error', async () => {
    mockUpdateUser.mockRejectedValue('something')

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'deactivate' } })
    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(screen.getByText('Batch update failed')).toBeInTheDocument()
    })
  })

  it('clears selection when "선택 해제" button is clicked', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('선택 해제'))

    await waitFor(() => {
      expect(screen.queryByText('2명 선택됨')).not.toBeInTheDocument()
    })
  })

  it('clears selection after successful batch action', async () => {
    const updatedU2 = makeUser({ id: 'u2', is_active: true })
    const updatedU3 = makeUser({ id: 'u3', is_active: true })
    mockUpdateUser
      .mockResolvedValueOnce(updatedU2)
      .mockResolvedValueOnce(updatedU3)

    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    })

    const batchSelect = screen.getByDisplayValue('일괄 작업 선택...')
    fireEvent.change(batchSelect, { target: { value: 'activate' } })
    fireEvent.click(screen.getByText('적용'))

    await waitFor(() => {
      expect(screen.queryByText('2명 선택됨')).not.toBeInTheDocument()
    })
  })

  // ── Pagination ──────────────────────────────────────────────

  it('renders pagination when total exceeds limit', async () => {
    // 25 users total with limit 20 = 2 pages
    const manyUsers = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `u${i}`, name: `User${i}`, email: `user${i}@test.com` })
    )
    mockFetchUsers.mockResolvedValue({ users: manyUsers, total: 25 })

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 of 2').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('navigates to next page', async () => {
    const manyUsers = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `u${i}`, name: `User${i}`, email: `user${i}@test.com` })
    )
    mockFetchUsers.mockResolvedValue({ users: manyUsers, total: 25 })

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 of 2').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()

    // Click next page button (ChevronRight icons)
    const nextButtons = screen.getAllByTestId('icon-chevron-right')
    fireEvent.click(nextButtons[0].closest('button')!)

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 })
      )
    })
  })

  it('navigates to previous page', async () => {
    const manyUsers = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `u${i}`, name: `User${i}`, email: `user${i}@test.com` })
    )
    mockFetchUsers.mockResolvedValue({ users: manyUsers, total: 45 })

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 of 3').length).toBeGreaterThanOrEqual(1)
    })

    // Go to page 2
    const nextButtons = screen.getAllByTestId('icon-chevron-right')
    fireEvent.click(nextButtons[0].closest('button')!)

    await waitFor(() => {
      expect(screen.getAllByText('Page 2 of 3').length).toBeGreaterThanOrEqual(1)
    })

    mockFetchUsers.mockClear()

    // Go back to page 1
    const prevButtons = screen.getAllByTestId('icon-chevron-left')
    fireEvent.click(prevButtons[0].closest('button')!)

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0 })
      )
    })
  })

  it('does not show pagination when total fits in one page', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // total is 3, limit is 20, so no pagination should be shown
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
  })

  // ── User display variants ───────────────────────────────────

  it('renders user avatar when avatar_url is present', async () => {
    const usersWithAvatar = [
      makeUser({ id: 'u1', name: 'Alice', avatar_url: 'https://example.com/avatar.png' }),
    ]
    mockFetchUsers.mockResolvedValue({ users: usersWithAvatar, total: 1 })

    const { container } = render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // img elements with empty alt="" are treated as decorative (no 'img' role),
    // so query the DOM directly
    const avatarImages = container.querySelectorAll('img[src="https://example.com/avatar.png"]')
    expect(avatarImages.length).toBeGreaterThanOrEqual(1)
  })

  it('shows email provider when oauth_provider is null', async () => {
    const usersNoOAuth = [
      makeUser({ id: 'u1', name: 'Alice', oauth_provider: null }),
    ]
    mockFetchUsers.mockResolvedValue({ users: usersNoOAuth, total: 1 })

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // When oauth_provider is null, it should show 'email'
    expect(screen.getAllByText('email').length).toBeGreaterThanOrEqual(1)
  })

  it('shows dash for user without name', async () => {
    // u3 in mockUsers has name: null
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('charlie@test.com').length).toBeGreaterThanOrEqual(1)
    })

    // User with null name should show '-'
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1)
  })

  it('shows dash for user without created_at', async () => {
    const usersNoDates = [
      makeUser({ id: 'u1', name: 'Alice', created_at: null, last_login_at: null }),
    ]
    mockFetchUsers.mockResolvedValue({ users: usersNoDates, total: 1 })

    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Both created_at and last_login_at are null, so extra dashes appear
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders initial character for user without avatar', async () => {
    // Default mockUsers have no avatar_url, so initials should be rendered
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // 'A' for Alice, 'B' for Bob, 'C' for charlie (first char of email since name is null)
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('B').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('C').length).toBeGreaterThanOrEqual(1)
  })

  // ── Role dropdown disabled for current user ─────────────────

  it('disables role dropdown for the current user', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Role selects with value 'user' for u1 should be disabled
    const roleSelects = screen.getAllByDisplayValue('일반 (User)')
    // At least one should be disabled (the current user's)
    const disabledSelects = roleSelects.filter((s) => s.hasAttribute('disabled'))
    expect(disabledSelects.length).toBeGreaterThanOrEqual(1)
  })

  it('disables toggle active button for the current user', async () => {
    render(<UserManagementTab currentUserId="u1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    })

    // Find all toggle-active buttons (they contain UserX or UserCheck icons)
    const allButtons = screen.getAllByTitle(/활성화|비활성화/)
    const disabledButtons = allButtons.filter((btn) => btn.hasAttribute('disabled'))
    // The current user's button(s) should be disabled
    expect(disabledButtons.length).toBeGreaterThanOrEqual(1)
  })

  // ── Loading fetches users with correct params ───────────────

  it('calls fetchUsers with correct default parameters on mount', async () => {
    render(<UserManagementTab currentUserId="current-user" />)

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledWith({
        search: undefined,
        is_active: null,
        is_admin: null,
        role: undefined,
        limit: 20,
        offset: 0,
      })
    })
  })
})
