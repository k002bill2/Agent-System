import { useEffect, useState } from 'react'

import { fetchHealth, type HealthState } from '@/services/health'

const POLL_INTERVAL_MS = 30000

const INITIAL_STATE: HealthState = {
  state: 'checking',
  version: null,
  uptimeSeconds: null,
  checkedAt: 0,
}

/**
 * Poll `GET /api/health` immediately on mount, then every 30s.
 *
 * `fetchHealth` never throws and self-aborts its in-flight request via a 5s
 * timeout, so cleanup only needs to stop the interval and guard against a
 * stale `setState` after unmount.
 */
export function useBackendHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>(INITIAL_STATE)

  useEffect(() => {
    let mounted = true

    const poll = async (): Promise<void> => {
      const next = await fetchHealth()
      if (mounted) setHealth(next)
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return health
}
