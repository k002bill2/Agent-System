import { StrictMode } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { agentService, type Agent } from '@/services/agentService'
import { ApiError, ApiErrorCode } from '@/services/errors'

/**
 * Mock the SERVICE seam, not `fetch`/`apiClient`.
 *
 * apiClient retries transport failures with backoff, which makes fetch-level
 * rejection non-deterministic here. `agentService.getAgents` is the exact
 * boundary the hook depends on, so stubbing it keeps the lifecycle contract
 * (loading → ready/error) under test without any network semantics.
 */
vi.mock('@/services/agentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/agentService')>()
  return {
    ...actual,
    agentService: { ...actual.agentService, getAgents: vi.fn() },
  }
})

import { useAgentRegistry } from '../useAgentRegistry'

const mockGetAgents = vi.mocked(agentService.getAgents)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Agent One',
    description: 'first agent',
    category: 'development',
    status: 'available',
    specializations: [],
    capabilities: [],
    total_tasks_completed: 10,
    success_rate: 0.9,
    estimated_cost_per_task: 0.01,
    avg_execution_time_ms: 1200,
    is_available: true,
    ...overrides,
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const AGENT_A = makeAgent({ id: 'a', name: 'Alpha' })
const AGENT_B = makeAgent({ id: 'b', name: 'Bravo', status: 'busy' })

