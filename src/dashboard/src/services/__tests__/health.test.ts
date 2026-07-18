import { describe, it, expect, vi, afterEach } from 'vitest'

import { fetchHealth } from '../health'
import { getApiUrl } from '@/config/api'

// ---------------------------------------------------------------------------
// Helpers — the repo convention is `vi.spyOn(global, 'fetch')` returning a real
// `Response`, restored after each test (setup.ts installs a bare fetch mock).
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, status = 200): void {
  const isString = typeof body === 'string'
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(isString ? (body as string) : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const HEALTHY_BODY = { status: 'healthy', version: '1.2.3', uptime_seconds: 4200 }
const DEGRADED_BODY = { status: 'degraded', version: '1.2.3', uptime_seconds: 90 }
const UNHEALTHY_BODY = { status: 'unhealthy', version: '9.9.9', uptime_seconds: 1 }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('fetchHealth', () => {
  // ── Happy paths ───────────────────────────────────────────
  describe('200 responses', () => {
    it('maps 200 + healthy body → healthy with version & uptime', async () => {
      mockFetchResponse(HEALTHY_BODY, 200)

      const result = await fetchHealth()

      expect(result.state).toBe('healthy')
      expect(result.version).toBe('1.2.3')
      expect(result.uptimeSeconds).toBe(4200)
      expect(typeof result.checkedAt).toBe('number')
    })

    it('maps 200 + degraded body → degraded', async () => {
      mockFetchResponse(DEGRADED_BODY, 200)

      const result = await fetchHealth()

      expect(result.state).toBe('degraded')
      expect(result.version).toBe('1.2.3')
      expect(result.uptimeSeconds).toBe(90)
    })

    it('maps 200 + non-health body → offline', async () => {
      mockFetchResponse({ foo: 'bar' }, 200)

      const result = await fetchHealth()

      expect(result.state).toBe('offline')
      expect(result.version).toBeNull()
      expect(result.uptimeSeconds).toBeNull()
    })
  })

  // ── 503 handling (the DECISIVE reinterpretation) ──────────
  describe('503 responses', () => {
    it('maps 503 + valid health body → unhealthy (not offline)', async () => {
      mockFetchResponse(UNHEALTHY_BODY, 503)

      const result = await fetchHealth()

      expect(result.state).toBe('unhealthy')
      expect(result.version).toBe('9.9.9')
      expect(result.uptimeSeconds).toBe(1)
    })

    it('maps 503 + unparseable body → offline', async () => {
      mockFetchResponse('<!doctype html> not json', 503)

      const result = await fetchHealth()

      expect(result.state).toBe('offline')
      expect(result.version).toBeNull()
      expect(result.uptimeSeconds).toBeNull()
    })
  })

  // ── Failure paths → offline ───────────────────────────────
  describe('failure paths resolve to offline (never throws)', () => {
    it('maps a non-2xx / non-503 status (500) → offline', async () => {
      mockFetchResponse({ status: 'unhealthy', version: '1', uptime_seconds: 1 }, 500)

      const result = await fetchHealth()

      expect(result.state).toBe('offline')
    })

    it('maps a network rejection → offline', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await fetchHealth()

      expect(result.state).toBe('offline')
      expect(result.checkedAt).toBeGreaterThan(0)
    })

    it('maps an AbortError from the 5s timeout → offline', async () => {
      vi.useFakeTimers()

      // fetch stays pending until its abort signal fires, mimicking a hung
      // request that the internal AbortController tears down at 5s.
      vi.spyOn(global, 'fetch').mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            const signal = (init as RequestInit | undefined)?.signal
            signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          }),
      )

      const promise = fetchHealth()
      await vi.advanceTimersByTimeAsync(5000)
      const result = await promise

      expect(result.state).toBe('offline')
    })
  })

  // ── Request contract (C report U2 — F1 regression lock) ───
  describe('request contract', () => {
    it('calls the canonical /api/health URL in dev and sends no Authorization header', async () => {
      mockFetchResponse(HEALTHY_BODY, 200)

      await fetchHealth()

      // dev (no VITE_API_URL): getApiUrl is the SSOT builder → "/api/health"
      expect(getApiUrl('/api/health')).toBe('/api/health')
      expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything())

      const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
      // Auth-exempt endpoint: options carry only the abort signal.
      const headers = (init.headers ?? {}) as Record<string, string>
      expect(headers).not.toHaveProperty('Authorization')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('hits ${VITE_API_URL}/api/health in production (locks F1 stub regression)', async () => {
      // Re-evaluate config/api.ts under a prod-style base URL. Under the pre-F1
      // bug the request would drop the "/api" prefix and hit the version-less
      // app-level stub → permanent Offline; this assertion fails on that code.
      vi.stubEnv('VITE_API_URL', 'https://api.example.com')
      vi.resetModules()

      const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(HEALTHY_BODY), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const { fetchHealth: prodFetchHealth } = await import('../health')
      await prodFetchHealth()

      expect(spy).toHaveBeenCalledWith(
        'https://api.example.com/api/health',
        expect.anything(),
      )
    })
  })
})
