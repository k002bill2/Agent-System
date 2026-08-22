import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { agentService, type Agent } from '@/services/agentService'
import { ApiError, ApiErrorCode } from '@/services/errors'

/**
 * Mock the service seam so the board exercises its REAL data path
 * (board → useAgentRegistry → agentService). Injecting agents as a prop would
 * bypass the loading/error/empty branches entirely — and the prop was removed
 * on purpose, because a second data path is how mock data sneaks back in.
 */
vi.mock('@/services/agentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/agentService')>()
  return {
    ...actual,
    agentService: { ...actual.agentService, getAgents: vi.fn() },
  }
})

import { AgentRealtimeStatusBoard } from '../AgentRealtimeStatusBoard'

const mockGetAgents = vi.mocked(agentService.getAgents)

// ---------------------------------------------------------------------------
// Fixtures
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

const AVAILABLE = makeAgent({ id: 'a', name: 'Alpha', category: 'development' })
const BUSY = makeAgent({
  id: 'b',
  name: 'Bravo',
  status: 'busy',
  category: 'analysis',
  description: 'runs analysis jobs',
})
const ERRORED = makeAgent({ id: 'c', name: 'Charlie', status: 'error', category: 'automation' })

/** Every agent card carries `에이전트 {name}, 상태 {label}, 성공률 {rate}`. */
const CARD_LABEL = /^에이전트 .+, 상태 .+, 성공률 /

function cards(): HTMLElement[] {
  return screen.queryAllByLabelText(CARD_LABEL)
}

async function renderBoard(): Promise<void> {
  render(<AgentRealtimeStatusBoard />)
  await waitFor(() =>
    expect(screen.queryByText('에이전트 목록을 불러오는 중...')).not.toBeInTheDocument(),
  )
}

