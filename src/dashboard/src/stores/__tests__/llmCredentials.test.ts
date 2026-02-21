/**
 * LLM Credentials Store Tests
 *
 * OpenAI, Google Gemini, Anthropic LLM 자격증명 관리 스토어 테스트.
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

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>()
  return {
    ...actual,
    authFetch: vi.fn(async (url: string, options?: RequestInit) => {
      return mockFetch(url, options)
    }),
  }
})

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
    mockFetch.mockReset()
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockCredential, mockCredential2]),
      })

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
      mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r }))

      const promise = useLLMCredentialStore.getState().fetchCredentials()
      expect(useLLMCredentialStore.getState().isLoading).toBe(true)

      resolve({ ok: true, json: () => Promise.resolve([]) })
      await promise
      expect(useLLMCredentialStore.getState().isLoading).toBe(false)
    })

    it('sets error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

      await useLLMCredentialStore.getState().fetchCredentials()

      const state = useLLMCredentialStore.getState()
      expect(state.error).toContain('HTTP 403')
      expect(state.isLoading).toBe(false)
    })

    it('sets error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useLLMCredentialStore.getState().fetchCredentials()

      expect(useLLMCredentialStore.getState().error).toBe('Network error')
      expect(useLLMCredentialStore.getState().isLoading).toBe(false)
    })

    it('fetches with correct API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await useLLMCredentialStore.getState().fetchCredentials()

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/users/me/llm-credentials')
    })
  })

  // ── addCredential ──────────────────────────────────────

  describe('addCredential', () => {
    it('adds credential and prepends to list', async () => {
      useLLMCredentialStore.setState({ credentials: [mockCredential2] })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCredential),
      })

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toEqual(mockCredential)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials).toHaveLength(2)
      expect(credentials[0]).toEqual(mockCredential) // prepended
      expect(credentials[1]).toEqual(mockCredential2)
    })

    it('sends POST request with credential data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCredential),
      })

      await useLLMCredentialStore.getState().addCredential(mockCreateData)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/users/me/llm-credentials')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual(mockCreateData)
      expect(options.headers['Content-Type']).toBe('application/json')
    })

    it('sets error and returns null on HTTP failure with detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: 'Invalid API key format' }),
      })

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Invalid API key format')
    })

    it('sets default error when detail is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Failed to add credential')
    })

    it('returns null on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Network error')
    })

    it('returns null when json parse fails on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () => Promise.reject(new Error('parse error')),
      })

      const result = await useLLMCredentialStore.getState().addCredential(mockCreateData)

      expect(result).toBeNull()
      expect(useLLMCredentialStore.getState().error).toBe('Failed to add credential')
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
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await useLLMCredentialStore.getState().removeCredential('cred-1')

      expect(result).toBe(true)
      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials).toHaveLength(1)
      expect(credentials[0].id).toBe('cred-2')
    })

    it('sends DELETE request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useLLMCredentialStore.getState().removeCredential('cred-1')

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/users/me/llm-credentials/cred-1')
      expect(options.method).toBe('DELETE')
    })

    it('returns false on HTTP failure and keeps credential', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await useLLMCredentialStore.getState().removeCredential('cred-1')

      expect(result).toBe(false)
      expect(useLLMCredentialStore.getState().credentials).toHaveLength(2)
    })

    it('returns false on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useLLMCredentialStore.getState().removeCredential('cred-1')

      expect(result).toBe(false)
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(verifyResult),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(verifyResult),
      })

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toEqual(verifyResult)
      // last_verified_at should not be updated
      expect(useLLMCredentialStore.getState().credentials[0].last_verified_at).toBeNull()
    })

    it('sends POST request to verify endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ is_valid: true, provider: 'openai', error_message: null, latency_ms: 100 }),
      })

      await useLLMCredentialStore.getState().verifyCredential('cred-1')

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/users/me/llm-credentials/cred-1/verify')
      expect(options.method).toBe('POST')
    })

    it('returns null on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toBeNull()
    })

    it('returns null on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useLLMCredentialStore.getState().verifyCredential('cred-1')

      expect(result).toBeNull()
    })

    it('only updates matching credential last_verified_at', async () => {
      useLLMCredentialStore.setState({ credentials: [mockCredential, mockCredential2] })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          is_valid: true,
          provider: 'openai',
          error_message: null,
          latency_ms: 100,
        }),
      })

      await useLLMCredentialStore.getState().verifyCredential('cred-1')

      const { credentials } = useLLMCredentialStore.getState()
      expect(credentials[0].last_verified_at).not.toBeNull() // updated
      expect(credentials[1].last_verified_at).toBe('2025-01-02T00:00:00Z') // unchanged
    })
  })
})
