import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('api config', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  // ── getApiUrl ──────────────────────────────────────────

  describe('getApiUrl', () => {
    it('returns path as-is when no VITE_API_URL (dev mode)', async () => {
      vi.stubEnv('VITE_API_URL', '')
      const { getApiUrl } = await import('../api')

      expect(getApiUrl('/api/health')).toBe('/api/health')
    })

    it('handles paths without leading slash', async () => {
      vi.stubEnv('VITE_API_URL', '')
      const { getApiUrl } = await import('../api')

      expect(getApiUrl('api/sessions')).toBe('api/sessions')
    })

    it('prepends base URL when VITE_API_URL set (production)', async () => {
      vi.stubEnv('VITE_API_URL', 'https://api.example.com')
      const { getApiUrl } = await import('../api')

      expect(getApiUrl('/api/health')).toBe('https://api.example.com/api/health')
    })
  })

  // ── getWsUrl ───────────────────────────────────────────

  describe('getWsUrl', () => {
    it('converts http to ws in production', async () => {
      vi.stubEnv('VITE_API_URL', 'http://api.example.com')
      const { getWsUrl } = await import('../api')

      expect(getWsUrl('/ws/stream')).toBe('ws://api.example.com/ws/stream')
    })

    it('converts https to wss in production', async () => {
      vi.stubEnv('VITE_API_URL', 'https://api.example.com')
      const { getWsUrl } = await import('../api')

      expect(getWsUrl('/ws/stream')).toBe('wss://api.example.com/ws/stream')
    })

    it('uses window.location for dev mode with https', async () => {
      vi.stubEnv('VITE_API_URL', '')

      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', host: 'localhost:5173' },
        writable: true,
      })

      const { getWsUrl } = await import('../api')
      expect(getWsUrl('/ws/stream')).toBe('wss://localhost:5173/ws/stream')

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      })
    })

    it('uses ws: for http in dev mode', async () => {
      vi.stubEnv('VITE_API_URL', '')

      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', host: 'localhost:5173' },
        writable: true,
      })

      const { getWsUrl } = await import('../api')
      expect(getWsUrl('/ws/stream')).toBe('ws://localhost:5173/ws/stream')

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      })
    })

    it('uses current host in dev (jsdom default)', async () => {
      vi.stubEnv('VITE_API_URL', '')
      const { getWsUrl } = await import('../api')

      const result = getWsUrl('/ws/events')
      expect(result).toMatch(/^wss?:\/\//)
      expect(result).toContain('/ws/events')
    })
  })

  // ── API_BASE_URL ───────────────────────────────────────

  describe('API_BASE_URL', () => {
    it('is empty string when VITE_API_URL not set', async () => {
      vi.stubEnv('VITE_API_URL', '')
      const { API_BASE_URL } = await import('../api')

      expect(API_BASE_URL).toBe('')
    })

    it('equals VITE_API_URL when set', async () => {
      vi.stubEnv('VITE_API_URL', 'https://api.prod.com')
      const { API_BASE_URL } = await import('../api')

      expect(API_BASE_URL).toBe('https://api.prod.com')
    })
  })
})
