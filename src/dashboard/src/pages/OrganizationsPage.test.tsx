import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrganizationsPage } from './OrganizationsPage'

// ---------- helpers ----------
// Full Organization shape matching the store type
function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    description: 'A test org',
    status: 'active' as const,
    plan: 'professional' as const,
    contact_email: 'admin@acme.com',
    contact_name: 'Jane Admin',
    logo_url: null as string | null,
    primary_color: '#6366f1',
    max_members: 50,
    max_projects: 20,
    max_sessions_per_day: 1000,
    max_tokens_per_month: 500000,
    current_members: 10,
    current_projects: 5,
    tokens_used_this_month: 120000,
    settings: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
    ...overrides,
  }
}

// ---------- mock child components ----------
// Enhanced mocks that expose callback props so we can trigger them in tests

vi.mock('../components/organizations', () => ({
  OrganizationCard: ({
    organization,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
  }: {
    organization: { id: string; name: string }
    isSelected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <div data-testid={`org-card-${organization.id}`} data-selected={isSelected}>
      <span>{organization.name}</span>
      <button data-testid={`select-${organization.id}`} onClick={onSelect}>
        Select
      </button>
      <button data-testid={`edit-${organization.id}`} onClick={onEdit}>
        Edit
      </button>
      <button data-testid={`delete-${organization.id}`} onClick={onDelete}>
        Delete
      </button>
    </div>
  ),
  OrganizationFormModal: ({
    mode,
    onSubmit,
    onClose,
  }: {
    mode: string
    onSubmit: (data: unknown) => Promise<boolean | undefined>
    onClose: () => void
  }) => (
    <div data-testid="org-form-modal">
      <span data-testid="form-mode">{mode}</span>
      <button data-testid="form-submit" onClick={() => onSubmit({ name: 'New Org', slug: 'new-org' })}>
        Submit
      </button>
      <button data-testid="form-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
  MemberList: ({
    onInvite,
    onUpdateRole,
    onRemove,
    currentUserRole,
  }: {
    onInvite: () => void
    onUpdateRole: (memberId: string, role: string) => void
    onRemove: (memberId: string) => void
    currentUserRole: string | null
  }) => (
    <div data-testid="member-list">
      <span data-testid="member-role">{currentUserRole}</span>
      <button data-testid="invite-btn" onClick={onInvite}>
        Invite
      </button>
      <button data-testid="update-role-btn" onClick={() => onUpdateRole('member-1', 'admin')}>
        UpdateRole
      </button>
      <button data-testid="remove-member-btn" onClick={() => onRemove('member-1')}>
        RemoveMember
      </button>
    </div>
  ),
  InviteMemberModal: ({
    organizationName,
    onSubmit,
    onClose,
  }: {
    organizationName: string
    onSubmit: (data: unknown) => void
    onClose: () => void
  }) => (
    <div data-testid="invite-modal">
      <span data-testid="invite-org-name">{organizationName}</span>
      <button data-testid="invite-submit" onClick={() => onSubmit({ email: 'new@test.com', role: 'member' })}>
        Send Invite
      </button>
      <button data-testid="invite-close" onClick={onClose}>
        Close Invite
      </button>
    </div>
  ),
  OrganizationStats: () => <div data-testid="org-stats">OrgStats</div>,
  QuotaStatusPanel: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="quota-panel">{organizationId}</div>
  ),
  MemberUsagePanel: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="member-usage">{organizationId}</div>
  ),
  SourceUserMapping: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="source-user-mapping">{organizationId}</div>
  ),
}))

// ---------- store mocks ----------
const mockFetchOrganizations = vi.fn()
const mockFetchMembers = vi.fn()
const mockFetchUserMemberships = vi.fn()
const mockFetchStats = vi.fn()
const mockSetModalMode = vi.fn()
const mockSetActiveTab = vi.fn()
const mockSetCurrentOrganization = vi.fn()
const mockClearError = vi.fn()
const mockCreateOrganization = vi.fn()
const mockUpdateOrganization = vi.fn()
const mockDeleteOrganization = vi.fn()
const mockInviteMember = vi.fn()
const mockUpdateMemberRole = vi.fn()
const mockRemoveMember = vi.fn()
const mockGetCurrentUserRole = vi.fn()

