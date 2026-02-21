import { describe, it, expect, vi, beforeEach } from 'vitest'
import posthog from 'posthog-js'

// Mock posthog-js at the module level
vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
  },
}))

/**
 * Helper: dynamically re-import the analytics module so that
 * module-level `import.meta.env` reads and the `initialized` flag
 * are freshly evaluated for each test group.
 */
async function loadAnalytics() {
  // Clear the module cache so the next import re-evaluates the module
  const modulePath = '../../services/analytics'
  // vitest uses vi.resetModules for this purpose
  const mod = await import(modulePath)
  return mod.analytics
}

describe('analytics service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset modules so each test gets fresh module-level state
    vi.resetModules()
  })

  // ─── init() ────────────────────────────────────────────────────

  describe('init()', () => {
    it('should warn and skip initialization when VITE_POSTHOG_KEY is not set', async () => {
      // .env file sets VITE_POSTHOG_KEY, so explicitly unset it for this test
      vi.stubEnv('VITE_POSTHOG_KEY', '')

      const warnCalls: unknown[][] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args) }

      const analytics = await loadAnalytics()
      analytics.init()

      console.warn = originalWarn
      expect(warnCalls).toEqual([
        ['[analytics] VITE_POSTHOG_KEY 없음 — analytics 비활성화'],
      ])
      expect(posthog.init).not.toHaveBeenCalled()

      vi.unstubAllEnvs()
    })

    it('should initialise PostHog with key and default host when VITE_POSTHOG_KEY is set', async () => {
      // Stub the env variable at the import.meta.env level
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key_123')
      // Remove VITE_POSTHOG_HOST so the ?? fallback to default is exercised
      delete (import.meta.env as Record<string, unknown>).VITE_POSTHOG_HOST

      const analytics = await loadAnalytics()
      analytics.init()

      expect(posthog.init).toHaveBeenCalledWith('phc_test_key_123', {
        api_host: 'https://app.posthog.com',
        capture_pageview: false,
        persistence: 'localStorage',
      })

      vi.unstubAllEnvs()
    })

    it('should use custom POSTHOG_HOST when provided', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key_456')
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://custom.posthog.example.com')

      const analytics = await loadAnalytics()
      analytics.init()

      expect(posthog.init).toHaveBeenCalledWith('phc_test_key_456', {
        api_host: 'https://custom.posthog.example.com',
        capture_pageview: false,
        persistence: 'localStorage',
      })

      vi.unstubAllEnvs()
    })
  })

  // ─── identify() ────────────────────────────────────────────────

  describe('identify()', () => {
    it('should not call posthog.identify when not initialized', async () => {
      const analytics = await loadAnalytics()
      // Do NOT call init() — module stays uninitialized
      analytics.identify('user-1', { role: 'admin' })

      expect(posthog.identify).not.toHaveBeenCalled()
    })

    it('should call posthog.identify with userId and properties after init', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.identify('user-42', { plan: 'pro' })

      expect(posthog.identify).toHaveBeenCalledWith('user-42', { plan: 'pro' })

      vi.unstubAllEnvs()
    })

    it('should call posthog.identify without properties when omitted', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.identify('user-99')

      expect(posthog.identify).toHaveBeenCalledWith('user-99', undefined)

      vi.unstubAllEnvs()
    })
  })

  // ─── track() ────────────────────────────────────────────────────

  describe('track()', () => {
    it('should not call posthog.capture when not initialized', async () => {
      const analytics = await loadAnalytics()
      analytics.track('button_clicked', { target: 'submit' })

      expect(posthog.capture).not.toHaveBeenCalled()
    })

    it('should call posthog.capture with event name and properties after init', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.track('form_submitted', { form_id: 'login' })

      expect(posthog.capture).toHaveBeenCalledWith('form_submitted', { form_id: 'login' })

      vi.unstubAllEnvs()
    })

    it('should call posthog.capture without properties when omitted', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.track('page_loaded')

      expect(posthog.capture).toHaveBeenCalledWith('page_loaded', undefined)

      vi.unstubAllEnvs()
    })
  })

  // ─── page() ─────────────────────────────────────────────────────

  describe('page()', () => {
    it('should not call posthog.capture when not initialized', async () => {
      const analytics = await loadAnalytics()
      analytics.page('Dashboard')

      expect(posthog.capture).not.toHaveBeenCalled()
    })

    it('should call posthog.capture with $pageview event and page name after init', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.page('Settings')

      expect(posthog.capture).toHaveBeenCalledWith('$pageview', { page: 'Settings' })

      vi.unstubAllEnvs()
    })
  })

  // ─── reset() ────────────────────────────────────────────────────

  describe('reset()', () => {
    it('should not call posthog.reset when not initialized', async () => {
      const analytics = await loadAnalytics()
      analytics.reset()

      expect(posthog.reset).not.toHaveBeenCalled()
    })

    it('should call posthog.reset after init', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key')

      const analytics = await loadAnalytics()
      analytics.init()
      analytics.reset()

      expect(posthog.reset).toHaveBeenCalledOnce()

      vi.unstubAllEnvs()
    })
  })
})
