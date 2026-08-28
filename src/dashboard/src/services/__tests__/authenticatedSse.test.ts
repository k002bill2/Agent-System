import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedSseClient } from '../authenticatedSse'
import { useAuthStore } from '../../stores/auth'

function streamResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('authenticated SSE client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: null,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sends the access token in the Authorization header, never the URL', async () => {
    globalThis.fetch = vi.fn(async () => streamResponse('')) as typeof fetch

    createAuthenticatedSseClient('/api/protected/stream')

    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]

    expect(url).toBe('/api/protected/stream')
    expect(init?.headers).toEqual({ Authorization: 'Bearer access-token' })
    expect(url).not.toContain('access-token')
  })

  it('terminates with permission-denied on 403 without reconnecting', async () => {
    const onStatus = vi.fn()
    globalThis.fetch = vi.fn(async () => streamResponse('', 403)) as typeof fetch

    createAuthenticatedSseClient('/api/protected/stream', { onStatus })

    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('permission-denied'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes once after 401 and retries with the new access token', async () => {
    useAuthStore.setState({ accessToken: 'expired-token', refreshToken: 'refresh-token' })
    let streamAttempts = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify({
          access_token: 'new-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      streamAttempts += 1
      return streamResponse(streamAttempts === 1 ? '' : 'event: connected\\ndata: {}\\n\\n', streamAttempts === 1 ? 401 : 200)
    }) as typeof fetch

    const onStatus = vi.fn()
    const client = createAuthenticatedSseClient('/api/protected/stream', { onStatus })
    client.addEventListener('connected', vi.fn())

    await vi.waitFor(() => expect(streamAttempts).toBe(2))
    const calls = vi.mocked(globalThis.fetch).mock.calls
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer expired-token')
    expect((calls[2][1]?.headers as Record<string, string>).Authorization).toBe('Bearer new-token')
    expect(onStatus).not.toHaveBeenCalledWith('authentication-failed')
  })

  it('terminates with authentication-failed when refresh cannot recover a 401', async () => {
    useAuthStore.setState({ accessToken: 'expired-token', refreshToken: null })
    const onStatus = vi.fn()
    globalThis.fetch = vi.fn(async () => streamResponse('', 401)) as typeof fetch

    createAuthenticatedSseClient('/api/protected/stream', { onStatus })

    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('authentication-failed'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('parses SSE event names and preserves malformed payloads for the consumer', async () => {
    globalThis.fetch = vi.fn(async () => streamResponse(
      'event: config_change\r\ndata: not-json{{{\r\n\r\n',
    )) as typeof fetch
    const onEvent = vi.fn()

    const client = createAuthenticatedSseClient('/api/project-configs/stream')
    client.addEventListener('config_change', onEvent)

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1))
    expect(onEvent.mock.calls[0][0].data).toBe('not-json{{{')
  })

  it('closes an active stream without reporting a reconnectable error', async () => {
    let aborted = false
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
    ) as typeof fetch
    const onStatus = vi.fn()

    const client = createAuthenticatedSseClient('/api/protected/stream', { onStatus })
    client.close()
    await vi.waitFor(() => expect(aborted).toBe(true))

    expect(onStatus).not.toHaveBeenCalled()
  })
})
