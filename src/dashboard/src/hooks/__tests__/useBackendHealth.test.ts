import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { fetchHealth, type HealthState } from '@/services/health'

// `useBackendHealth` polls `fetchHealth`; mock the service so the hook is
// tested in isolation from network / AbortController behaviour.
vi.mock('@/services/health', () => ({
  fetchHealth: vi.fn(),
}))

import { useBackendHealth } from '../useBackendHealth'

const mockFetchHealth = vi.mocked(fetchHealth)

const HEALTHY: HealthState = {
  state: 'healthy',
  version: '1.2.3',
  uptimeSeconds: 4200,
  checkedAt: 1000,
}

describe('useBackendHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchHealth.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in the checking state, then resolves after the first poll', async () => {
    mockFetchHealth.mockResolvedValue(HEALTHY)

    const { result } = renderHook(() => useBackendHealth())

    // Initial synchronous render — before the immediate poll resolves.
    expect(result.current.state).toBe('checking')
    expect(result.current.version).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.state).toBe('healthy')
    expect(result.current.version).toBe('1.2.3')
    expect(result.current.uptimeSeconds).toBe(4200)
    expect(mockFetchHealth).toHaveBeenCalledTimes(1)
  })

  it('re-polls on the 30s interval', async () => {
    mockFetchHealth.mockResolvedValue(HEALTHY)

    renderHook(() => useBackendHealth())

    // Immediate mount poll.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockFetchHealth).toHaveBeenCalledTimes(1)

    // One interval tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(mockFetchHealth).toHaveBeenCalledTimes(2)

    // A second interval tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(mockFetchHealth).toHaveBeenCalledTimes(3)
  })

  it('stops polling after unmount (interval cleared)', async () => {
    mockFetchHealth.mockResolvedValue(HEALTHY)

    const { unmount } = renderHook(() => useBackendHealth())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockFetchHealth).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000)
    })

    // No further polls once the effect cleanup runs.
    expect(mockFetchHealth).toHaveBeenCalledTimes(1)
  })

  it('does not setState after unmount when an in-flight poll resolves late', async () => {
    let resolvePoll: (value: HealthState) => void = () => {}
    mockFetchHealth.mockReturnValue(
      new Promise<HealthState>((resolve) => {
        resolvePoll = resolve
      }),
    )

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderHook(() => useBackendHealth())
    unmount()

    // Resolve the promise that was in flight at unmount; the mounted guard
    // must swallow the result without a post-unmount setState warning.
    await act(async () => {
      resolvePoll(HEALTHY)
      await Promise.resolve()
    })

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
