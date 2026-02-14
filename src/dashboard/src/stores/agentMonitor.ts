/**
 * Agent Monitor Store - Zustand store for real-time agent monitoring.
 *
 * Manages SSE EventSource connections, agent status tracking,
 * metrics data fetching, and time-series buffering with auto-reconnect.
 */

import { create } from 'zustand'
import { getApiUrl } from '../config/api'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type AgentStatusValue = 'idle' | 'running' | 'error' | 'offline'
type MetricType = 'success_rate' | 'avg_duration_ms' | 'total_cost' | 'task_count' | 'error_count'
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface AgentStatusEvent {
  agent_id: string
  status: AgentStatusValue
  timestamp: string
}

interface AgentMetricEvent {
  agent_id: string
  metric_type: MetricType
  value: number
  timestamp: string
}

interface HeartbeatEvent {
  timestamp: string
}

type SSEEvent =
  | { type: 'agent_status'; data: AgentStatusEvent }
  | { type: 'agent_metric'; data: AgentMetricEvent }
  | { type: 'heartbeat'; data: HeartbeatEvent }

interface AgentInfo {
  agent_id: string
  name: string
  status: AgentStatusValue
  last_active: string
  total_tasks: number
  successful_tasks: number
  total_cost: number
  avg_duration_ms: number
}

interface MetricBucket {
  timestamp: string
  success_rate: number
  avg_duration_ms: number
  total_cost: number
  task_count: number
}

interface AgentMetricsData {
  agent_id: string
  buckets: MetricBucket[]
}

interface MetricsSummary {
  total_agents: number
  active_agents: number
  avg_success_rate: number
  total_cost_24h: number
  tasks_completed_24h: number
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_EVENT_BUFFER = 720 // 1 hour at 5-second intervals
const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000
const BACKOFF_MULTIPLIER = 2

// ─────────────────────────────────────────────────────────────
// Store Interface
// ─────────────────────────────────────────────────────────────

interface AgentMonitorState {
  // Connection
  connectionStatus: ConnectionStatus
  eventSource: EventSource | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null

  // Agent data
  agents: Record<string, AgentInfo>
  selectedAgentId: string | null

  // Time-series event buffer
  eventBuffer: SSEEvent[]

  // Metrics
  agentMetrics: AgentMetricsData | null
  metricsSummary: MetricsSummary | null
  selectedPeriod: '1h' | '6h' | '24h'
  isLoadingMetrics: boolean
  isLoadingSummary: boolean

  // Error
  error: string | null

