import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLLMAccessStore } from '../llmAccess'

const { mockDelete, mockGet, mockPatch, mockPost } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({
  apiClient: {
    get: mockGet,
    patch: mockPatch,
    post: mockPost,
    delete: mockDelete,
  },
}))

const accessResponse = {
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
      auth_status: 'unknown',
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

describe('llmAccess store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLLMAccessStore.setState({
      access: null,
      isLoading: false,
      error: null,
      lastFetched: null,
    })
  })

  it('fetches current user LLM access', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)

    await useLLMAccessStore.getState().fetchAccess()

    expect(mockGet).toHaveBeenCalledWith('/api/llm-access/me')
    expect(useLLMAccessStore.getState().access?.profiles[0].provider).toBe('codex_cli')
    expect(useLLMAccessStore.getState().lastFetched).toBeInstanceOf(Date)
  })

  it('passes organization filter when provided', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)

    await useLLMAccessStore.getState().fetchAccess({ organizationId: 'org-1' })

    expect(mockGet).toHaveBeenCalledWith('/api/llm-access/me?organization_id=org-1')
  })

  it('updates entitlement and refreshes local state', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)
    await useLLMAccessStore.getState().fetchAccess()

    mockPatch.mockResolvedValueOnce({
      ...accessResponse.entitlements[0],
      enabled: false,
    })

    await useLLMAccessStore.getState().updateEntitlement('ent-1', { enabled: false })

    expect(mockPatch).toHaveBeenCalledWith('/api/llm-access/entitlements/ent-1', {
      enabled: false,
    })
    expect(useLLMAccessStore.getState().access?.entitlements[0].enabled).toBe(false)
  })

  it('creates a CLI profile and appends it to current access', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)
    await useLLMAccessStore.getState().fetchAccess()

    const createdProfile = {
      ...accessResponse.profiles[0],
      id: 'profile-2',
      profile_name: 'Team Codex CLI',
      owner_user_id: null,
      organization_id: 'org-1',
    }
    const createdEntitlement = {
      ...accessResponse.entitlements[0],
      id: 'ent-2',
      organization_id: 'org-1',
      cli_profile_id: 'profile-2',
    }
    mockPost
      .mockResolvedValueOnce(createdProfile)
      .mockResolvedValueOnce(createdEntitlement)

    await useLLMAccessStore.getState().createProfile({
      provider: 'codex_cli',
      profile_name: 'Team Codex CLI',
      command: 'codex',
      args_json: ['exec', '--color', 'never'],
      organization_id: 'org-1',
    })

    expect(mockPost).toHaveBeenCalledWith('/api/llm-access/profiles', {
      provider: 'codex_cli',
      profile_name: 'Team Codex CLI',
      command: 'codex',
      args_json: ['exec', '--color', 'never'],
      organization_id: 'org-1',
    })
    expect(mockPost).toHaveBeenCalledWith('/api/llm-access/entitlements', {
      user_id: 'user-1',
      organization_id: 'org-1',
      provider: 'codex_cli',
      mode: 'cli',
      source_scope: 'all',
      enabled: true,
      cli_profile_id: 'profile-2',
      allow_api_fallback: false,
    })
    expect(useLLMAccessStore.getState().access?.profiles).toHaveLength(2)
    expect(useLLMAccessStore.getState().access?.profiles[1].id).toBe('profile-2')
    expect(useLLMAccessStore.getState().access?.entitlements).toHaveLength(2)
    expect(useLLMAccessStore.getState().access?.entitlements[1].id).toBe('ent-2')
  })

  it('creates a claude_cli profile and threads the provider through the auto entitlement', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)
    await useLLMAccessStore.getState().fetchAccess()

    const createdProfile = {
      ...accessResponse.profiles[0],
      id: 'profile-claude',
      provider: 'claude_cli',
      profile_name: 'Team Claude CLI',
      command: 'claude',
      args_json: ['-p', '--output-format', 'text'],
      owner_user_id: 'user-1',
    }
    const createdEntitlement = {
      ...accessResponse.entitlements[0],
      id: 'ent-claude',
      provider: 'claude_cli',
      cli_profile_id: 'profile-claude',
    }
    mockPost
      .mockResolvedValueOnce(createdProfile)
      .mockResolvedValueOnce(createdEntitlement)

    await useLLMAccessStore.getState().createProfile({
      provider: 'claude_cli',
      profile_name: 'Team Claude CLI',
      command: 'claude',
      args_json: ['-p', '--output-format', 'text'],
      owner_user_id: 'user-1',
    })

    // The provider literal must reach the backend verbatim on both the profile
    // create and the derived auto-entitlement (provider-generic store path).
    expect(mockPost).toHaveBeenCalledWith('/api/llm-access/profiles', {
      provider: 'claude_cli',
      profile_name: 'Team Claude CLI',
      command: 'claude',
      args_json: ['-p', '--output-format', 'text'],
      owner_user_id: 'user-1',
    })
    expect(mockPost).toHaveBeenCalledWith('/api/llm-access/entitlements', {
      user_id: 'user-1',
      organization_id: null,
      provider: 'claude_cli',
      mode: 'cli',
      source_scope: 'all',
      enabled: true,
      cli_profile_id: 'profile-claude',
      allow_api_fallback: false,
    })
    expect(useLLMAccessStore.getState().access?.profiles[1].provider).toBe('claude_cli')
    expect(useLLMAccessStore.getState().access?.entitlements[1].provider).toBe('claude_cli')
  })

  it('does not auto-create an entitlement when a persisted match already exists', async () => {
    const accessWithPersistedEntitlement = {
      ...accessResponse,
      entitlements: [
        {
          ...accessResponse.entitlements[0],
          id: 'ent-persisted',
          organization_id: 'org-1',
        },
      ],
    }
    mockGet.mockResolvedValueOnce(accessWithPersistedEntitlement)
    await useLLMAccessStore.getState().fetchAccess()

    const createdProfile = {
      ...accessResponse.profiles[0],
      id: 'profile-2',
      profile_name: 'Team Codex CLI',
      owner_user_id: null,
      organization_id: 'org-1',
    }
    mockPost.mockResolvedValueOnce(createdProfile)

    await useLLMAccessStore.getState().createProfile({
      provider: 'codex_cli',
      profile_name: 'Team Codex CLI',
      command: 'codex',
      organization_id: 'org-1',
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(useLLMAccessStore.getState().access?.entitlements).toHaveLength(1)
  })

  it('updates a CLI profile and refreshes local state', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)
    await useLLMAccessStore.getState().fetchAccess()

    mockPatch.mockResolvedValueOnce({
      ...accessResponse.profiles[0],
      auth_status: 'connected',
    })

    await useLLMAccessStore.getState().updateProfile('profile-1', {
      auth_status: 'connected',
    })

    expect(mockPatch).toHaveBeenCalledWith('/api/llm-access/profiles/profile-1', {
      auth_status: 'connected',
    })
    expect(useLLMAccessStore.getState().access?.profiles[0].auth_status).toBe('connected')
  })

  it('deletes a CLI profile and clears local entitlement references', async () => {
    const accessWithProfiles = {
      ...accessResponse,
      profiles: [
        accessResponse.profiles[0],
        {
          ...accessResponse.profiles[0],
          id: 'profile-2',
          profile_name: 'Team Codex CLI',
        },
      ],
      entitlements: [
        {
          ...accessResponse.entitlements[0],
          cli_profile_id: 'profile-2',
        },
      ],
    }
    mockGet.mockResolvedValueOnce(accessWithProfiles)
    await useLLMAccessStore.getState().fetchAccess()
    mockDelete.mockResolvedValueOnce(undefined)

    const deleted = await useLLMAccessStore.getState().deleteProfile('profile-2')

    expect(deleted).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith('/api/llm-access/profiles/profile-2')
    expect(useLLMAccessStore.getState().access?.profiles).toHaveLength(1)
    expect(useLLMAccessStore.getState().access?.profiles[0].id).toBe('profile-1')
    expect(useLLMAccessStore.getState().access?.entitlements[0].cli_profile_id).toBeNull()
  })

  it('checks CLI profile health and refreshes local auth status', async () => {
    mockGet.mockResolvedValueOnce(accessResponse)
    await useLLMAccessStore.getState().fetchAccess()

    mockPost.mockResolvedValueOnce({
      profile: {
        ...accessResponse.profiles[0],
        auth_status: 'connected',
        metadata: {
          health_check: {
            message: 'codex 1.2.3',
            checked_at: '2026-07-02T00:00:00Z',
          },
        },
      },
      auth_status: 'connected',
      command_found: true,
      exit_code: 0,
      latency_ms: 12,
      message: 'codex 1.2.3',
      checked_at: '2026-07-02T00:00:00Z',
    })

    await useLLMAccessStore.getState().checkProfileHealth('profile-1')

    expect(mockPost).toHaveBeenCalledWith(
      '/api/llm-access/profiles/profile-1/health-check',
    )
    expect(useLLMAccessStore.getState().access?.profiles[0].auth_status).toBe(
      'connected',
    )
    expect(
      useLLMAccessStore.getState().access?.profiles[0].metadata.health_check,
    ).toMatchObject({ message: 'codex 1.2.3' })
  })

  it('stores errors from failed requests', async () => {
    mockGet.mockRejectedValueOnce(new Error('failed'))

    await useLLMAccessStore.getState().fetchAccess()

    expect(useLLMAccessStore.getState().error).toBe('failed')
    expect(useLLMAccessStore.getState().isLoading).toBe(false)
  })
})
