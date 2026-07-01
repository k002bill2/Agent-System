/**
 * Deployment Usage Keys Store Tests
 *
 * Uses apiClient mock (snake_case identity contract — no camel mapping).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useDeploymentUsageKeyStore,
  type DeploymentUsageKey,
  type DeploymentUsageKeyVerifyResult,
} from '../deploymentUsageKeys'

// ─────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

// ─────────────────────────────────────────────────────────────
// Fixtures (snake_case, matching API contract)
// ─────────────────────────────────────────────────────────────

const openaiKey: DeploymentUsageKey = {
  provider: 'openai',
  has_db_key: true,
  is_active: true,
  source: 'db',
  api_key_masked: 'sk-****1234',
  label: 'org-admin',
  last_verified_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

const anthropicEnv: DeploymentUsageKey = {
  provider: 'anthropic',
  has_db_key: false,
  is_active: false,
  source: 'env',
  api_key_masked: null,
  label: null,
  last_verified_at: null,
  created_at: null,
  updated_at: null,
}

// ─────────────────────────────────────────────────────────────
// Reset helper (test isolation)
// ─────────────────────────────────────────────────────────────

function resetStore() {
  useDeploymentUsageKeyStore.setState({ keys: [], isLoading: false, error: null })
}

describe('deploymentUsageKeys store', () => {
  beforeEach(() => {
    resetStore()
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  describe('initial state', () => {
    it('has empty keys, not loading, no error', () => {
      const s = useDeploymentUsageKeyStore.getState()
      expect(s.keys).toEqual([])
      expect(s.isLoading).toBe(false)
      expect(s.error).toBeNull()
    })
  })

  describe('fetchKeys', () => {
    it('fetches from the admin-keys endpoint and stores rows', async () => {
      mockGet.mockResolvedValueOnce([openaiKey, anthropicEnv])

      await useDeploymentUsageKeyStore.getState().fetchKeys()

      const s = useDeploymentUsageKeyStore.getState()
      expect(s.keys).toHaveLength(2)
      expect(s.keys[0]).toEqual(openaiKey)
      expect(s.isLoading).toBe(false)
      expect(mockGet.mock.calls[0][0]).toBe('/api/external-usage/admin-keys')
    })

    it('toggles isLoading during the request', async () => {
      let resolve!: (v: unknown) => void
      mockGet.mockReturnValueOnce(new Promise((r) => { resolve = r }))

      const promise = useDeploymentUsageKeyStore.getState().fetchKeys()
      expect(useDeploymentUsageKeyStore.getState().isLoading).toBe(true)

      resolve([])
      await promise
      expect(useDeploymentUsageKeyStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Forbidden'))

      await useDeploymentUsageKeyStore.getState().fetchKeys()

      const s = useDeploymentUsageKeyStore.getState()
      expect(s.error).toBe('Forbidden')
      expect(s.isLoading).toBe(false)
    })
  })

  describe('upsertKey', () => {
    it('PUTs to the provider path and replaces the matching row', async () => {
      useDeploymentUsageKeyStore.setState({ keys: [openaiKey, anthropicEnv] })
      const updated = { ...openaiKey, label: 'rotated', api_key_masked: 'sk-****9999' }
      mockPut.mockResolvedValueOnce(updated)

      const result = await useDeploymentUsageKeyStore
        .getState()
        .upsertKey('openai', { api_key: 'sk-newsecret-123', label: 'rotated', is_active: true })

      expect(result).toEqual(updated)
      const [url, body] = mockPut.mock.calls[0]
      expect(url).toBe('/api/external-usage/admin-keys/openai')
      expect(body).toEqual({ api_key: 'sk-newsecret-123', label: 'rotated', is_active: true })

      const { keys } = useDeploymentUsageKeyStore.getState()
      expect(keys.find((k) => k.provider === 'openai')?.label).toBe('rotated')
      expect(keys.find((k) => k.provider === 'anthropic')).toEqual(anthropicEnv)
    })

    it('omits api_key and label from the PUT body when not provided (design A5)', async () => {
      useDeploymentUsageKeyStore.setState({ keys: [openaiKey] })
      mockPut.mockResolvedValueOnce({ ...openaiKey, is_active: false })

      await useDeploymentUsageKeyStore.getState().upsertKey('openai', { is_active: false })

      const [, body] = mockPut.mock.calls[0]
      // api_key + label absent → backend preserves the current key and label.
      expect(body).toEqual({ is_active: false })
      expect('api_key' in (body as object)).toBe(false)
    })

    it('omits an empty-string api_key so the current key is preserved', async () => {
      useDeploymentUsageKeyStore.setState({ keys: [openaiKey] })
      mockPut.mockResolvedValueOnce(openaiKey)

      await useDeploymentUsageKeyStore
        .getState()
        .upsertKey('openai', { api_key: '', label: 'renamed', is_active: true })

      const [, body] = mockPut.mock.calls[0]
      expect(body).toEqual({ label: 'renamed', is_active: true })
      expect('api_key' in (body as object)).toBe(false)
    })

    it('appends when no row exists for the provider', async () => {
      const created: DeploymentUsageKey = { ...openaiKey, provider: 'github_copilot' }
      mockPut.mockResolvedValueOnce(created)

      await useDeploymentUsageKeyStore
        .getState()
        .upsertKey('github_copilot', { api_key: 'ghp_secret_token', is_active: true })

      const { keys } = useDeploymentUsageKeyStore.getState()
      expect(keys).toHaveLength(1)
      expect(keys[0].provider).toBe('github_copilot')
    })

    it('returns null and records error on failure', async () => {
      mockPut.mockRejectedValueOnce(new Error('Invalid key'))

      const result = await useDeploymentUsageKeyStore
        .getState()
        .upsertKey('openai', { api_key: 'sk-bad', is_active: true })

      expect(result).toBeNull()
      expect(useDeploymentUsageKeyStore.getState().error).toBe('Invalid key')
    })
  })

  describe('verifyKey', () => {
    beforeEach(() => {
      useDeploymentUsageKeyStore.setState({ keys: [openaiKey] })
    })

    it('POSTs to the verify path and returns usage capability', async () => {
      const verify: DeploymentUsageKeyVerifyResult = {
        provider: 'openai',
        is_valid: true,
        usage_capable: true,
        status_code: 200,
        error_message: null,
        latency_ms: 88,
      }
      mockPost.mockResolvedValueOnce(verify)

      const result = await useDeploymentUsageKeyStore.getState().verifyKey('openai')

      expect(result).toEqual(verify)
      expect(mockPost.mock.calls[0][0]).toBe('/api/external-usage/admin-keys/openai/verify')
      expect(useDeploymentUsageKeyStore.getState().keys[0].last_verified_at).not.toBeNull()
    })

    it('does not update last_verified_at when invalid', async () => {
      mockPost.mockResolvedValueOnce({
        provider: 'openai',
        is_valid: false,
        usage_capable: false,
        status_code: 401,
        error_message: 'unauthorized',
        latency_ms: null,
      })

      const result = await useDeploymentUsageKeyStore.getState().verifyKey('openai')

      expect(result?.usage_capable).toBe(false)
      expect(useDeploymentUsageKeyStore.getState().keys[0].last_verified_at).toBeNull()
    })

    it('returns null on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('network'))

      const result = await useDeploymentUsageKeyStore.getState().verifyKey('openai')

      expect(result).toBeNull()
    })
  })

  describe('removeKey', () => {
    beforeEach(() => {
      useDeploymentUsageKeyStore.setState({ keys: [openaiKey, anthropicEnv] })
    })

    it('DELETEs the provider path and drops the row', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      const ok = await useDeploymentUsageKeyStore.getState().removeKey('openai')

      expect(ok).toBe(true)
      expect(mockDelete.mock.calls[0][0]).toBe('/api/external-usage/admin-keys/openai')
      const { keys } = useDeploymentUsageKeyStore.getState()
      expect(keys.find((k) => k.provider === 'openai')).toBeUndefined()
    })

    it('returns false and keeps rows on failure', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Not found'))

      const ok = await useDeploymentUsageKeyStore.getState().removeKey('openai')

      expect(ok).toBe(false)
      expect(useDeploymentUsageKeyStore.getState().keys).toHaveLength(2)
    })
  })
})
