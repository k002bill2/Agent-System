/**
 * Backend health service.
 *
 * Raw `fetch` against the auth-exempt `GET /api/health` endpoint (no
 * Authorization header). The request URL is built with the canonical
 * `getApiUrl()` so it resolves the same way in both environments — dev
 * `/api/health` (via Vite proxy) and prod `${VITE_API_URL}/api/health`.
 *
 * The badge needs `version` and `uptime_seconds`, which only the health
 * router's rich handler returns; any `status`-only body here renders a
 * permanent "offline" pill. That is a live failure mode, not a hypothetical:
 * a bare `/health` route in `api/sessions.py` was mounted under `/api`
 * ahead of the health router and shadowed this endpoint (FastAPI resolves
 * first-match), so the badge sat at Offline while the backend was healthy.
 * `tests/backend/api/test_api_health.py` now locks the full body shape.
 *
 * `getApiUrl` is a pure URL builder, so `apiClient`'s retry/backoff is not
 * reintroduced and the "offline" signal stays fast. Owns a 5s
 * AbortController timeout and never throws — every failure resolves to an
 * `offline` state.
 */

import { getApiUrl } from '@/config/api'

const HEALTH_TIMEOUT_MS = 5000

/** Backend-reported status (snake_case wire contract). */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

/** UI render states: backend statuses + client-derived states. */
export type HealthUiState = HealthStatus | 'offline' | 'checking'

/** Wire-facing response shape from `GET /api/health`. */
export interface HealthResponse {
  status: HealthStatus
  version: string
  uptime_seconds: number
}

/** Derived client state consumed by the badge. */
export interface HealthState {
  state: HealthUiState
  version: string | null
  uptimeSeconds: number | null
  checkedAt: number
}

const VALID_STATUSES: readonly HealthStatus[] = ['healthy', 'degraded', 'unhealthy']

function isHealthResponse(body: unknown): body is HealthResponse {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.status === 'string' &&
    (VALID_STATUSES as readonly string[]).includes(b.status) &&
    typeof b.version === 'string' &&
    typeof b.uptime_seconds === 'number'
  )
}

function offlineState(checkedAt: number): HealthState {
  return { state: 'offline', version: null, uptimeSeconds: null, checkedAt }
}

/**
 * Fetch backend health and map it to a {@link HealthState}. Never throws.
 *
 * - 200 with a valid body       -> reported status (healthy | degraded)
 * - 503 with a valid body       -> reported status (unhealthy)
 * - unparseable / non-health body, other non-2xx, reject, timeout -> offline
 */
export async function fetchHealth(): Promise<HealthState> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  const checkedAt = Date.now()

  try {
    const res = await fetch(getApiUrl('/api/health'), { signal: controller.signal })

    // Only 200-range and 503 carry a health body worth parsing.
    if (res.ok || res.status === 503) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        return offlineState(checkedAt)
      }
      if (isHealthResponse(body)) {
        return {
          state: body.status,
          version: body.version,
          uptimeSeconds: body.uptime_seconds,
          checkedAt,
        }
      }
    }
    return offlineState(checkedAt)
  } catch {
    // fetch rejection / AbortError (timeout) / network failure
    return offlineState(checkedAt)
  } finally {
    clearTimeout(timeout)
  }
}