describe('AgentRealtimeStatusBoard', () => {
  beforeEach(() => {
    mockGetAgents.mockReset()
  })

  // ── Loading ────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows the loading message while the first request is in flight', () => {
      mockGetAgents.mockReturnValue(new Promise<Agent[]>(() => {}))

      render(<AgentRealtimeStatusBoard />)

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText('에이전트 목록을 불러오는 중...')).toBeInTheDocument()
      // Loading is not the empty state and not the error state.
      expect(screen.queryByText('등록된 에이전트가 없습니다')).not.toBeInTheDocument()
      expect(screen.queryByText('에이전트 목록을 불러오지 못했습니다')).not.toBeInTheDocument()
    })
  })

  // ── Error ──────────────────────────────────────────────────

  describe('error state', () => {
    it('shows the full error panel when the load fails with no data to show', async () => {
      mockGetAgents.mockRejectedValue(
        new ApiError({ message: 'nope', status: 401, code: ApiErrorCode.UNAUTHORIZED }),
      )

      await renderBoard()

      const alert = screen.getByRole('alert')
      expect(within(alert).getByText('에이전트 목록을 불러오지 못했습니다')).toBeInTheDocument()
      expect(
        within(alert).getByText('You are not authenticated. Please log in.'),
      ).toBeInTheDocument()
      expect(within(alert).getByRole('button', { name: '에이전트 목록 다시 불러오기' })).toBeInTheDocument()

      // A failed load must never be dressed up as an empty registry.
      expect(screen.queryByText('등록된 에이전트가 없습니다')).not.toBeInTheDocument()
      expect(cards()).toHaveLength(0)
    })

    it('keeps the list visible and shows a stale-data banner when a REFRESH fails', async () => {
      mockGetAgents.mockResolvedValueOnce([AVAILABLE, BUSY])
      await renderBoard()
      expect(cards()).toHaveLength(2)

      mockGetAgents.mockRejectedValueOnce(new Error('network down'))
      fireEvent.click(screen.getAllByLabelText('에이전트 목록 새로고침')[0])

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

      // The banner is the recovery affordance; the data stays on screen.
      expect(
        screen.getByText(/^갱신에 실패해 이전 목록을 보여 주고 있습니다/),
      ).toBeInTheDocument()
      expect(cards()).toHaveLength(2)
      expect(screen.getByLabelText(/^에이전트 Alpha, /)).toBeInTheDocument()

      // The full-panel error must NOT take over while data is visible.
      expect(screen.queryByText('에이전트 목록을 불러오지 못했습니다')).not.toBeInTheDocument()
    })

    it('recovers when the retry succeeds', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('boom'))
      await renderBoard()
      expect(screen.getByText('에이전트 목록을 불러오지 못했습니다')).toBeInTheDocument()

      mockGetAgents.mockResolvedValueOnce([AVAILABLE])
      fireEvent.click(screen.getByRole('button', { name: '에이전트 목록 다시 불러오기' }))

      await waitFor(() => expect(cards()).toHaveLength(1))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  // ── Empty registry ─────────────────────────────────────────

  describe('empty registry', () => {
    it('shows the empty-state message when the registry is genuinely empty', async () => {
      mockGetAgents.mockResolvedValue([])

      await renderBoard()

      expect(screen.getByText('등록된 에이전트가 없습니다')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(cards()).toHaveLength(0)
    })

    it('renders NO mock agent names when the response is empty (mock-data regression guard)', async () => {
      mockGetAgents.mockResolvedValue([])

      await renderBoard()

      // The previous board fell back to MOCK_ACTIVITIES whenever the list was
      // empty. If that fallback — or any hardcoded seed — ever returns, these fail.
      for (const ghost of [
        'Codebase Researcher',
        'Planner Agent',
        'Executor Agent',
        'Reviewer Agent',
        'Test Runner',
      ]) {
        expect(screen.queryByText(ghost)).not.toBeInTheDocument()
      }
      expect(screen.getByText('등록된 에이전트가 없습니다')).toBeInTheDocument()
    })
  })

  // ── Rendering data ─────────────────────────────────────────

  describe('rendering agents', () => {
    it('renders one card per agent returned by the API', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE, BUSY, ERRORED])

      await renderBoard()

      expect(cards()).toHaveLength(3)
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Bravo')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
      expect(screen.getByText('조회된 에이전트: 3 / 3 개')).toBeInTheDocument()
    })

    it('maps each backend status onto its Korean state label', async () => {
      mockGetAgents.mockResolvedValue([
        AVAILABLE,
        BUSY,
        ERRORED,
        makeAgent({ id: 'd', name: 'Delta', status: 'unavailable' }),
      ])

      await renderBoard()

      expect(screen.getByLabelText(/^에이전트 Alpha, 상태 가용,/)).toBeInTheDocument()
      expect(screen.getByLabelText(/^에이전트 Bravo, 상태 작업 중,/)).toBeInTheDocument()
      expect(screen.getByLabelText(/^에이전트 Charlie, 상태 오류,/)).toBeInTheDocument()
      expect(screen.getByLabelText(/^에이전트 Delta, 상태 사용 불가,/)).toBeInTheDocument()
    })

    it('falls back to 사용 불가 for an unrecognised status instead of dropping the agent', async () => {
      mockGetAgents.mockResolvedValue([makeAgent({ id: 'x', name: 'Xray', status: 'quantum' })])

      await renderBoard()

      expect(cards()).toHaveLength(1)
      expect(screen.getByLabelText(/^에이전트 Xray, 상태 사용 불가,/)).toBeInTheDocument()
    })

    it('shows 배정 불가 only when status is available but is_available is false', async () => {
      mockGetAgents.mockResolvedValue([
        makeAgent({ id: 'sat', name: 'Saturated', status: 'available', is_available: false }),
        AVAILABLE,
      ])

      await renderBoard()

      expect(screen.getAllByText('배정 불가')).toHaveLength(1)
    })
  })

  // ── W2: unmeasured success rate ────────────────────────────

  describe('success rate display (W2 regression)', () => {
    it('renders — instead of 100% for an agent that has completed zero tasks', async () => {
      mockGetAgents.mockResolvedValue([
        makeAgent({
          id: 'zero',
          name: 'Zero Agent',
          total_tasks_completed: 0,
          // The registry's DEFAULT, not a measurement (agent_registry.py:95).
          success_rate: 1.0,
          avg_execution_time_ms: 1500,
        }),
      ])

      await renderBoard()

      // Presenting an untouched default as "100%" is exactly the fabricated-data
      // problem this feature exists to remove.
      expect(screen.getByLabelText('에이전트 Zero Agent, 상태 가용, 성공률 — (완료 0건)')).toBeInTheDocument()
    })

    it('renders a real percentage once tasks have actually been completed', async () => {
      mockGetAgents.mockResolvedValue([
        makeAgent({
          id: 'measured',
          name: 'Measured Agent',
          total_tasks_completed: 42,
          success_rate: 0.95,
        }),
      ])

      await renderBoard()

      expect(
        screen.getByLabelText('에이전트 Measured Agent, 상태 가용, 성공률 95% (완료 42건)'),
      ).toBeInTheDocument()
    })
  })

  // ── Filtering & search ─────────────────────────────────────

  describe('filtering and search', () => {
    it('filters by state when a gauge is clicked, and clears on a second click', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE, BUSY, ERRORED])
      await renderBoard()

      fireEvent.click(screen.getByLabelText(/^필터: 작업 중 상태 에이전트/))

      expect(cards()).toHaveLength(1)
      expect(screen.getByLabelText(/^에이전트 Bravo,/)).toBeInTheDocument()
      expect(screen.getByText('조회된 에이전트: 1 / 3 개')).toBeInTheDocument()

      fireEvent.click(screen.getByLabelText(/^필터: 작업 중 상태 에이전트/))
      expect(cards()).toHaveLength(3)
    })

    it('resets the state filter via the 필터 초기화 button', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE, BUSY])
      await renderBoard()

      fireEvent.click(screen.getByLabelText(/^필터: 작업 중 상태 에이전트/))
      expect(cards()).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: '상태 필터 초기화' }))
      expect(cards()).toHaveLength(2)
    })

    it('searches across name, description and category', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE, BUSY, ERRORED])
      await renderBoard()

      const search = screen.getByLabelText('에이전트 이름, 설명, 카테고리 검색')

      fireEvent.change(search, { target: { value: 'alpha' } })
      expect(cards()).toHaveLength(1)
      expect(screen.getByLabelText(/^에이전트 Alpha,/)).toBeInTheDocument()

      fireEvent.change(search, { target: { value: 'analysis jobs' } })
      expect(cards()).toHaveLength(1)
      expect(screen.getByLabelText(/^에이전트 Bravo,/)).toBeInTheDocument()

      fireEvent.change(search, { target: { value: 'automation' } })
      expect(cards()).toHaveLength(1)
      expect(screen.getByLabelText(/^에이전트 Charlie,/)).toBeInTheDocument()
    })

    it('distinguishes "no search match" from "empty registry"', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE, BUSY])
      await renderBoard()

      fireEvent.change(screen.getByLabelText('에이전트 이름, 설명, 카테고리 검색'), {
        target: { value: 'zzz-no-such-agent' },
      })

      expect(screen.getByText('일치하는 에이전트가 없습니다')).toBeInTheDocument()
      // Distinct copy matters: the registry is NOT empty, the filter is just narrow.
      expect(screen.queryByText('등록된 에이전트가 없습니다')).not.toBeInTheDocument()
      expect(cards()).toHaveLength(0)
    })
  })

  // ── Interaction ────────────────────────────────────────────

  describe('interaction', () => {
    it('calls onAgentSelect with the agent id when a card is clicked', async () => {
      const onAgentSelect = vi.fn()
      mockGetAgents.mockResolvedValue([AVAILABLE])
      render(<AgentRealtimeStatusBoard onAgentSelect={onAgentSelect} />)
      await waitFor(() => expect(cards()).toHaveLength(1))

      fireEvent.click(screen.getByLabelText(/^에이전트 Alpha,/))

      expect(onAgentSelect).toHaveBeenCalledWith('a')
    })

    it('re-fetches when the refresh button is pressed', async () => {
      mockGetAgents.mockResolvedValue([AVAILABLE])
      await renderBoard()
      expect(mockGetAgents).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getAllByLabelText('에이전트 목록 새로고침')[0])

      await waitFor(() => expect(mockGetAgents).toHaveBeenCalledTimes(2))
    })
  })
})
