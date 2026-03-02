// WebSocket connection management: connect, reconnect, disconnect, heartbeat

import { notificationService } from '../../services/notificationService'
import type { OrchestrationState, LLMProvider, ProviderUsage } from './types'
import { RECONNECT_CONFIG, calculateBackoff } from './types'
import { handleMessage, transformTask } from './wsHandler'
import type { Task } from './types'

type SetFn = (state: Partial<OrchestrationState> | ((state: OrchestrationState) => Partial<OrchestrationState>)) => void
type GetFn = () => OrchestrationState

// Setup WebSocket event handlers (shared between connect and reconnect)
function setupWebSocketHandlers(
  ws: WebSocket,
  sessionId: string,
  set: SetFn,
  get: GetFn
) {
  ws.onopen = () => {
    // Start heartbeat timer
    const heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', session_id: sessionId }))
      }
    }, RECONNECT_CONFIG.heartbeatInterval)

    set({
      connected: true,
      ws,
      isInitialLoading: false,
      connectionStatus: 'connected',
      reconnectAttempt: 0,
      heartbeatTimer,
    })
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handleMessage(data, set, get)
    } catch (e) {
      console.error('[WS] Failed to parse message:', e, event.data)
    }
  }

  ws.onclose = (_event) => {
    const { isIntentionalDisconnect, reconnectAttempt, heartbeatTimer } = get()

    // Clear heartbeat timer
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }

    set({
      connected: false,
      ws: null,
      connectionStatus: 'disconnected',
      heartbeatTimer: null,
    })

    // Auto-reconnect if not intentional and within max attempts
    if (!isIntentionalDisconnect && reconnectAttempt < RECONNECT_CONFIG.maxAttempts) {
      const delay = calculateBackoff(reconnectAttempt)
      const nextAttempt = reconnectAttempt + 1

      set({
        connectionStatus: 'reconnecting',
        reconnectAttempt: nextAttempt,
      })

      notificationService.notify('재연결 시도 중...', {
        body: `${nextAttempt}/${RECONNECT_CONFIG.maxAttempts} (${Math.round(delay / 1000)}초 후)`,
      })

      const timer = setTimeout(() => {
        get().reconnect()
      }, delay)

      set({ reconnectTimer: timer })
    } else if (reconnectAttempt >= RECONNECT_CONFIG.maxAttempts) {
      set({ connectionStatus: 'failed' })
      notificationService.notifyConnectionLost()
    }

    set({ isIntentionalDisconnect: false })
  }

  ws.onerror = (error) => {
    console.error('[WS] Error:', error)
    // Note: onclose will be called after onerror, so we just log here
  }
}

// Connect to WebSocket with project context
export async function connectWebSocket(set: SetFn, get: GetFn) {
  const { selectedProjectId } = get()

  // Get current organization ID if available
  let organizationId: string | null = null
  try {
    const { useOrganizationsStore } = await import('../organizations')
    const orgStore = useOrganizationsStore.getState()
    organizationId = orgStore.currentOrganization?.id ?? null
  } catch {
    // organizations store not available, continue without org_id
  }

  // Create session via REST API first (with project context)
  let sessionId: string
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: selectedProjectId,
        organization_id: organizationId,
      }),
    })
    if (!res.ok) {
      const error = await res.json()
      console.error('Failed to create session:', error.detail || error)
      set({ isInitialLoading: false })
      return
    }
    const data = await res.json()
    sessionId = data.session_id
  } catch (e) {
    console.error('Failed to create session:', e)
    set({ isInitialLoading: false })
    return
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${sessionId}`)

  // Set sessionId before handlers so it's available in onopen
  set({ sessionId, sessionProjectId: selectedProjectId })

  setupWebSocketHandlers(ws, sessionId, set, get)
}

// Reconnect to existing session
export async function reconnectWebSocket(set: SetFn, get: GetFn) {
  const { sessionId, connected, ws: existingWs, connectionStatus } = get()

  // Already connected or connecting
  if (connected && existingWs) return
  if (connectionStatus === 'connecting') return

  // No session to reconnect to
  if (!sessionId) {
    set({ isInitialLoading: false, connectionStatus: 'disconnected' })
    return
  }

  set({ connectionStatus: 'connecting' })

  // Sync session state from server (validates session and gets latest tasks)
  try {
    const syncRes = await fetch(`/api/sessions/${sessionId}/sync`)

    if (!syncRes.ok) {
      // Session expired or not found - clear local state
      set({
        sessionId: null,
        sessionProjectId: null,
        sessionInfo: null,
        tasks: {},
        rootTaskId: null,
        agents: {},
        pendingApprovals: {},
        waitingForApproval: false,
        tokenUsage: {},
        providerUsage: {} as Record<LLMProvider, ProviderUsage>,
        totalCost: 0,
        messages: [],
        reconnectAttempt: 0,
        connectionStatus: 'disconnected',
        isInitialLoading: false,
      })
      // Don't auto-create new session - let user decide
      return
    }

    // Sync server state to local
    const syncData = await syncRes.json()

    // Transform and merge tasks from server
    const serverTasks: Record<string, Task> = {}
    for (const [id, raw] of Object.entries(syncData.tasks || {})) {
      serverTasks[id] = transformTask(raw as Record<string, unknown>)
    }

    set({
      sessionInfo: syncData.session_info,
      tasks: serverTasks,
      rootTaskId: syncData.root_task_id,
      agents: syncData.agents || {},
      pendingApprovals: syncData.pending_approvals || {},
      waitingForApproval: syncData.waiting_for_approval || false,
      tokenUsage: syncData.token_usage || {},
      totalCost: syncData.total_cost || 0,
    })
  } catch (e) {
    console.error('[Session] Failed to sync session:', e)
    set({
      sessionId: null,
      sessionProjectId: null,
      sessionInfo: null,
      tasks: {},
      rootTaskId: null,
      reconnectAttempt: 0,
      connectionStatus: 'disconnected',
      isInitialLoading: false,
    })
    return
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${sessionId}`)

  setupWebSocketHandlers(ws, sessionId, set, get)
}

// Disconnect WebSocket
export function disconnectWebSocket(set: SetFn, get: GetFn) {
  const { ws, reconnectTimer, heartbeatTimer } = get()

  // Clear timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
  }

  set({ isIntentionalDisconnect: true })
  if (ws) {
    ws.close()
  }
  set({
    connected: false,
    ws: null,
    sessionId: null,
    connectionStatus: 'disconnected',
    reconnectAttempt: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
  })
}

// Clear all session data
export function clearSessionData(set: SetFn, get: GetFn) {
  const { ws, reconnectTimer, heartbeatTimer } = get()

  // Clear timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
  }

  set({ isIntentionalDisconnect: true })
  if (ws) {
    ws.close()
  }
  set({
    sessionId: null,
    sessionProjectId: null,
    connected: false,
    ws: null,
    connectionStatus: 'disconnected',
    reconnectAttempt: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    tasks: {},
    rootTaskId: null,
    currentTaskId: null,
    agents: {},
    activeAgentId: null,
    messages: [],
    isProcessing: false,
    pendingApprovals: {},
    waitingForApproval: false,
    tokenUsage: {},
    providerUsage: {} as Record<LLMProvider, ProviderUsage>,
    totalCost: 0,
    sessionInfo: null,
  })
}
