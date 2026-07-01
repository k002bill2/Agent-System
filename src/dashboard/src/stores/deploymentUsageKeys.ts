import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

/**
 * Deployment-level usage admin keys store.
 *
 * Mirrors the CRUD pattern of `llmCredentials.ts`, but targets the
 * deployment-wide usage credentials (`/external-usage/admin-keys`) that drive
 * the External Usage collectors. Field names follow the API contract verbatim
 * (snake_case identity mapping — no camelCase conversion layer, matching the
 * rest of the AOS apiClient stores).
 */

export type ExternalProvider = 'openai' | 'anthropic' | 'github_copilot'

/** Resolved source of the key currently in effect for a provider. */
export type DeploymentUsageKeySource = 'db' | 'env' | 'none'

/** Response row for a single provider's deployment usage key (api_key masked). */
export interface DeploymentUsageKey {
  provider: ExternalProvider
  has_db_key: boolean
  is_active: boolean
  source: DeploymentUsageKeySource
  api_key_masked: string | null
  label: string | null
  last_verified_at: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Upsert payload (PUT). All fields optional under the re-frozen contract:
 * omitting `api_key` keeps the current key (enables label-only edits and
 * is_active-only toggles); the backend requires `api_key` only when creating a
 * brand-new key. When supplied, `api_key` must be 10..1024 chars.
 */
export interface DeploymentUsageKeyUpsert {
  api_key?: string
  label?: string | null
  is_active?: boolean
}

/** Result of a usage-capability verify call. */
export interface DeploymentUsageKeyVerifyResult {
  provider: ExternalProvider
  is_valid: boolean
  usage_capable: boolean
  status_code: number | null
  error_message: string | null
  latency_ms: number | null
}

interface DeploymentUsageKeyStore {
  keys: DeploymentUsageKey[]
  isLoading: boolean
  error: string | null

  fetchKeys: () => Promise<void>
  upsertKey: (
    provider: ExternalProvider,
    data: DeploymentUsageKeyUpsert
  ) => Promise<DeploymentUsageKey | null>
  verifyKey: (provider: ExternalProvider) => Promise<DeploymentUsageKeyVerifyResult | null>
  removeKey: (provider: ExternalProvider) => Promise<boolean>
}

const BASE_URL = '/api/external-usage/admin-keys'

export const useDeploymentUsageKeyStore = create<DeploymentUsageKeyStore>((set) => ({
  keys: [],
  isLoading: false,
  error: null,

  fetchKeys: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<DeploymentUsageKey[]>(BASE_URL)
      set({ keys: data, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  upsertKey: async (provider, data) => {
    try {
      // Build a clean payload immutably: omit api_key when empty/undefined
      // (keep current key on the backend); only include label/is_active when
      // provided so the backend's partial-update preserves omitted fields.
      const payload: DeploymentUsageKeyUpsert = {
        ...(data.api_key !== undefined && data.api_key.trim() !== ''
          ? { api_key: data.api_key.trim() }
          : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      }

      const updated = await apiClient.put<DeploymentUsageKey>(`${BASE_URL}/${provider}`, payload)
      set((s) => {
        const exists = s.keys.some((k) => k.provider === provider)
        const keys = exists
          ? s.keys.map((k) => (k.provider === provider ? updated : k))
          : [...s.keys, updated]
        return { keys, error: null }
      })
      return updated
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  verifyKey: async (provider) => {
    try {
      const result = await apiClient.post<DeploymentUsageKeyVerifyResult>(
        `${BASE_URL}/${provider}/verify`
      )
      if (result.is_valid) {
        set((s) => ({
          keys: s.keys.map((k) =>
            k.provider === provider
              ? { ...k, last_verified_at: new Date().toISOString() }
              : k
          ),
        }))
      }
      return result
    } catch {
      return null
    }
  },

  removeKey: async (provider) => {
    try {
      await apiClient.delete(`${BASE_URL}/${provider}`)
      set((s) => ({ keys: s.keys.filter((k) => k.provider !== provider) }))
      return true
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    }
  },
}))
