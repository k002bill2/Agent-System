import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLMAccessSettings } from '../LLMAccessSettings'

const {
  mockFetchSummary,
  mockFetchAccess,
  mockUpdateEntitlement,
  mockCreateProfile,
  mockUpdateProfile,
  mockDeleteProfile,
  mockCheckProfileHealth,
  mockSetDefaultModel,
  getMockStoreState,
  setMockStoreState,
  getMockAccessStoreState,
  setMockAccessStoreState,
  getMockSettingsState,
  setMockSettingsState,
  getMockAuthState,
  setMockAuthState,
  mockFetchUserMemberships,
  mockFetchMembers,
  getMockOrganizationsState,
  setMockOrganizationsState,
} = vi.hoisted(() => {
  const mockFetchSummary = vi.fn()
  const mockFetchAccess = vi.fn()
  const mockUpdateEntitlement = vi.fn()
  const mockCreateProfile = vi.fn()
  const mockUpdateProfile = vi.fn()
  const mockDeleteProfile = vi.fn()
  const mockCheckProfileHealth = vi.fn()
  const mockSetDefaultModel = vi.fn()
  const mockFetchUserMemberships = vi.fn()
  const mockFetchMembers = vi.fn()
  let mockStoreState = {
    summary: null as unknown,
    isLoading: false,
    error: null as string | null,
    fetchSummary: mockFetchSummary,
  }
  let mockAccessStoreState = {
    access: null as unknown,
    isLoading: false,
    error: null as string | null,
    fetchAccess: mockFetchAccess,
    updateEntitlement: mockUpdateEntitlement,
    createProfile: mockCreateProfile,
    updateProfile: mockUpdateProfile,
    deleteProfile: mockDeleteProfile,
    checkProfileHealth: mockCheckProfileHealth,
  }
  let mockSettingsState = {
    availableModels: [] as unknown[],
    modelsLoading: false,
    setDefaultModel: mockSetDefaultModel,
  }
  let mockAuthState = {
    user: {
      id: 'admin-1',
      role: 'admin',
      is_admin: true,
      is_org_admin: true,
    } as unknown,
  }
  let mockOrganizationsState = {
    userMemberships: [] as unknown[],
    members: [] as unknown[],
    fetchUserMemberships: mockFetchUserMemberships,
    fetchMembers: mockFetchMembers,
  }

  return {
    mockFetchSummary,
    mockFetchAccess,
    mockUpdateEntitlement,
    mockCreateProfile,
    mockUpdateProfile,
    mockDeleteProfile,
    mockCheckProfileHealth,
    mockSetDefaultModel,
    getMockStoreState: () => mockStoreState,
    setMockStoreState: (state: typeof mockStoreState) => {
      mockStoreState = state
    },
    getMockAccessStoreState: () => mockAccessStoreState,
    setMockAccessStoreState: (state: typeof mockAccessStoreState) => {
      mockAccessStoreState = state
    },
    getMockSettingsState: () => mockSettingsState,
    setMockSettingsState: (state: typeof mockSettingsState) => {
      mockSettingsState = state
    },
    getMockAuthState: () => mockAuthState,
    setMockAuthState: (state: typeof mockAuthState) => {
      mockAuthState = state
    },
    mockFetchUserMemberships,
    mockFetchMembers,
    getMockOrganizationsState: () => mockOrganizationsState,
    setMockOrganizationsState: (state: typeof mockOrganizationsState) => {
      mockOrganizationsState = state
    },
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => getMockAuthState(),
}))

vi.mock('@/stores/llmAccess', () => ({
  useLLMAccessStore: () => getMockAccessStoreState(),
}))

vi.mock('@/stores/llmUsage', () => ({
  useLLMUsageStore: () => getMockStoreState(),
}))

vi.mock('@/stores/organizations', () => ({
  useOrganizationsStore: () => getMockOrganizationsState(),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => getMockSettingsState(),
}))

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    Activity: icon('activity'),
    AlertCircle: icon('alert'),
    CheckCircle: icon('check'),
    Loader2: icon('loader'),
    Plus: icon('plus'),
    RefreshCw: icon('refresh'),
    Save: icon('save'),
    ShieldCheck: icon('shield'),
    Terminal: icon('terminal'),
    Trash2: icon('trash'),
  }
})

