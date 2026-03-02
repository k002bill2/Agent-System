import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApiClient } from '../apiClient'
import { ApiError, ApiErrorCode } from '../errors'
import type { ApiClient, RequestInterceptor, ResponseInterceptor } from '../apiClient'

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof globalThis.fetch
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = createApiClient({
      baseURL: 'https://api.test',
      timeout: 5_000,
      maxRetries: 2,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // ── 1. Successful request ──────────────────────────────────

  it('makes a successful GET request and returns JSON', async () => {
    const payload = { items: [{ id: '1', name: 'Agent A' }] }
    mockFetch(async () => jsonResponse(payload))

    const result = await client.get<typeof payload>('/api/agents')

    expect(result).toEqual(payload)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.test/api/agents')
    expect(init.method).toBe('GET')
  })

  // ── 2. Retry on network error ─────────────────────────────

  it('retries on network error with exponential backoff', async () => {
    let attempts = 0
    mockFetch(async () => {
      attempts++
      if (attempts < 3) {
        throw new TypeError('Failed to fetch')
      }
      return jsonResponse({ ok: true })
    })

    const result = await client.get<{ ok: boolean }>('/api/health')

    expect(result).toEqual({ ok: true })
    expect(attempts).toBe(3) // 1 initial + 2 retries
  })

  // ── 3. Timeout handling ───────────────────────────────────

  it('throws TIMEOUT ApiError when request exceeds timeout', async () => {
    const shortTimeoutClient = createApiClient({
      baseURL: 'https://api.test',
      timeout: 50, // 50ms
      maxRetries: 0,
    })

    mockFetch(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse({ late: true })), 200)
          // Respect the abort signal like real fetch does
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    await expect(shortTimeoutClient.get('/api/slow')).rejects.toThrow(ApiError)

    try {
      await shortTimeoutClient.get('/api/slow')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.code).toBe(ApiErrorCode.TIMEOUT)
    }
  })

  // ── 4. Token refresh on 401 ───────────────────────────────

  it('refreshes token on 401 and retries the original request', async () => {
    let callCount = 0
    mockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      // Handle the refresh call made by authStore.refreshAccessToken
      if (url.includes('/api/auth/refresh')) {
        return jsonResponse({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        })
      }
      callCount++
      if (callCount === 1) {
        return jsonResponse({ message: 'Unauthorized' }, 401)
      }
      return jsonResponse({ data: 'protected' })
    })

    // Set a refresh token so authStore.refreshAccessToken can work
    const { useAuthStore } = await import('../../stores/auth')
    useAuthStore.setState({ refreshToken: 'old-refresh' })

    const result = await client.get<{ data: string }>('/api/protected')
    expect(result).toEqual({ data: 'protected' })
    // 1st call (401) + refresh call (by authStore) + retry call = 3 total
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  // ── 5. Request cancellation via AbortController ───────────

  it('throws REQUEST_CANCELLED when signal is aborted', async () => {
    const controller = new AbortController()

    mockFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'))
          })
        }),
    )

    const promise = client.get('/api/data', { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toThrow(ApiError)

    try {
      await client.get('/api/data', { signal: controller.signal })
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe(ApiErrorCode.REQUEST_CANCELLED)
    }
  })

  // ── 6. POST sends JSON body ───────────────────────────────

  it('sends POST request with JSON body', async () => {
    const requestBody = { name: 'New Agent', category: 'dev' }
    mockFetch(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(init?.body as string)
      return jsonResponse({ id: '42', ...parsed })
    })

    const result = await client.post<{ id: string; name: string }>('/api/agents', requestBody)

    expect(result.id).toBe('42')
    expect(result.name).toBe('New Agent')
  })

  // ── 7. Request interceptor modifies config ────────────────

  it('applies request interceptors', async () => {
    mockFetch(async () => jsonResponse({ ok: true }))

    const interceptor: RequestInterceptor = {
      onRequest: (config) => ({
        ...config,
        headers: { ...config.headers, 'X-Custom': 'test-value' },
      }),
    }
    client.addRequestInterceptor(interceptor)

    await client.get('/api/test')

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect((init.headers as Record<string, string>)['X-Custom']).toBe('test-value')
  })

  // ── 8. Response interceptor processes response ────────────

  it('applies response interceptors', async () => {
    mockFetch(async () => jsonResponse({ value: 1 }))

    const interceptor: ResponseInterceptor = {
      onResponse: (response) => response,
      onResponseError: (error) => error,
    }
    client.addResponseInterceptor(interceptor)

    const result = await client.get<{ value: number }>('/api/test')
    expect(result.value).toBe(1)
  })

  // ── 9. 204 No Content returns undefined ───────────────────

  it('returns undefined for 204 No Content', async () => {
    mockFetch(async () => new Response(null, { status: 204 }))

    const result = await client.delete('/api/agents/1')
    expect(result).toBeUndefined()
  })

  // ── 10. Exhausted retries throw NETWORK_ERROR ─────────────

  it('throws NETWORK_ERROR after all retries are exhausted', async () => {
    // Use a client with no retries to avoid timeout
    const noRetryClient = createApiClient({
      baseURL: 'https://api.test',
      timeout: 5_000,
      maxRetries: 0,
    })

    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(noRetryClient.get('/api/unreachable')).rejects.toThrow(ApiError)

    try {
      await noRetryClient.get('/api/unreachable')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe(ApiErrorCode.NETWORK_ERROR)
    }
  })
})
