/**
 * LLM Credentials Store Tests
 *
 * Uses apiClient mock instead of raw fetch/authFetch mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useLLMCredentialStore,
  type LLMCredential,
  type LLMCredentialCreate,
} from '../llmCredentials'

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
// Test Fixtures
// ─────────────────────────────────────────────────────────────

const mockCredential: LLMCredential = {
  id: 'cred-1',
  provider: 'openai',
  key_name: 'My OpenAI Key',
  api_key_masked: 'sk-****1234',
  is_active: true,
  last_verified_at: null,
  created_at: '2025-01-01T00:00:00Z',
}

const mockCredential2: LLMCredential = {
  id: 'cred-2',
  provider: 'anthropic',
  key_name: 'My Anthropic Key',
  api_key_masked: 'sk-ant-****5678',
  is_active: true,
  last_verified_at: '2025-01-02T00:00:00Z',
  created_at: '2025-01-02T00:00:00Z',
}

const mockCreateData: LLMCredentialCreate = {
  provider: 'openai',
  key_name: 'New Key',
  api_key: 'sk-test-key-12345',
}

// ─────────────────────────────────────────────────────────────
// Store Reset Helper
// ─────────────────────────────────────────────────────────────

function resetStore() {
  useLLMCredentialStore.setState({
    credentials: [],
    isLoading: false,
    error: null,
  })
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('llmCredentials store', () => {
  beforeEach(() => {
    resetStore()
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty credentials', () => {
      expect(useLLMCredentialStore.getState().credentials).toEqual([])
    })

    it('is not loading', () => {
      expect(useLLMCredentialStore.getState().isLoading).toBe(false)
    })

    it('has null error', () => {
      expect(useLLMCredentialStore.getState().error).toBeNull()
    })
  })

  // ── fetchCredentials ───────────────────────────────────

  describe('fetchCredentials', () => {
    it('fetches and stores credentials', async () => {
      mockGet.mockResolvedValueOnce([mockCredential, mockCredential2])

      await useLLMCredentialStore.getState().fetchCredentials()

      const state = useLLMCredentialStore.getState()
      expect(state.credentials).toHaveLength(2)
      expect(state.credentials[0]).toEqual(mockCredential)
      expect(state.credentials[1]).toEqual(mockCredential2)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets isLoading true during fetch', async () => {
      let resolve!: (v: unknown) => void
      mockGet.mockReturnValueOnce(new Promise((r) => { resolve = r }))

      const promise = useLLMCredentialStore.getState().fetchCredentials()
      expect(useLLMCredentialStore.getState().isLoading).toBe(true)

      resolve([])
      await promise
      expect(useLLMCredentialStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Forbidden'))

      await useLLMCredentialStore.getState().fetchCredentials()

      const state = useLLMCredentialStore.getState()
      expect(state.error).toBe('Forbidden')
      expect(state.isLoading).toBe(false)
    })

    it('fetches with correct API endpoint', async () => {
      mockGet.mockResolvedValueOnce([])

      await useLLMCredentialStore.getState().fetchCredentials()

      const calledUrl = mockGet.mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/users/me/llm-credentials')
    })
  })

  // ── addCredential ──────────────────────────────────────

  describe('addCredential', () => {
    it('adds credential and prepends to list', async () => {
      useLLMCredentialStore.setState({ credentials: [mockCredential2] })
      mockPost.mockResolvedValueOnce(mockCredential)

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toEqual(mockCredential)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials).toHaveLength(2)
      expect(credentials[0]).toEqual(mockCredential) // prepended
      expect(credentials[1]).toEqual(mockCredential2)
    })

    it('sends POST request with credential data', async () => {
      mockPost.mockResolvedValueOnce(mockCredential)

      await useLLMCredentialStore.getState().addCredential(mockCreateData)

      const [url, data] = mockPost.mock.calls[0]
      expect(url).toContain('/api/users/me/llm-credentials')
      expect(data).toEqual(mockCreateData)
    })

    it('returns null on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Invalid API key format'))

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Invalid API key format')
    })
  })

  // ── updateCredential ─────────────────────────────────

  describe('updateCredential', () => {
    beforeEach(() => {
      useLLMCredentialStore.setState({ credentials: [mockCredential, mockCredential2] })
    })

    it('updates credential in list', async () => {
      const updated = { ...mockCredential, key_name: 'Updated Key' }
      mockPut.mockResolvedValueOnce(updated)

      const result = await useLLMCredentialStore.getState().updateCredential('cred-1', { key_name: 'Updated Key' })

      expect(result).toEqual(updated)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials[0].key_name).toBe('Updated Key')
      expect(credentials[1]).toEqual(mockCredential2) // unchanged
    })

    it('returns null on failure', async () => {
      mockPut.mockRejectedValueOnce(new Error('Not found'))

      const result = await useLLMCredentialStore.getState().updateCredential('cred-1', { key_name: 'x' })

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Not found')
    })
  })

  // ── removeCredential ───────────────────────────────────

  describe('removeCredential', () => {
    beforeEach(() => {
      useLLMCredentialStore.setState({
        credentials: [mockCredential, mockCredential2],
      })
    })

    it('removes credential from list', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      const result = await useLLMCredentialStore.getState().removeCredential('cred-1')

      expect(result).toBe(true)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials).toHaveLength(1)
      expect(credentials[0].id).toBe('cred-2')
    })

    it('sends DELETE request with correct URL', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await useLLMCredentialStore.getState().removeCredential('cred-1')

      const calledUrl = mockDelete.mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/users/me/llm-credentials/cred-1')
    })

    it('returns false on failure', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Not found'))

      const result = await useLLMCredentialStore.getState().removeCredential('cred-1')

      expect(result).toBe(false)
      expect(useLLMCredentialStore.getState().credentials).toHaveLength(2)
    })
  })

  // ── verifyCredential ───────────────────────────────────

  describe('verifyCredential', () => {
    beforeEach(() => {
      useLLMCredentialStore.setState({ credentials: [mockCredential] })
    })

    it('verifies credential and updates last_verified_at when valid', async () => {
      const verifyResult = {
        is_valid: true,
        provider: 'openai',
        error_message: null,
        latency_ms: 120,
      }
      mockPost.mockResolvedValueOnce(verifyResult)

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toEqual(verifyResult)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials[0].last_verified_at).not.toBeNull()
    })

    it('returns result without updating when invalid', async () => {
      const verifyResult = {
        is_valid: false,
        provider: 'openai',
        error_message: 'Invalid API key',
        latency_ms: null,
      }
      mockPost.mockResolvedValueOnce(verifyResult)

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toEqual(verifyResult)
      // last_verified_at should not be updated
      expect(useLLMCredentialStore.getState().credentials[0].last_verified_at).toBeNull()
    })

    it('sends POST request to verify endpoint', async () => {
      mockPost.mockResolvedValueOnce({ is_valid: true, provider: 'openai', error_message: null, latency_ms: 100 })

      await useLLMCredentialStore.getState().verifyCredential('cred-1')

      const calledUrl = mockPost.mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/users/me/llm-credentials/cred-1/verify')
    })

    it('returns null on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Not found'))

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toBeNull()
    })

    it('only updates matching credential last_verified_at', async () => {
      useLLMCredentialStore.setState({ credentials: [mockCredential, mockCredential2] })
      mockPost.mockResolvedValueOnce({
        is_valid: true,
        provider: 'openai',
        error_message: null,
        latency_ms: 100,
      })

      await useLLMCredentialStore.getState().verifyCredential('cred-1')

      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials[0].last_verified_at).not.toBeNull() // updated
      expect(credentials[1].last_verified_at).toBe('2025-01-02T00:00:00Z') // unchanged
    })
  })
})