  // Actions
  connect: () => void
  disconnect: () => void
  addEvent: (event: SSEEvent) => void
  selectAgent: (agentId: string | null) => void
  setSelectedPeriod: (period: '1h' | '6h' | '24h') => void
  fetchMetrics: (agentId: string, period?: string, bucket?: string) => Promise<void>
  fetchSummary: () => Promise<void>
  clearError: () => void
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

/** 에이전트 실시간 모니터링 상태 관리 스토어 (SSE 연결, 메트릭, 이벤트 버퍼). */
export const useAgentMonitorStore = create<AgentMonitorState>((set, get) => ({
  // Initial state
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

  // ── Connect to SSE ───────────────────────────────────────

  connect: () => {
    const { eventSource, connectionStatus } = get()

    // Don't connect if already connected or connecting
    if (eventSource || connectionStatus === 'connecting') {
      return
    }

    set({ connectionStatus: 'connecting', error: null })

    const url = getApiUrl('/api/v1/agents/monitor/stream?interval=5')
    const source = new EventSource(url)

    source.addEventListener('agent_status', (event: MessageEvent) => {
      const data: AgentStatusEvent = JSON.parse(event.data)
      const { agents } = get()
      const existing = agents[data.agent_id]

      set((state) => ({
        agents: {
          ...state.agents,
          [data.agent_id]: {
            agent_id: data.agent_id,
            name: existing?.name ?? data.agent_id,
            status: data.status,
            last_active: data.timestamp,
            total_tasks: existing?.total_tasks ?? 0,
            successful_tasks: existing?.successful_tasks ?? 0,
            total_cost: existing?.total_cost ?? 0,
            avg_duration_ms: existing?.avg_duration_ms ?? 0,
          },
        },
      }))

      get().addEvent({ type: 'agent_status', data })
    })

    source.addEventListener('agent_metric', (event: MessageEvent) => {
      const data: AgentMetricEvent = JSON.parse(event.data)

      get().addEvent({ type: 'agent_metric', data })
    })

    source.addEventListener('heartbeat', (event: MessageEvent) => {
      const data: HeartbeatEvent = JSON.parse(event.data)

      // Heartbeat confirms connection is alive
      if (get().connectionStatus !== 'connected') {
        set({ connectionStatus: 'connected' })
      }

      get().addEvent({ type: 'heartbeat', data })
    })

    source.onopen = () => {
      set({
        connectionStatus: 'connected',
        reconnectAttempts: 0,
      })
    }

    source.onerror = () => {
      const { reconnectAttempts, reconnectTimer } = get()

      // Clean up current source
      source.close()

      // Clear existing timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, reconnectAttempts),
        MAX_RECONNECT_DELAY_MS,
      )

      set({
        connectionStatus: 'reconnecting',
        eventSource: null,
        reconnectAttempts: reconnectAttempts + 1,
      })

      // Schedule reconnection
      const timer = setTimeout(() => {
        set({ reconnectTimer: null })
        get().connect()
      }, delay)

      set({ reconnectTimer: timer })
    }

    set({ eventSource: source })
  },

  // ── Disconnect from SSE ──────────────────────────────────

  disconnect: () => {
    const { eventSource, reconnectTimer } = get()

    if (eventSource) {
      eventSource.close()
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    set({
      connectionStatus: 'disconnected',
      eventSource: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
    })
  },

  // ── Add Event to Buffer ──────────────────────────────────

  addEvent: (event: SSEEvent) => {
    set((state) => {
      const newBuffer = [...state.eventBuffer, event]
      // Trim buffer to max size
      if (newBuffer.length > MAX_EVENT_BUFFER) {
        return { eventBuffer: newBuffer.slice(newBuffer.length - MAX_EVENT_BUFFER) }
      }
      return { eventBuffer: newBuffer }
    })
  },

  // ── Select Agent ─────────────────────────────────────────

  selectAgent: (agentId: string | null) => {
    set({ selectedAgentId: agentId, agentMetrics: null })
  },

  // ── Set Period ───────────────────────────────────────────

  setSelectedPeriod: (period: '1h' | '6h' | '24h') => {
    set({ selectedPeriod: period })
  },

  // ── Fetch Metrics ────────────────────────────────────────

  fetchMetrics: async (agentId: string, period?: string, bucket?: string) => {
    set({ isLoadingMetrics: true, error: null })

    const effectivePeriod = period ?? get().selectedPeriod
    const effectiveBucket = bucket ?? (effectivePeriod === '1h' ? '5m' : effectivePeriod === '6h' ? '15m' : '1h')

    try {
      const url = getApiUrl(
        `/api/v1/agents/metrics?agent_id=${encodeURIComponent(agentId)}&period=${effectivePeriod}&bucket=${effectiveBucket}`,
      )
      const res = await fetch(url)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(errorData.detail || `HTTP ${res.status}`)
      }

      const data: AgentMetricsData = await res.json()
      set({ agentMetrics: data, isLoadingMetrics: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch metrics'
      set({ error: errorMessage, isLoadingMetrics: false })
    }
  },

  // ── Fetch Summary ────────────────────────────────────────

  fetchSummary: async () => {
    set({ isLoadingSummary: true, error: null })

    try {
      const url = getApiUrl('/api/v1/agents/metrics/summary')
      const res = await fetch(url)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(errorData.detail || `HTTP ${res.status}`)
      }

      const data: MetricsSummary = await res.json()
      set({ metricsSummary: data, isLoadingSummary: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch summary'
      set({ error: errorMessage, isLoadingSummary: false })
    }
  },

  // ── Clear Error ──────────────────────────────────────────

  clearError: () => {
    set({ error: null })
  },
}))