let mockOrganizations: ReturnType<typeof makeOrg>[] = []
let mockCurrentOrganization: ReturnType<typeof makeOrg> | null = null
let mockMembers: unknown[] = []
let mockStats: unknown = null
let mockIsLoading = false
let mockError: string | null = null
let mockModalMode: string | null = null
let mockActiveTab = 'overview'

vi.mock('../stores/organizations', () => ({
  useOrganizationsStore: () => ({
    organizations: mockOrganizations,
    currentOrganization: mockCurrentOrganization,
    members: mockMembers,
    stats: mockStats,
    isLoading: mockIsLoading,
    error: mockError,
    modalMode: mockModalMode,
    activeTab: mockActiveTab,
    setModalMode: mockSetModalMode,
    setActiveTab: mockSetActiveTab,
    setCurrentOrganization: mockSetCurrentOrganization,
    clearError: mockClearError,
    fetchOrganizations: mockFetchOrganizations,
    createOrganization: mockCreateOrganization,
    updateOrganization: mockUpdateOrganization,
    deleteOrganization: mockDeleteOrganization,
    fetchMembers: mockFetchMembers,
    inviteMember: mockInviteMember,
    updateMemberRole: mockUpdateMemberRole,
    removeMember: mockRemoveMember,
    fetchUserMemberships: mockFetchUserMemberships,
    getCurrentUserRole: mockGetCurrentUserRole,
    fetchStats: mockFetchStats,
  }),
}))

let mockUser: { id: string; email: string; name: string } | null = {
  id: '1',
  email: 'test@test.com',
  name: 'Test User',
}

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: mockUser,
  }),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ================================================================
// Tests
// ================================================================

