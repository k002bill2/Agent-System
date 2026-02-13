import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAgentMonitorStore } from '../agentMonitor'

// ─────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

interface MockEventSourceInstance {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]>
  close: ReturnType<typeof vi.fn>
  onopen: (() => void) | null
  onerror: (() => void) | null
  addEventListener: (event: string, handler: (e: MessageEvent) => void) => void
}

let lastEventSource: MockEventSourceInstance | null = null

class MockEventSource implements MockEventSourceInstance {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastEventSource = this
  }

  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  _emit(event: string, data: Record<string, unknown>) {
    const handlers = this.listeners[event] || []
    for (const handler of handlers) {
      handler({ data: JSON.stringify(data) } as MessageEvent)
    }
  }
}

// @ts-expect-error - Mock EventSource for testing
global.EventSource = MockEventSource

function resetStore() {
  useAgentMonitorStore.setState({
    connectionStatus: 'disconnected',
    eventSource: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    agents: {},
    selectedAgentId: null,
    eventBuffer: [],
    agentMetrics: null,
    metricsSummary: null,
    selectedPeriod: '1h',
    isLoadingMetrics: false,
    isLoadingSummary: false,
    error: null,
  })
  lastEventSource = null
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('agentMonitor store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Connection Management ────────────────────────────────

  describe('connect/disconnect', () => {
    it('creates EventSource and sets connecting status', () => {
      useAgentMonitorStore.getState().connect()

      const state = useAgentMonitorStore.getState()
      expect(state.connectionStatus).toBe('connecting')
      expect(state.eventSource).not.toBeNull()
      expect(lastEventSource).not.toBeNull()
      expect(lastEventSource?.url).toContain('/api/v1/agents/monitor/stream')
    })

    it('sets connected status on open', () => {
      useAgentMonitorStore.getState().connect()

      // Simulate onopen
      lastEventSource?.onopen?.()

      expect(useAgentMonitorStore.getState().connectionStatus).toBe('connected')
      expect(useAgentMonitorStore.getState().reconnectAttempts).toBe(0)
    })

    it('disconnect closes EventSource and resets state', () => {
      useAgentMonitorStore.getState().connect()
      const source = lastEventSource

      useAgentMonitorStore.getState().disconnect()

      expect(source?.close).toHaveBeenCalled()
      const state = useAgentMonitorStore.getState()
      expect(state.connectionStatus).toBe('disconnected')
      expect(state.eventSource).toBeNull()
      expect(state.reconnectAttempts).toBe(0)
    })

    it('handles SSE agent_status events and updates agents map', () => {
      useAgentMonitorStore.getState().connect()

      // Simulate agent_status event
      lastEventSource?._emit('agent_status', {
        agent_id: 'agent-1',
        status: 'running',
        timestamp: '2025-01-01T00:00:00Z',
      })

      const agents = useAgentMonitorStore.getState().agents
      expect(agents['agent-1']).toBeDefined()
      expect(agents['agent-1'].status).toBe('running')
      expect(agents['agent-1'].agent_id).toBe('agent-1')
    })

    it('does not create duplicate connections', () => {
      useAgentMonitorStore.getState().connect()
      const firstSource = lastEventSource

      // Try connecting again
      useAgentMonitorStore.getState().connect()

      // Should still be the same EventSource
      expect(lastEventSource).toBe(firstSource)
    })
  })

  // ── Event Buffer ─────────────────────────────────────────

  describe('event buffer', () => {
    it('adds events to buffer', () => {
      useAgentMonitorStore.getState().addEvent({
        type: 'agent_status',
        data: { agent_id: 'a1', status: 'running', timestamp: '2025-01-01T00:00:00Z' },
      })

      expect(useAgentMonitorStore.getState().eventBuffer).toHaveLength(1)
    })

    it('trims buffer when exceeding max size', () => {
      // Fill buffer beyond max (720)
      for (let i = 0; i < 730; i++) {
        useAgentMonitorStore.getState().addEvent({
          type: 'heartbeat',
          data: { timestamp: `2025-01-01T00:00:${String(i).padStart(2, '0')}Z` },
        })
      }

      expect(useAgentMonitorStore.getState().eventBuffer.length).toBeLessThanOrEqual(720)
    })

    it('preserves most recent events when trimming', () => {
      // Add 725 events
      for (let i = 0; i < 725; i++) {
        useAgentMonitorStore.getState().addEvent({
          type: 'heartbeat',
          data: { timestamp: `event-${i}` },
        })
      }

      const buffer = useAgentMonitorStore.getState().eventBuffer
      // Last event should be the most recent
      const lastEvent = buffer[buffer.length - 1]
      expect(lastEvent.type).toBe('heartbeat')
      expect((lastEvent.data as { timestamp: string }).timestamp).toBe('event-724')
    })
  })

  // ── Metrics Fetch ────────────────────────────────────────

  describe('fetchMetrics', () => {
    it('fetches and stores metrics data', async () => {
      const metricsData = {
        agent_id: 'agent-1',
        buckets: [
          { timestamp: '2025-01-01T00:00:00Z', success_rate: 0.95, avg_duration_ms: 300, total_cost: 1.5, task_count: 10 },
          { timestamp: '2025-01-01T00:05:00Z', success_rate: 0.88, avg_duration_ms: 350, total_cost: 2.0, task_count: 8 },
        ],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(metricsData),
      })

      await useAgentMonitorStore.getState().fetchMetrics('agent-1', '1h', '5m')

      const state = useAgentMonitorStore.getState()
      expect(state.agentMetrics).toEqual(metricsData)
      expect(state.isLoadingMetrics).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Agent not found' }),
      })

      await useAgentMonitorStore.getState().fetchMetrics('nonexistent')

      const state = useAgentMonitorStore.getState()
      expect(state.error).toBe('Agent not found')
      expect(state.isLoadingMetrics).toBe(false)
    })
  })

  // ── Summary Fetch ────────────────────────────────────────

  describe('fetchSummary', () => {
    it('fetches and stores summary data', async () => {
      const summaryData = {
        total_agents: 4,
        active_agents: 3,
        avg_success_rate: 0.92,
        total_cost_24h: 50.0,
        tasks_completed_24h: 180,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(summaryData),
      })

      await useAgentMonitorStore.getState().fetchSummary()

      const state = useAgentMonitorStore.getState()
      expect(state.metricsSummary).toEqual(summaryData)
      expect(state.isLoadingSummary).toBe(false)
    })

    it('sets error on summary fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Server error' }),
      })

      await useAgentMonitorStore.getState().fetchSummary()

      expect(useAgentMonitorStore.getState().error).toBe('Server error')
      expect(useAgentMonitorStore.getState().isLoadingSummary).toBe(false)
    })
  })

  // ── UI Actions ───────────────────────────────────────────

  describe('UI actions', () => {
    it('selectAgent sets selected ID and clears metrics', () => {
      useAgentMonitorStore.setState({
        agentMetrics: { agent_id: 'old', buckets: [] },
      })

      useAgentMonitorStore.getState().selectAgent('agent-2')

      expect(useAgentMonitorStore.getState().selectedAgentId).toBe('agent-2')
      expect(useAgentMonitorStore.getState().agentMetrics).toBeNull()
    })

    it('setSelectedPeriod updates period', () => {
      useAgentMonitorStore.getState().setSelectedPeriod('24h')
      expect(useAgentMonitorStore.getState().selectedPeriod).toBe('24h')
    })

    it('clearError clears error state', () => {
      useAgentMonitorStore.setState({ error: 'test error' })
      useAgentMonitorStore.getState().clearError()
      expect(useAgentMonitorStore.getState().error).toBeNull()
    })
  })
})