describe('useAgentRegistry', () => {
  beforeEach(() => {
    mockGetAgents.mockReset()
  })

  // ── Happy path ─────────────────────────────────────────────

  describe('successful load', () => {
    it('starts in loading, then becomes ready with the fetched agents', async () => {
      const pending = deferred<Agent[]>()
      mockGetAgents.mockReturnValueOnce(pending.promise)

      const { result } = renderHook(() => useAgentRegistry())

      expect(result.current.state).toBe('loading')
      expect(result.current.agents).toEqual([])
      expect(result.current.error).toBeNull()
      expect(result.current.lastUpdatedAt).toBeNull()

      await act(async () => {
        pending.resolve([AGENT_A, AGENT_B])
        await pending.promise
      })

      await waitFor(() => expect(result.current.state).toBe('ready'))
      expect(result.current.agents).toEqual([AGENT_A, AGENT_B])
      expect(result.current.error).toBeNull()
      expect(result.current.isRefreshing).toBe(false)
      expect(result.current.lastUpdatedAt).toBeTypeOf('number')
      expect(mockGetAgents).toHaveBeenCalledTimes(1)
    })

    it('calls the endpoint with no query params', async () => {
      mockGetAgents.mockResolvedValue([AGENT_A])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))

      expect(mockGetAgents).toHaveBeenCalledWith()
    })

    it('an empty registry is `ready` with zero agents — never `error`', async () => {
      mockGetAgents.mockResolvedValue([])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))

      // This is the distinction the whole state machine exists for: an empty
      // registry must be reachable ONLY via `ready`, so an auth/network failure
      // can never render as "등록된 에이전트가 없습니다".
      expect(result.current.agents).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('coerces a non-array payload to an empty list instead of crashing', async () => {
      mockGetAgents.mockResolvedValue({ items: [AGENT_A] } as unknown as Agent[])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))

      expect(result.current.agents).toEqual([])
    })
  })

  // ── Error handling ─────────────────────────────────────────

  describe('failed load', () => {
    it('maps an ApiError to its user-facing message and sets state=error', async () => {
      mockGetAgents.mockRejectedValue(
        new ApiError({
          message: 'Unauthorized',
          status: 401,
          code: ApiErrorCode.UNAUTHORIZED,
        }),
      )

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('error'))

      expect(result.current.error).toBe('You are not authenticated. Please log in.')
      expect(result.current.agents).toEqual([])
      expect(result.current.lastUpdatedAt).toBeNull()
      expect(result.current.isRefreshing).toBe(false)
    })

    it('falls back to the Korean message for a non-ApiError', async () => {
      mockGetAgents.mockRejectedValue(new Error('boom'))

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('error'))

      expect(result.current.error).toBe('에이전트 목록을 불러오지 못했습니다.')
    })
  })

  // ── Refresh semantics ──────────────────────────────────────

  describe('refresh', () => {
    it('a failed refresh KEEPS the agents already on screen', async () => {
      mockGetAgents.mockResolvedValueOnce([AGENT_A, AGENT_B])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))
      expect(result.current.agents).toHaveLength(2)

      mockGetAgents.mockRejectedValueOnce(new Error('network down'))
      await act(async () => {
        result.current.refresh()
      })
      await waitFor(() => expect(result.current.state).toBe('error'))

      // Regression guard for W3: the catch branch must NOT call setAgents([]).
      // Losing the visible list on a transient refresh failure is a data-loss UX bug.
      expect(result.current.agents).toEqual([AGENT_A, AGENT_B])
      expect(result.current.error).toBe('에이전트 목록을 불러오지 못했습니다.')
    })

    it('a successful refresh replaces the list and clears a previous error', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('first failure'))

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('error'))

      mockGetAgents.mockResolvedValueOnce([AGENT_A])
      await act(async () => {
        result.current.refresh()
      })
      await waitFor(() => expect(result.current.state).toBe('ready'))

      expect(result.current.agents).toEqual([AGENT_A])
      expect(result.current.error).toBeNull()
    })

    it('refresh uses isRefreshing and never falls back to the `loading` state', async () => {
      mockGetAgents.mockResolvedValueOnce([AGENT_A])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))

      const pending = deferred<Agent[]>()
      mockGetAgents.mockReturnValueOnce(pending.promise)

      act(() => {
        result.current.refresh()
      })

      // In flight: the board keeps rendering the existing list (no spinner
      // takeover), which is precisely why `state` is separate from `isRefreshing`.
      expect(result.current.isRefreshing).toBe(true)
      expect(result.current.state).toBe('ready')
      expect(result.current.agents).toEqual([AGENT_A])

      await act(async () => {
        pending.resolve([AGENT_A, AGENT_B])
        await pending.promise
      })

      await waitFor(() => expect(result.current.isRefreshing).toBe(false))
      expect(result.current.state).toBe('ready')
      expect(result.current.agents).toHaveLength(2)
      expect(mockGetAgents).toHaveBeenCalledTimes(2)
    })

    it('keeps the previous lastUpdatedAt when a refresh fails', async () => {
      mockGetAgents.mockResolvedValueOnce([AGENT_A])

      const { result } = renderHook(() => useAgentRegistry())
      await waitFor(() => expect(result.current.state).toBe('ready'))
      const firstStamp = result.current.lastUpdatedAt
      expect(firstStamp).toBeTypeOf('number')

      mockGetAgents.mockRejectedValueOnce(new Error('nope'))
      await act(async () => {
        result.current.refresh()
      })
      await waitFor(() => expect(result.current.state).toBe('error'))

      // The stamp means "last SUCCESSFUL load"; a failure must not advance it.
      expect(result.current.lastUpdatedAt).toBe(firstStamp)
    })
  })

  // ── Lifecycle ──────────────────────────────────────────────

  describe('lifecycle', () => {
    it('still reaches `ready` under StrictMode double-invoked effects', async () => {
      mockGetAgents.mockResolvedValue([AGENT_A])

      const { result } = renderHook(() => useAgentRegistry(), { wrapper: StrictMode })

      // StrictMode mounts, cleans up (mountedRef -> false), then re-mounts.
      // `mountedRef.current = true` lives INSIDE the effect body precisely so the
      // re-run restores it; hoisting it to the declaration would strand the hook
      // in `loading` forever because every resolution would be discarded.
      await waitFor(() => expect(result.current.state).toBe('ready'))
      expect(result.current.agents).toEqual([AGENT_A])
    })

    /*
     * NOT TESTED: the `if (!mountedRef.current) return` unmount guards.
     *
     * A test was written for it and then deleted, because it could not be made
     * to fail: React 18 silently discards setState on an unmounted component and
     * no longer emits the "state update on unmounted component" warning, so the
     * hook behaves identically with the guards removed (verified by deleting
     * them and re-running this suite — 12/12 still passed). A green test there
     * would assert nothing, which is the very defect this suite exists to fix.
     * The guards remain correct defensive code; they are simply unobservable
     * from outside the hook.
     */
  })
})