const summary = {
  period_start: '2026-07-01T00:00:00Z',
  period_end: '2026-07-02T00:00:00Z',
  total_requests: 4,
  total_input_tokens: 1000,
  total_output_tokens: 500,
  total_tokens: 1500,
  estimated_cost_usd: 0.02,
  provider_breakdown: {
    codex_cli: {
      total_requests: 3,
      total_input_tokens: 800,
      total_output_tokens: 400,
      total_tokens: 1200,
      estimated_cost_usd: 0,
    },
    openai: {
      total_requests: 1,
      total_input_tokens: 200,
      total_output_tokens: 100,
      total_tokens: 300,
      estimated_cost_usd: 0.02,
    },
  },
  source_breakdown: {
    playground: {
      total_requests: 2,
      total_input_tokens: 400,
      total_output_tokens: 200,
      total_tokens: 600,
      estimated_cost_usd: 0,
    },
    task_analyzer: {
      total_requests: 1,
      total_input_tokens: 300,
      total_output_tokens: 100,
      total_tokens: 400,
      estimated_cost_usd: 0,
    },
  },
  member_breakdown: {},
  organization_breakdown: {},
  mode_breakdown: {
    cli: {
      total_requests: 3,
      total_input_tokens: 800,
      total_output_tokens: 400,
      total_tokens: 1200,
      estimated_cost_usd: 0,
    },
    api: {
      total_requests: 1,
      total_input_tokens: 200,
      total_output_tokens: 100,
      total_tokens: 300,
      estimated_cost_usd: 0.02,
    },
  },
  model_breakdown: {},
  status_breakdown: {},
}

const access = {
  user_id: 'user-1',
  api_fallback_enabled: false,
  profiles: [
    {
      id: 'profile-1',
      owner_user_id: 'user-1',
      organization_id: null,
      provider: 'codex_cli',
      profile_name: 'Default Codex CLI',
      command: 'codex',
      args_json: ['exec'],
      working_directory: null,
      auth_status: 'connected',
      metadata: {},
      created_at: '2026-07-02T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
    },
  ],
  entitlements: [
    {
      id: 'ent-1',
      user_id: 'user-1',
      organization_id: null,
      provider: 'codex_cli',
      mode: 'cli',
      source_scope: 'all',
      enabled: true,
      cli_profile_id: 'profile-1',
      allow_api_fallback: false,
      quota_policy_id: null,
      created_at: '2026-07-02T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
    },
  ],
}

