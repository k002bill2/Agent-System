import { create } from 'zustand'

import { apiClient } from '@/services/apiClient'

export interface LLMCLIProfile {
  id: string
  owner_user_id: string | null
  organization_id: string | null
  provider: string
  profile_name: string
  command: string
  args_json: string[]
  working_directory: string | null
  auth_status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export interface LLMEntitlement {
  id: string
  user_id: string
  organization_id: string | null
  provider: string
  mode: string
  source_scope: string
  enabled: boolean
  cli_profile_id: string | null
  allow_api_fallback: boolean
  quota_policy_id: string | null
  created_at: string
  updated_at: string | null
}

export interface LLMAccess {
  user_id: string
  api_fallback_enabled: boolean
  profiles: LLMCLIProfile[]
  entitlements: LLMEntitlement[]
}

export interface LLMAccessFilters {
  organizationId?: string
}

export interface LLMCLIProfileCreate {
  owner_user_id?: string | null
  organization_id?: string | null
  provider: string
  profile_name: string
  command: string
  args_json?: string[]
  working_directory?: string | null
  auth_status?: string
  metadata?: Record<string, unknown>
}

export interface LLMCLIProfileUpdate {
  provider?: string
  profile_name?: string
  command?: string
  args_json?: string[] | null
  working_directory?: string | null
  auth_status?: string
  metadata?: Record<string, unknown> | null
}

export interface LLMCLIProfileHealthCheck {
  profile: LLMCLIProfile
  auth_status: string
  command_found: boolean
  exit_code: number | null
  latency_ms: number
  message: string
  checked_at: string
}

export interface LLMEntitlementUpdate {
  organization_id?: string | null
  provider?: string
  mode?: string
  source_scope?: string
  enabled?: boolean
  cli_profile_id?: string | null
  allow_api_fallback?: boolean
  quota_policy_id?: string | null
}

export interface LLMEntitlementCreate {
  user_id: string
  organization_id?: string | null
  provider: string
  mode: string
  source_scope: string
  enabled: boolean
  cli_profile_id?: string | null
  allow_api_fallback: boolean
  quota_policy_id?: string | null
}

interface LLMAccessStore {
  access: LLMAccess | null
  isLoading: boolean
  error: string | null
  lastFetched: Date | null
  fetchAccess: (filters?: LLMAccessFilters) => Promise<void>
  createProfile: (payload: LLMCLIProfileCreate) => Promise<LLMCLIProfile | null>
  updateProfile: (
    profileId: string,
    patch: LLMCLIProfileUpdate,
  ) => Promise<LLMCLIProfile | null>
  deleteProfile: (profileId: string) => Promise<boolean>
  checkProfileHealth: (
    profileId: string,
  ) => Promise<LLMCLIProfileHealthCheck | null>
  updateEntitlement: (
    entitlementId: string,
    patch: LLMEntitlementUpdate,
  ) => Promise<LLMEntitlement | null>
}

function buildAccessUrl(filters: LLMAccessFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.organizationId) params.set('organization_id', filters.organizationId)
  const qs = params.toString()
  return `/api/llm-access/me${qs ? `?${qs}` : ''}`
}

function isPersistedEntitlement(entitlement: LLMEntitlement): boolean {
  return !entitlement.id.startsWith('default-')
}

function buildAutoEntitlementPayload(
  access: LLMAccess,
  profilePayload: LLMCLIProfileCreate,
  createdProfile: LLMCLIProfile,
): LLMEntitlementCreate | null {
  const targetUserId = profilePayload.owner_user_id ?? access.user_id
  if (!targetUserId) return null

  const organizationId = profilePayload.organization_id ?? null
  const provider = createdProfile.provider
  const hasPersistedMatch = access.entitlements.some(entitlement =>
    isPersistedEntitlement(entitlement) &&
    entitlement.user_id === targetUserId &&
    (entitlement.organization_id ?? null) === organizationId &&
    entitlement.provider === provider &&
    entitlement.mode === 'cli' &&
    entitlement.source_scope === 'all',
  )
  if (hasPersistedMatch) return null

  return {
    user_id: targetUserId,
    organization_id: organizationId,
    provider,
    mode: 'cli',
    source_scope: 'all',
    enabled: true,
    cli_profile_id: createdProfile.id,
    allow_api_fallback: false,
  }
}

function appendCreatedProfile(
  access: LLMAccess,
  profile: LLMCLIProfile,
  entitlement: LLMEntitlement | null,
): LLMAccess {
  const profiles = access.profiles.some(item => item.id === profile.id)
    ? access.profiles
    : [...access.profiles, profile]
  const entitlements =
    entitlement && entitlement.user_id === access.user_id
      ? [...access.entitlements, entitlement]
      : access.entitlements

  return {
    ...access,
    profiles,
    entitlements,
  }
}

export const useLLMAccessStore = create<LLMAccessStore>((set, get) => ({
  access: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchAccess: async (filters = {}) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<LLMAccess>(buildAccessUrl(filters))
      set({ access: data, isLoading: false, lastFetched: new Date() })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      })
    }
  },

  createProfile: async (payload) => {
    set({ error: null })
    try {
      const created = await apiClient.post<LLMCLIProfile>('/api/llm-access/profiles', payload)
      const access = get().access
      if (access) {
        let createdEntitlement: LLMEntitlement | null = null
        const entitlementPayload = buildAutoEntitlementPayload(access, payload, created)
        if (entitlementPayload) {
          try {
            createdEntitlement = await apiClient.post<LLMEntitlement>(
              '/api/llm-access/entitlements',
              entitlementPayload,
            )
          } catch (err) {
            set({ error: err instanceof Error ? err.message : String(err) })
          }
        }
        set({
          access: appendCreatedProfile(access, created, createdEntitlement),
        })
      }
      return created
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  updateProfile: async (profileId, patch) => {
    set({ error: null })
    try {
      const updated = await apiClient.patch<LLMCLIProfile>(
        `/api/llm-access/profiles/${profileId}`,
        patch,
      )
      const access = get().access
      if (access) {
        set({
          access: {
            ...access,
            profiles: access.profiles.map(profile =>
              profile.id === profileId ? updated : profile,
            ),
          },
        })
      }
      return updated
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  deleteProfile: async (profileId) => {
    set({ error: null })
    try {
      await apiClient.delete(`/api/llm-access/profiles/${profileId}`)
      const access = get().access
      if (access) {
        set({
          access: {
            ...access,
            profiles: access.profiles.filter(profile => profile.id !== profileId),
            entitlements: access.entitlements.map(entitlement =>
              entitlement.cli_profile_id === profileId
                ? { ...entitlement, cli_profile_id: null }
                : entitlement,
            ),
          },
        })
      }
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  checkProfileHealth: async (profileId) => {
    set({ error: null })
    try {
      const result = await apiClient.post<LLMCLIProfileHealthCheck>(
        `/api/llm-access/profiles/${profileId}/health-check`,
      )
      const access = get().access
      if (access) {
        set({
          access: {
            ...access,
            profiles: access.profiles.map(profile =>
              profile.id === profileId ? result.profile : profile,
            ),
          },
        })
      }
      return result
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  updateEntitlement: async (entitlementId, patch) => {
    set({ error: null })
    try {
      const updated = await apiClient.patch<LLMEntitlement>(
        `/api/llm-access/entitlements/${entitlementId}`,
        patch,
      )
      const access = get().access
      if (access) {
        set({
          access: {
            ...access,
            entitlements: access.entitlements.map(entitlement =>
              entitlement.id === entitlementId ? updated : entitlement,
            ),
          },
        })
      }
      return updated
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },
}))