describe('OrganizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrganizations = []
    mockCurrentOrganization = null
    mockMembers = []
    mockStats = null
    mockIsLoading = false
    mockError = null
    mockModalMode = null
    mockActiveTab = 'overview'
    mockUser = { id: '1', email: 'test@test.com', name: 'Test User' }
    mockGetCurrentUserRole.mockReturnValue(null)
  })

  // ────────────────────────────────────────────
  // Basic rendering & initialization
  // ────────────────────────────────────────────

  it('renders the page title "Organizations"', () => {
    render(<OrganizationsPage />)
    expect(screen.getByText('Organizations')).toBeInTheDocument()
  })

  it('fetches organizations on mount', () => {
    render(<OrganizationsPage />)
    expect(mockFetchOrganizations).toHaveBeenCalledTimes(1)
  })

  it('fetches user memberships on mount when user is present', () => {
    render(<OrganizationsPage />)
    expect(mockFetchUserMemberships).toHaveBeenCalledWith('1')
  })

  it('does not fetch user memberships when user is null', () => {
    mockUser = null
    render(<OrganizationsPage />)
    expect(mockFetchUserMemberships).not.toHaveBeenCalled()
  })

  // ────────────────────────────────────────────
  // Loading state
  // ────────────────────────────────────────────

  it('shows loading skeleton placeholders when isLoading and no organizations', () => {
    mockIsLoading = true
    const { container } = render(<OrganizationsPage />)
    // The skeleton shows 3 pulsing divs
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(3)
  })

  it('does not show skeletons when isLoading but organizations already exist', () => {
    mockIsLoading = true
    mockOrganizations = [makeOrg()]
    const { container } = render(<OrganizationsPage />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(0)
  })

  // ────────────────────────────────────────────
  // Empty state
  // ────────────────────────────────────────────

  it('shows empty state message when no organizations exist', () => {
    render(<OrganizationsPage />)
    expect(screen.getByText('No organizations yet')).toBeInTheDocument()
  })

  it('shows "Create your first organization" link in empty state', () => {
    render(<OrganizationsPage />)
    const link = screen.getByText('Create your first organization')
    expect(link).toBeInTheDocument()
  })

  it('clicking "Create your first organization" opens create modal', () => {
    render(<OrganizationsPage />)
    fireEvent.click(screen.getByText('Create your first organization'))
    expect(mockSetModalMode).toHaveBeenCalledWith('create')
  })

  // ────────────────────────────────────────────
  // Error display
  // ────────────────────────────────────────────

  it('shows error banner when error is set', () => {
    mockError = 'Network error occurred'
    // We need a currentOrganization so the right panel renders the error
    // Actually error banner shows above the right panel regardless
    render(<OrganizationsPage />)
    expect(screen.getByText('Network error occurred')).toBeInTheDocument()
  })

  it('clicking dismiss button calls clearError', () => {
    mockError = 'Something went wrong'
    render(<OrganizationsPage />)
    // The dismiss button contains the "x" character
    const dismissButton = screen.getByText('\u00d7')
    fireEvent.click(dismissButton)
    expect(mockClearError).toHaveBeenCalledTimes(1)
  })

  it('does not show error banner when error is null', () => {
    mockError = null
    render(<OrganizationsPage />)
    expect(screen.queryByText('\u00d7')).not.toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Organization list & cards
  // ────────────────────────────────────────────

  it('renders organization cards for each org', () => {
    mockOrganizations = [makeOrg({ id: 'org-1', name: 'Alpha' }), makeOrg({ id: 'org-2', name: 'Beta' })]
    render(<OrganizationsPage />)
    expect(screen.getByTestId('org-card-org-1')).toBeInTheDocument()
    expect(screen.getByTestId('org-card-org-2')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('clicking create button (Plus icon) calls setModalMode("create")', () => {
    render(<OrganizationsPage />)
    const createBtn = screen.getByTitle('Create Organization')
    fireEvent.click(createBtn)
    expect(mockSetModalMode).toHaveBeenCalledWith('create')
  })

  // ────────────────────────────────────────────
  // Organization selection
  // ────────────────────────────────────────────

  it('clicking select on a card calls setCurrentOrganization and fetches details', async () => {
    const org = makeOrg({ id: 'org-1', name: 'Acme' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('select-org-1'))

    await waitFor(() => {
      expect(mockSetCurrentOrganization).toHaveBeenCalledWith(org)
      expect(mockFetchMembers).toHaveBeenCalledWith('org-1')
      expect(mockFetchStats).toHaveBeenCalledWith('org-1')
    })
  })

  it('shows "Select an organization to view details" when no org is selected', () => {
    mockOrganizations = [makeOrg()]
    // Keep currentOrganization null
    mockCurrentOrganization = null
    render(<OrganizationsPage />)
    expect(screen.getByText('Select an organization to view details')).toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Organization detail header
  // ────────────────────────────────────────────

  it('renders the org name and slug in the header', () => {
    const org = makeOrg({ name: 'Acme Corp', slug: 'acme-corp' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    render(<OrganizationsPage />)
    // The org name appears in both the card and the header h1; target the header specifically
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Corp' })).toBeInTheDocument()
    expect(screen.getByText('@acme-corp')).toBeInTheDocument()
  })

  it('renders colored icon when no logo_url is set', () => {
    const org = makeOrg({ logo_url: null, primary_color: '#ff0000' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    const { container } = render(<OrganizationsPage />)
    // The colored div should have the background color
    const coloredDiv = container.querySelector('[style*="background-color"]')
    expect(coloredDiv).toBeInTheDocument()
  })

  it('renders logo image when logo_url is set', () => {
    const org = makeOrg({ logo_url: 'https://example.com/logo.png' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    render(<OrganizationsPage />)
    const img = screen.getByAltText('Acme Corp')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png')
  })

  // ────────────────────────────────────────────
  // Admin vs regular user (canManageOrg)
  // ────────────────────────────────────────────

  it('shows Edit button in header when user is admin', () => {
    const org = makeOrg()
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockGetCurrentUserRole.mockReturnValue('admin')
    render(<OrganizationsPage />)
    // "Edit" appears in both the card mock and the header; verify header Edit exists
    const editButtons = screen.getAllByText('Edit')
    const headerEdit = editButtons.find((el) => !el.closest('[data-testid]'))
    expect(headerEdit).toBeTruthy()
  })

  it('shows Edit button in header when user is owner', () => {
    const org = makeOrg()
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockGetCurrentUserRole.mockReturnValue('owner')
    render(<OrganizationsPage />)
    // "Edit" appears in both the card mock and the header; verify header Edit exists
    const editButtons = screen.getAllByText('Edit')
    const headerEdit = editButtons.find((el) => !el.closest('[data-testid]'))
    expect(headerEdit).toBeTruthy()
  })

  it('hides Edit button in header when user is regular member', () => {
    const org = makeOrg()
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockGetCurrentUserRole.mockReturnValue('member')
    render(<OrganizationsPage />)
    // The header-level Edit button should not be present
    // (Note: the card still has an edit button from mock, so we check for the header one specifically)
    const editButtons = screen.queryAllByText('Edit')
    // Only the card-level edit button should exist, not the header one
    const headerEdit = editButtons.filter(
      (el) => el.closest('.px-6.py-4') !== null
    )
    expect(headerEdit.length).toBe(0)
  })

  it('clicking header Edit button calls setModalMode("edit")', () => {
    const org = makeOrg()
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockGetCurrentUserRole.mockReturnValue('owner')
    render(<OrganizationsPage />)

    // The header Edit button (not the card one)
    const headerEdit = screen.getAllByText('Edit').find(
      (el) => !el.closest('[data-testid]')
    )
    expect(headerEdit).toBeTruthy()
    fireEvent.click(headerEdit!)
    expect(mockSetModalMode).toHaveBeenCalledWith('edit')
  })

  // ────────────────────────────────────────────
  // Tabs
  // ────────────────────────────────────────────

  it('renders all three tabs when an org is selected', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    render(<OrganizationsPage />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('clicking a tab calls setActiveTab with the tab id', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByText('Members'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('members')

    fireEvent.click(screen.getByText('Settings'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('settings')

    fireEvent.click(screen.getByText('Overview'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('overview')
  })

  // ────────────────────────────────────────────
  // Overview tab
  // ────────────────────────────────────────────

  it('shows description in overview tab when org has description', () => {
    mockCurrentOrganization = makeOrg({ description: 'Great company' })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'overview'
    render(<OrganizationsPage />)
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Great company')).toBeInTheDocument()
  })

  it('does not show About section when org description is null', () => {
    mockCurrentOrganization = makeOrg({ description: null })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'overview'
    render(<OrganizationsPage />)
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  it('renders OrganizationStats, QuotaStatusPanel, MemberUsagePanel in overview', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'overview'
    render(<OrganizationsPage />)
    expect(screen.getByTestId('org-stats')).toBeInTheDocument()
    expect(screen.getByTestId('quota-panel')).toBeInTheDocument()
    expect(screen.getByTestId('member-usage')).toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Members tab
  // ────────────────────────────────────────────

  it('renders MemberList when members tab is active', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'members'
    render(<OrganizationsPage />)
    expect(screen.getByTestId('member-list')).toBeInTheDocument()
  })

  it('MemberList invite button calls setModalMode("invite")', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'members'
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('invite-btn'))
    expect(mockSetModalMode).toHaveBeenCalledWith('invite')
  })

  it('MemberList updateRole calls updateMemberRole with org id', () => {
    const org = makeOrg({ id: 'org-x' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockActiveTab = 'members'
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('update-role-btn'))
    expect(mockUpdateMemberRole).toHaveBeenCalledWith('org-x', 'member-1', 'admin')
  })

  it('MemberList remove calls removeMember with org id', () => {
    const org = makeOrg({ id: 'org-x' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockActiveTab = 'members'
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('remove-member-btn'))
    expect(mockRemoveMember).toHaveBeenCalledWith('org-x', 'member-1')
  })

  it('passes currentUserRole to MemberList', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'members'
    mockGetCurrentUserRole.mockReturnValue('admin')
    render(<OrganizationsPage />)

    expect(screen.getByTestId('member-role')).toHaveTextContent('admin')
  })

  // ────────────────────────────────────────────
  // Settings tab
  // ────────────────────────────────────────────

  it('renders contact info in settings tab', () => {
    mockCurrentOrganization = makeOrg({
      contact_name: 'John Doe',
      contact_email: 'john@acme.com',
    })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    render(<OrganizationsPage />)

    expect(screen.getByText('Contact Information')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@acme.com')).toBeInTheDocument()
  })

  it('shows dash for missing contact info', () => {
    mockCurrentOrganization = makeOrg({
      contact_name: null,
      contact_email: null,
    })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    render(<OrganizationsPage />)

    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders plan limits in settings tab', () => {
    mockCurrentOrganization = makeOrg({
      max_members: 50,
      max_projects: 20,
      max_sessions_per_day: 1000,
      max_tokens_per_month: 500000,
    })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    render(<OrganizationsPage />)

    expect(screen.getByText('Plan Limits')).toBeInTheDocument()
    expect(screen.getByText('Max Members')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('Max Projects')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('Max Sessions/Day')).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('Max Tokens/Month')).toBeInTheDocument()
    expect(screen.getByText('500,000')).toBeInTheDocument()
  })

  it('shows "Unlimited" for plan limits set to -1', () => {
    mockCurrentOrganization = makeOrg({
      max_members: -1,
      max_projects: -1,
      max_sessions_per_day: -1,
      max_tokens_per_month: -1,
    })
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    render(<OrganizationsPage />)

    const unlimitedItems = screen.getAllByText('Unlimited')
    expect(unlimitedItems.length).toBe(4)
  })

  it('shows Danger Zone when user is admin', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('admin')
    render(<OrganizationsPage />)

    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByText('Delete Organization')).toBeInTheDocument()
  })

  it('shows Danger Zone when user is owner', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('owner')
    render(<OrganizationsPage />)

    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
  })

  it('hides Danger Zone when user is regular member', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('member')
    render(<OrganizationsPage />)

    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
  })

  it('hides Danger Zone when user is viewer', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('viewer')
    render(<OrganizationsPage />)

    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Delete organization flow
  // ────────────────────────────────────────────

  it('clicking Delete on org card shows delete confirmation dialog', () => {
    const org = makeOrg({ id: 'org-1' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('delete-org-1'))
    // The confirmation dialog should appear
    expect(screen.getByText('Delete Organization', { selector: 'h3' })).toBeInTheDocument()
    expect(
      screen.getByText(/Are you sure you want to delete this organization/)
    ).toBeInTheDocument()
  })

  it('clicking Cancel in delete dialog closes it', () => {
    const org = makeOrg({ id: 'org-1' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    // Open dialog
    fireEvent.click(screen.getByTestId('delete-org-1'))
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument()

    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'))
    // The dialog should be gone
    expect(screen.queryByText(/Are you sure/)).not.toBeInTheDocument()
  })

  it('clicking Delete in confirmation dialog calls deleteOrganization', async () => {
    const org = makeOrg({ id: 'org-del' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    // Open dialog
    fireEvent.click(screen.getByTestId('delete-org-del'))

    // Click the Delete button inside the dialog
    const deleteButtons = screen.getAllByText('Delete')
    // The last "Delete" button is in the confirmation dialog
    const confirmDeleteBtn = deleteButtons[deleteButtons.length - 1]
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(mockDeleteOrganization).toHaveBeenCalledWith('org-del')
    })
  })

  it('shows "Deleting..." text on confirm button when isLoading', () => {
    mockIsLoading = true
    const org = makeOrg({ id: 'org-1' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    // Open dialog
    fireEvent.click(screen.getByTestId('delete-org-1'))
    expect(screen.getByText('Deleting...')).toBeInTheDocument()
  })

  it('clicking Delete Organization in settings danger zone opens confirmation', () => {
    const org = makeOrg({ id: 'org-settings' })
    mockCurrentOrganization = org
    mockOrganizations = [org]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('owner')
    render(<OrganizationsPage />)

    // Click the Danger Zone delete button
    fireEvent.click(screen.getByText('Delete Organization'))

    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Edit org from card
  // ────────────────────────────────────────────

  it('clicking edit on a card calls setCurrentOrganization and setModalMode("edit")', () => {
    const org = makeOrg({ id: 'org-1' })
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('edit-org-1'))
    expect(mockSetCurrentOrganization).toHaveBeenCalledWith(org)
    expect(mockSetModalMode).toHaveBeenCalledWith('edit')
  })

  // ────────────────────────────────────────────
  // Create/Edit Organization Modal
  // ────────────────────────────────────────────

  it('renders OrganizationFormModal when modalMode is "create"', () => {
    mockModalMode = 'create'
    render(<OrganizationsPage />)
    expect(screen.getByTestId('org-form-modal')).toBeInTheDocument()
    expect(screen.getByTestId('form-mode')).toHaveTextContent('create')
  })

  it('renders OrganizationFormModal when modalMode is "edit"', () => {
    mockModalMode = 'edit'
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    render(<OrganizationsPage />)
    expect(screen.getByTestId('org-form-modal')).toBeInTheDocument()
    expect(screen.getByTestId('form-mode')).toHaveTextContent('edit')
  })

  it('does not render OrganizationFormModal when modalMode is null', () => {
    mockModalMode = null
    render(<OrganizationsPage />)
    expect(screen.queryByTestId('org-form-modal')).not.toBeInTheDocument()
  })

  it('closing the form modal calls setModalMode(null)', () => {
    mockModalMode = 'create'
    render(<OrganizationsPage />)
    fireEvent.click(screen.getByTestId('form-close'))
    expect(mockSetModalMode).toHaveBeenCalledWith(null)
  })

  it('submitting the create form calls createOrganization with correct request', async () => {
    mockModalMode = 'create'
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith({
        organization: { name: 'New Org', slug: 'new-org' },
        owner_user_id: '1',
        owner_email: 'test@test.com',
        owner_name: 'Test User',
      })
    })
  })

  it('create form does not submit if user has no id', async () => {
    mockModalMode = 'create'
    mockUser = { id: '', email: 'test@test.com', name: 'Test User' }
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockCreateOrganization).not.toHaveBeenCalled()
    })
  })

  it('create form does not submit if user has no email', async () => {
    mockModalMode = 'create'
    mockUser = { id: '1', email: '', name: 'Test User' }
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockCreateOrganization).not.toHaveBeenCalled()
    })
  })

  it('submitting the edit form calls updateOrganization', async () => {
    const org = makeOrg({ id: 'org-edit' })
    mockModalMode = 'edit'
    mockCurrentOrganization = org
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledWith('org-edit', {
        name: 'New Org',
        slug: 'new-org',
      })
    })
  })

  // ────────────────────────────────────────────
  // Invite Member Modal
  // ────────────────────────────────────────────

  it('renders InviteMemberModal when modalMode is "invite" and org is selected', () => {
    mockModalMode = 'invite'
    mockCurrentOrganization = makeOrg({ name: 'Acme Corp' })
    mockOrganizations = [mockCurrentOrganization]
    render(<OrganizationsPage />)
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
    expect(screen.getByTestId('invite-org-name')).toHaveTextContent('Acme Corp')
  })

  it('does not render InviteMemberModal when modalMode is "invite" but no org selected', () => {
    mockModalMode = 'invite'
    mockCurrentOrganization = null
    render(<OrganizationsPage />)
    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument()
  })

  it('closing the invite modal calls setModalMode(null)', () => {
    mockModalMode = 'invite'
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    render(<OrganizationsPage />)
    fireEvent.click(screen.getByTestId('invite-close'))
    expect(mockSetModalMode).toHaveBeenCalledWith(null)
  })

  it('submitting invite calls inviteMember with org id and user id', () => {
    const org = makeOrg({ id: 'org-invite' })
    mockModalMode = 'invite'
    mockCurrentOrganization = org
    mockOrganizations = [org]
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('invite-submit'))
    expect(mockInviteMember).toHaveBeenCalledWith(
      'org-invite',
      { email: 'new@test.com', role: 'member' },
      '1'
    )
  })

  // ────────────────────────────────────────────
  // Tab content exclusivity
  // ────────────────────────────────────────────

  it('overview tab does not show member-list or settings content', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'overview'
    render(<OrganizationsPage />)
    expect(screen.getByTestId('org-stats')).toBeInTheDocument()
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument()
    expect(screen.queryByText('Contact Information')).not.toBeInTheDocument()
  })

  it('members tab does not show overview or settings content', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'members'
    render(<OrganizationsPage />)
    expect(screen.getByTestId('member-list')).toBeInTheDocument()
    expect(screen.queryByTestId('org-stats')).not.toBeInTheDocument()
    expect(screen.queryByText('Contact Information')).not.toBeInTheDocument()
  })

  it('settings tab does not show overview or member-list content', () => {
    mockCurrentOrganization = makeOrg()
    mockOrganizations = [mockCurrentOrganization]
    mockActiveTab = 'settings'
    mockGetCurrentUserRole.mockReturnValue('member')
    render(<OrganizationsPage />)
    expect(screen.getByText('Contact Information')).toBeInTheDocument()
    expect(screen.queryByTestId('org-stats')).not.toBeInTheDocument()
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument()
  })

  // ────────────────────────────────────────────
  // Owner name handling in create
  // ────────────────────────────────────────────

  it('passes owner_name as undefined when user.name is empty string', async () => {
    mockModalMode = 'create'
    mockUser = { id: '1', email: 'test@test.com', name: '' }
    render(<OrganizationsPage />)

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_name: undefined,
        })
      )
    })
  })
})