describe('LLMAccessSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setMockStoreState({
      summary: null,
      isLoading: false,
      error: null,
      fetchSummary: mockFetchSummary,
    })
    setMockAccessStoreState({
      access: null,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    setMockSettingsState({
      availableModels: [],
      modelsLoading: false,
      setDefaultModel: mockSetDefaultModel,
    })
    setMockAuthState({
      user: {
        id: 'admin-1',
        role: 'admin',
        is_admin: true,
        is_org_admin: true,
      },
    })
    setMockOrganizationsState({
      userMemberships: [],
      members: [],
      fetchUserMemberships: mockFetchUserMemberships,
      fetchMembers: mockFetchMembers,
    })
  })

  it('fetches internal usage summary and access on mount', () => {
    render(<LLMAccessSettings />)
    expect(mockFetchSummary).toHaveBeenCalledWith({})
    expect(mockFetchAccess).toHaveBeenCalled()
  })

  it('refreshes internal usage summary and access from toolbar', () => {
    render(<LLMAccessSettings />)
    vi.clearAllMocks()

    fireEvent.click(screen.getByLabelText('Refresh LLM access usage'))

    expect(mockFetchSummary).toHaveBeenCalledWith({})
    expect(mockFetchAccess).toHaveBeenCalledTimes(1)
  })

  it('filters usage summary by selected organization scope', async () => {
    setMockOrganizationsState({
      userMemberships: [
        {
          id: 'member-1',
          organization_id: 'org-1',
          user_id: 'admin-1',
          role: 'admin',
        },
        {
          id: 'member-2',
          organization_id: 'org-2',
          user_id: 'admin-1',
          role: 'admin',
        },
      ],
      members: [],
      fetchUserMemberships: mockFetchUserMemberships,
      fetchMembers: mockFetchMembers,
    })
    render(<LLMAccessSettings />)
    mockFetchSummary.mockClear()

    fireEvent.change(screen.getByLabelText('LLM usage organization scope'), {
      target: { value: 'org-2' },
    })

    await waitFor(() =>
      expect(mockFetchSummary).toHaveBeenCalledWith({ organizationId: 'org-2' })
    )
  })

  it('renders CLI-first access status', () => {
    render(<LLMAccessSettings />)
    expect(screen.getByText('LLM Access')).toBeInTheDocument()
    expect(screen.getByText('CLI subscription')).toBeInTheDocument()
    expect(screen.getByText('Internal ledger')).toBeInTheDocument()
  })

  it('renders mode and source breakdown from summary', () => {
    setMockStoreState({
      summary,
      isLoading: false,
      error: null,
      fetchSummary: mockFetchSummary,
    })
    render(<LLMAccessSettings />)

    expect(screen.getByText('1.5K')).toBeInTheDocument()
    expect(screen.getByText('cli')).toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()
    expect(screen.getByText('playground')).toBeInTheDocument()
    expect(screen.getByText('task_analyzer')).toBeInTheDocument()
  })

  it('renders access profile and entitlement state', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    expect(screen.getAllByText('Default Codex CLI').length).toBeGreaterThan(0)
    expect(screen.getByText('codex exec')).toBeInTheDocument()
    expect(screen.getByText('connected')).toBeInTheDocument()
    expect(screen.getByText('codex_cli')).toBeInTheDocument()
    expect(screen.getByText('cli / all')).toBeInTheDocument()
  })

  it('runs a CLI auth health check from the active profile panel', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.click(screen.getByLabelText('Check CLI auth for Default Codex CLI'))

    expect(mockCheckProfileHealth).toHaveBeenCalledWith('profile-1')
  })

  it('updates active CLI profile runtime settings', () => {
    const accessWithRuntimeProfile = {
      ...access,
      profiles: [
        {
          ...access.profiles[0],
          args_json: ['exec', '--sandbox', 'read-only', '--color', 'never'],
          working_directory: '/workspace/old',
          metadata: {
            health_check: { message: 'ok' },
            sandbox_preset: 'read-only',
          },
        },
      ],
    }
    setMockAccessStoreState({
      access: accessWithRuntimeProfile,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('Working directory for Default Codex CLI'), {
      target: { value: '/workspace/aos' },
    })
    fireEvent.change(screen.getByLabelText('Sandbox preset for Default Codex CLI'), {
      target: { value: 'workspace-write' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(mockUpdateProfile).toHaveBeenCalledWith('profile-1', {
      working_directory: '/workspace/aos',
      args_json: ['exec', '--color', 'never', '--sandbox', 'workspace-write'],
      metadata: {
        health_check: { message: 'ok' },
        sandbox_preset: 'workspace-write',
      },
    })
  })

  it('renders the full CLI profile list and deletes a selected profile', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    const accessWithProfiles = {
      ...access,
      profiles: [
        access.profiles[0],
        {
          ...access.profiles[0],
          id: 'profile-2',
          profile_name: 'Team Codex CLI',
          owner_user_id: null,
          organization_id: 'org-1',
        },
      ],
    }
    setMockAccessStoreState({
      access: accessWithProfiles,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    expect(screen.getAllByText('Team Codex CLI').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Delete CLI profile Team Codex CLI'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(mockDeleteProfile).toHaveBeenCalledWith('profile-2')
    confirmSpy.mockRestore()
  })

  it('updates persisted entitlement when enabled toggle changes', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.click(screen.getByLabelText('Toggle codex_cli all access'))

    expect(mockUpdateEntitlement).toHaveBeenCalledWith('ent-1', { enabled: false })
  })

  it('updates entitlement CLI profile selection', () => {
    const accessWithProfiles = {
      ...access,
      profiles: [
        access.profiles[0],
        {
          ...access.profiles[0],
          id: 'profile-2',
          profile_name: 'Team Codex CLI',
          owner_user_id: null,
          organization_id: 'org-1',
        },
      ],
    }
    setMockAccessStoreState({
      access: accessWithProfiles,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('CLI profile for codex_cli all'), {
      target: { value: 'profile-2' },
    })

    expect(mockUpdateEntitlement).toHaveBeenCalledWith('ent-1', {
      cli_profile_id: 'profile-2',
    })
  })

  it('updates entitlement API fallback permission', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.click(screen.getByLabelText('Allow API fallback for codex_cli all'))

    expect(mockUpdateEntitlement).toHaveBeenCalledWith('ent-1', {
      allow_api_fallback: true,
    })
  })

  it('creates a CLI profile from the inline form', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('New CLI profile name'), {
      target: { value: 'Team Codex CLI' },
    })
    fireEvent.change(screen.getByLabelText('New CLI args'), {
      target: { value: 'exec --color never' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create CLI profile' }))

    expect(mockCreateProfile).toHaveBeenCalledWith({
      provider: 'codex_cli',
      profile_name: 'Team Codex CLI',
      command: 'codex',
      args_json: ['exec', '--color', 'never'],
      owner_user_id: 'user-1',
    })
  })

  it('loads organization memberships for managers', () => {
    render(<LLMAccessSettings />)
    expect(mockFetchUserMemberships).toHaveBeenCalledWith('admin-1')
  })

  it('creates an organization-scoped CLI profile with runtime settings', () => {
    setMockOrganizationsState({
      userMemberships: [
        {
          id: 'member-1',
          organization_id: 'org-1',
          user_id: 'admin-1',
          role: 'admin',
        },
      ],
      members: [],
      fetchUserMemberships: mockFetchUserMemberships,
      fetchMembers: mockFetchMembers,
    })
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('New CLI profile name'), {
      target: { value: 'Team Codex CLI' },
    })
    fireEvent.change(screen.getByLabelText('New CLI profile scope'), {
      target: { value: 'org-1' },
    })
    fireEvent.change(screen.getByLabelText('New CLI working directory'), {
      target: { value: '/workspace/team' },
    })
    fireEvent.change(screen.getByLabelText('New CLI sandbox preset'), {
      target: { value: 'workspace-write' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create CLI profile' }))

    expect(mockCreateProfile).toHaveBeenCalledWith({
      provider: 'codex_cli',
      profile_name: 'Team Codex CLI',
      command: 'codex',
      args_json: ['exec', '--color', 'never', '--sandbox', 'workspace-write'],
      organization_id: 'org-1',
      working_directory: '/workspace/team',
      metadata: { sandbox_preset: 'workspace-write' },
    })
  })

  it('creates a member-delegated organization CLI profile', () => {
    setMockOrganizationsState({
      userMemberships: [
        {
          id: 'admin-member',
          organization_id: 'org-1',
          user_id: 'admin-1',
          role: 'admin',
        },
      ],
      members: [
        {
          id: 'member-2',
          organization_id: 'org-1',
          user_id: 'user-2',
          email: 'member@example.com',
          name: 'Member Two',
          role: 'member',
        },
      ],
      fetchUserMemberships: mockFetchUserMemberships,
      fetchMembers: mockFetchMembers,
    })
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('New CLI profile name'), {
      target: { value: 'Member Codex CLI' },
    })
    fireEvent.change(screen.getByLabelText('New CLI profile scope'), {
      target: { value: 'org-1' },
    })
    fireEvent.change(screen.getByLabelText('New CLI profile owner'), {
      target: { value: 'user-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create CLI profile' }))

    expect(mockFetchMembers).toHaveBeenCalledWith('org-1')
    expect(mockCreateProfile).toHaveBeenCalledWith({
      provider: 'codex_cli',
      profile_name: 'Member Codex CLI',
      command: 'codex',
      args_json: ['exec', '--color', 'never'],
      organization_id: 'org-1',
      owner_user_id: 'user-2',
    })
  })

  it('updates the default model for the active CLI provider', () => {
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    setMockSettingsState({
      availableModels: [
        {
          id: 'codex-cli',
          display_name: 'Codex CLI',
          provider: 'codex_cli',
          is_default: true,
        },
        {
          id: 'codex-cli-pro',
          display_name: 'Codex CLI Pro',
          provider: 'codex_cli',
          is_default: false,
        },
      ],
      modelsLoading: false,
      setDefaultModel: mockSetDefaultModel,
    })
    render(<LLMAccessSettings />)

    fireEvent.change(screen.getByLabelText('Default model for codex_cli'), {
      target: { value: 'codex-cli-pro' },
    })

    expect(mockSetDefaultModel).toHaveBeenCalledWith('codex-cli-pro')
  })

  it('disables access editing for non-manager users', () => {
    setMockAuthState({
      user: {
        id: 'user-1',
        role: 'user',
        is_admin: false,
        is_org_admin: false,
      },
    })
    setMockAccessStoreState({
      access,
      isLoading: false,
      error: null,
      fetchAccess: mockFetchAccess,
      updateEntitlement: mockUpdateEntitlement,
      createProfile: mockCreateProfile,
      updateProfile: mockUpdateProfile,
      deleteProfile: mockDeleteProfile,
      checkProfileHealth: mockCheckProfileHealth,
    })
    render(<LLMAccessSettings />)

    expect(screen.getByLabelText('Toggle codex_cli all access')).toBeDisabled()
    expect(screen.getByLabelText('Allow API fallback for codex_cli all')).toBeDisabled()
    expect(screen.getByLabelText('CLI profile for codex_cli all')).toBeDisabled()
  })

  it('shows loading state', () => {
    setMockStoreState({
      summary: null,
      isLoading: true,
      error: null,
      fetchSummary: mockFetchSummary,
    })
    render(<LLMAccessSettings />)
    expect(screen.getByText('Loading internal usage...')).toBeInTheDocument()
  })

  it('shows error state', () => {
    setMockStoreState({
      summary: null,
      isLoading: false,
      error: 'failed',
      fetchSummary: mockFetchSummary,
    })
    render(<LLMAccessSettings />)
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('refreshes summary when refresh button is clicked', () => {
    render(<LLMAccessSettings />)
    fireEvent.click(screen.getByLabelText('Refresh LLM access usage'))
    expect(mockFetchSummary).toHaveBeenCalledTimes(2)
  })
})
