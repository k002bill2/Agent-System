/**
 * Central analytics service wrapping PostHog.
 *
 * - Initializes only when VITE_POSTHOG_KEY is set.
 * - All event names must be snake_case.
 * - Call analytics.identify() after login, analytics.reset() after logout.
 */
import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined

let initialized = false

export const analytics = {
  /** PostHog 초기화. App 최상위에서 1회 호출. */
  init(): void {
    if (!POSTHOG_KEY) {
      console.warn('[analytics] VITE_POSTHOG_KEY 없음 — analytics 비활성화')
      return
    }
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST ?? 'https://app.posthog.com',
      capture_pageview: false, // 수동으로 페이지뷰 처리
      persistence: 'localStorage',
    })
    initialized = true
  },

  /** 로그인 후 사용자 식별. */
  identify(userId: string, properties?: Record<string, unknown>): void {
    if (!initialized) return
    posthog.identify(userId, properties)
  },

  /** 이벤트 추적. eventName은 snake_case 사용. */
  track(eventName: string, properties?: Record<string, unknown>): void {
    if (!initialized) return
    posthog.capture(eventName, properties)
  },

  /** 페이지뷰 추적. */
  page(pageName: string): void {
    if (!initialized) return
    posthog.capture('$pageview', { page: pageName })
  },

  /** 로그아웃 시 사용자 세션 리셋. */
  reset(): void {
    if (!initialized) return
    posthog.reset()
  },
}
