import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { notificationService } from '../services/notificationService'

// Types
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

// Connection status for auto-reconnect
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

// Reconnect configuration
const RECONNECT_CONFIG = {
  maxAttempts: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  heartbeatInterval: 25000,
}

// Exponential backoff with jitter
const calculateBackoff = (attempt: number): number => {
  const delay = Math.min(
    RECONNECT_CONFIG.baseDelay * Math.pow(2, attempt),
    RECONNECT_CONFIG.maxDelay
  )
  // Add jitter (0-1000ms)
  return delay + Math.random() * 1000
}

export interface Project {
  id: string
  name: string
  path: string
  description: string
  has_claude_md: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  parentId: string | null
  children: string[]
  result?: unknown
  error?: string
  createdAt: string
  updatedAt: string
  // Soft delete fields
  isDeleted: boolean
  deletedAt: string | null
}

export interface Agent {
  id: string
  name: string
  role: string
  status: TaskStatus
  currentTask: string | null
}

export interface Message {
  id: string
  type: string
  content: string
  timestamp: string
  agentId?: string
}

export interface ApprovalRequest {
  approval_id: string
  task_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  risk_level: string
  risk_description: string
  created_at: string
  status: 'pending' | 'approved' | 'denied'
}

export interface TokenUsage {
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_cost_usd: number
  call_count: number
}

export interface SessionInfo {
  session_id: string
  created_at: string
  last_activity: string
  expires_at: string
  is_expired: boolean
  is_inactive: boolean
  ttl_remaining_hours: number
}

interface OrchestrationState {
  // Connection
  sessionId: string | null
  sessionProjectId: string | null  // 현재 세션이 연결된 프로젝트 ID
  connected: boolean
  ws: WebSocket | null
  isInitialLoading: boolean
  isIntentionalDisconnect: boolean
  // Auto-reconnect
  connectionStatus: ConnectionStatus
  reconnectAttempt: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimer: ReturnType<typeof setInterval> | null
  // Session TTL
  sessionInfo: SessionInfo | null

  // Projects
  projects: Project[]
  selectedProjectId: string | null

  // Tasks
  tasks: Record<string, Task>
  rootTaskId: string | null
  currentTaskId: string | null

  // Agents
  agents: Record<string, Agent>
  activeAgentId: string | null

  // Messages/Events
  messages: Message[]
  isProcessing: boolean

  // HITL (Human-in-the-Loop)
  pendingApprovals: Record<string, ApprovalRequest>
  waitingForApproval: boolean

  // Token/Cost tracking
  tokenUsage: Record<string, TokenUsage>
  totalCost: number

  // Warp integration
  warpInstalled: boolean | null
  warpLoading: boolean

  // Task filters
  showDeletedTasks: boolean

  // Actions
  fetchProjects: () => Promise<void>
  selectProject: (projectId: string | null) => void
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  refreshSession: () => Promise<boolean>
  sendMessage: (content: string) => void
  cancelTask: () => void
  approveOperation: (approvalId: string, note?: string) => Promise<void>
  denyOperation: (approvalId: string, note?: string) => Promise<void>
  clearSession: () => void
  openInWarp: (command?: string) => Promise<{ success: boolean; error?: string; sessionMonitorHint?: string }>
  checkWarpStatus: () => Promise<void>
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
  // Task deletion actions
  deleteTask: (taskId: string) => Promise<{ success: boolean; error?: string; deletedIds?: string[] }>
  cancelSingleTask: (taskId: string) => Promise<{ success: boolean; error?: string }>
  getTaskDeletionInfo: (taskId: string) => Promise<{
    exists: boolean
    childrenCount?: number
    inProgressCount?: number
    inProgressIds?: string[]
    canDelete?: boolean
  }>
  setShowDeletedTasks: (show: boolean) => void
  // Task retry action
  retryTask: (taskId: string) => Promise<{ success: boolean; error?: string; retryCount?: number }>
}

export const useOrchestrationStore = create<OrchestrationState>()(
  persist(
    (set, get) => ({
  // Initial state
  sessionId: null,
  sessionProjectId: null,
  connected: false,
  ws: null,
  isInitialLoading: true,
  isIntentionalDisconnect: false,
  // Auto-reconnect initial state
  connectionStatus: 'disconnected',
  reconnectAttempt: 0,
  reconnectTimer: null,
  heartbeatTimer: null,
  // Session TTL
  sessionInfo: null,
  projects: [],
  selectedProjectId: null,
  tasks: {},
  rootTaskId: null,
  currentTaskId: null,
  agents: {},
  activeAgentId: null,
  messages: [],
  isProcessing: false,
  pendingApprovals: {},
  waitingForApproval: false,

  // Token/Cost tracking - initial state
  tokenUsage: {},
  totalCost: 0,

  // Warp integration - initial state
  warpInstalled: null,
  warpLoading: false,

  // Task filters - initial state
  showDeletedTasks: false,

  // Hydration state
  _hasHydrated: false,
  setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

  // Fetch projects from API
  fetchProjects: async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const projects = await res.json()
        set({ projects })

        // Auto-select first project if none selected
        const { selectedProjectId } = get()
        if (!selectedProjectId && projects.length > 0) {
          set({ selectedProjectId: projects[0].id })
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e)
    }
  },

  // Select a project
  selectProject: (projectId: string | null) => {
    set({ selectedProjectId: projectId })
  },

  // Connect to WebSocket with project context
  connect: async () => {
    const { selectedProjectId } = get()

    // Create session via REST API first (with project context)
    let sessionId: string
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProjectId }),
      })
      const data = await res.json()
      sessionId = data.session_id
    } catch (e) {
      console.error('Failed to create session:', e)
      set({ isInitialLoading: false })
      return
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${sessionId}`)

    ws.onopen = () => {
      // Start heartbeat timer
      const heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', session_id: sessionId }))
        }
      }, RECONNECT_CONFIG.heartbeatInterval)

      set({
        connected: true,
        sessionId,
        sessionProjectId: selectedProjectId,
        ws,
        isInitialLoading: false,
        connectionStatus: 'connected',
        reconnectAttempt: 0,
        heartbeatTimer,
      })
      console.log('[WS] Connected with heartbeat')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('[WS] Received message:', data)
        handleMessage(data, set, get)
      } catch (e) {
        console.error('[WS] Failed to parse message:', e, event.data)
      }
    }

    ws.onclose = (event) => {
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

      console.log('[WS] Disconnected:', { code: event.code, reason: event.reason })

      // Auto-reconnect if not intentional and within max attempts
      if (!isIntentionalDisconnect && reconnectAttempt < RECONNECT_CONFIG.maxAttempts) {
        const delay = calculateBackoff(reconnectAttempt)
        const nextAttempt = reconnectAttempt + 1

        set({
          connectionStatus: 'reconnecting',
          reconnectAttempt: nextAttempt,
        })

        console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${nextAttempt}/${RECONNECT_CONFIG.maxAttempts})`)

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
  },

  // Disconnect
  disconnect: () => {
    const { ws, reconnectTimer, heartbeatTimer } = get()

    // Clear timers
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }

    // 의도적 종료 플래그 설정
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
  },

  // Reconnect to existing session
  reconnect: async () => {
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
        console.log('[Session] Session expired or not found, clearing local state')
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
      console.log('[Session] Synced from server:', {
        taskCount: Object.keys(syncData.tasks || {}).length,
        ttl: syncData.session_info?.ttl_remaining_hours?.toFixed(1),
      })

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
      console.log('[WS] Reconnected to session:', sessionId)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('[WS] Received message:', data)
        handleMessage(data, set, get)
      } catch (e) {
        console.error('[WS] Failed to parse message:', e, event.data)
      }
    }

    ws.onclose = (event) => {
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

      console.log('[WS] Disconnected:', { code: event.code, reason: event.reason })

      // Auto-reconnect if not intentional and within max attempts
      if (!isIntentionalDisconnect && reconnectAttempt < RECONNECT_CONFIG.maxAttempts) {
        const delay = calculateBackoff(reconnectAttempt)
        const nextAttempt = reconnectAttempt + 1

        set({
          connectionStatus: 'reconnecting',
          reconnectAttempt: nextAttempt,
        })

        console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${nextAttempt}/${RECONNECT_CONFIG.maxAttempts})`)

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
  },

  // Clear all session data
  clearSession: () => {
    const { ws, reconnectTimer, heartbeatTimer } = get()

    // Clear timers
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }

    // 의도적 종료 플래그 설정
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
      totalCost: 0,
      sessionInfo: null,
    })
  },

  // Refresh session TTL
  refreshSession: async () => {
    const { sessionId } = get()
    if (!sessionId) return false

    try {
      const res = await fetch(`/api/sessions/${sessionId}/refresh`, {
        method: 'POST',
      })

      if (!res.ok) {
        console.log('[Session] Refresh failed, session may be expired')
        return false
      }

      // Update session info
      const infoRes = await fetch(`/api/sessions/${sessionId}/info`)
      if (infoRes.ok) {
        const sessionInfo = await infoRes.json()
        set({ sessionInfo })
        console.log(`[Session] Refreshed, TTL: ${sessionInfo.ttl_remaining_hours.toFixed(1)} hours`)
      }

      return true
    } catch (e) {
      console.error('[Session] Refresh error:', e)
      return false
    }
  },

  // Send message
  sendMessage: (content: string) => {
    const { ws, sessionId } = get()
    if (!ws || !sessionId) return

    const message = {
      type: 'task_create',
      payload: {
        title: content.slice(0, 50),
        description: content,
      },
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    }

    console.log('[WS] Sending message:', message)
    ws.send(JSON.stringify(message))
    set({ isProcessing: true })

    // Add user message to history
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          type: 'user',
          content,
          timestamp: new Date().toISOString(),
        },
      ],
    }))
  },

  // Cancel current task
  cancelTask: () => {
    const { ws, sessionId } = get()
    if (!ws || !sessionId) return

    ws.send(
      JSON.stringify({
        type: 'task_cancel',
        payload: {},
        session_id: sessionId,
      })
    )
  },

  // HITL: Approve operation
  approveOperation: async (approvalId: string, note?: string) => {
    const { ws, sessionId } = get()
    if (!ws || !sessionId) return

    ws.send(
      JSON.stringify({
        type: 'approval_response',
        payload: {
          approval_id: approvalId,
          approved: true,
          note,
        },
        session_id: sessionId,
      })
    )

    // Optimistically update local state
    set((state) => ({
      pendingApprovals: {
        ...state.pendingApprovals,
        [approvalId]: {
          ...state.pendingApprovals[approvalId],
          status: 'approved' as const,
        },
      },
      waitingForApproval: false,
    }))
  },

  // HITL: Deny operation
  denyOperation: async (approvalId: string, note?: string) => {
    const { ws, sessionId } = get()
    if (!ws || !sessionId) return

    ws.send(
      JSON.stringify({
        type: 'approval_response',
        payload: {
          approval_id: approvalId,
          approved: false,
          note,
        },
        session_id: sessionId,
      })
    )

    // Optimistically update local state
    set((state) => ({
      pendingApprovals: {
        ...state.pendingApprovals,
        [approvalId]: {
          ...state.pendingApprovals[approvalId],
          status: 'denied' as const,
        },
      },
      waitingForApproval: false,
      isProcessing: false,
    }))
  },

  // Check Warp installation status
  checkWarpStatus: async () => {
    try {
      const res = await fetch('/api/warp/status')
      if (res.ok) {
        const data = await res.json()
        set({ warpInstalled: data.installed })
      }
    } catch (e) {
      console.error('Failed to check Warp status:', e)
      set({ warpInstalled: false })
    }
  },

  // Open project in Warp terminal with Claude CLI
  openInWarp: async (command?: string) => {
    const { selectedProjectId } = get()
    if (!selectedProjectId) {
      return { success: false, error: 'No project selected' }
    }

    set({ warpLoading: true })

    try {
      const res = await fetch('/api/warp/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProjectId,
          command: command || undefined,
          use_claude_cli: true,
        }),
      })

      const data = await res.json()
      set({ warpLoading: false })

      if (data.success) {
        // Docker mode: backend can't open Warp, frontend opens the URI
        if (data.open_via_frontend && data.uri) {
          window.location.href = data.uri
        }
        // Non-Docker: backend already opened Warp via subprocess

        return {
          success: true,
          sessionMonitorHint: 'Claude Sessions 탭에서 진행 상황을 확인하세요.',
        }
      } else {
        return { success: false, error: data.error || 'Failed to open Warp' }
      }
    } catch (e) {
      console.error('Failed to open Warp:', e)
      set({ warpLoading: false })
      return { success: false, error: 'Failed to connect to server' }
    }
  },

  // Delete task (soft delete)
  deleteTask: async (taskId: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { success: false, error: 'No active session' }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          success: false,
          error: error.detail?.message || error.detail || 'Failed to delete task',
        }
      }

      const data = await res.json()

      // Update local state to mark tasks as deleted
      set((state) => {
        const updatedTasks = { ...state.tasks }
        const deletedIds = data.deleted_task_ids || []
        const now = new Date().toISOString()

        for (const id of deletedIds) {
          if (updatedTasks[id]) {
            updatedTasks[id] = {
              ...updatedTasks[id],
              isDeleted: true,
              deletedAt: now,
            }
          }
        }

        return { tasks: updatedTasks }
      })

      return { success: true, deletedIds: data.deleted_task_ids }
    } catch (e) {
      console.error('Failed to delete task:', e)
      return { success: false, error: 'Failed to connect to server' }
    }
  },

  // Cancel a single task
  cancelSingleTask: async (taskId: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { success: false, error: 'No active session' }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}/cancel`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          success: false,
          error: error.detail || 'Failed to cancel task',
        }
      }

      // Update local state
      set((state) => ({
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...state.tasks[taskId],
            status: 'cancelled' as TaskStatus,
          },
        },
      }))

      return { success: true }
    } catch (e) {
      console.error('Failed to cancel task:', e)
      return { success: false, error: 'Failed to connect to server' }
    }
  },

  // Get task deletion info
  getTaskDeletionInfo: async (taskId: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { exists: false }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}/deletion-info`)

      if (!res.ok) {
        return { exists: false }
      }

      const data = await res.json()
      return {
        exists: data.exists,
        childrenCount: data.children_count,
        inProgressCount: data.in_progress_count,
        inProgressIds: data.in_progress_ids,
        canDelete: data.can_delete,
      }
    } catch (e) {
      console.error('Failed to get deletion info:', e)
      return { exists: false }
    }
  },

  // Set show deleted tasks filter
  setShowDeletedTasks: (show: boolean) => {
    set({ showDeletedTasks: show })
  },

  // Retry a failed or cancelled task
  retryTask: async (taskId: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { success: false, error: 'No active session' }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}/retry`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          success: false,
          error: error.detail || 'Failed to retry task',
        }
      }

      const data = await res.json()

      // Update local state
      set((state) => ({
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...state.tasks[taskId],
            status: 'pending' as TaskStatus,
            error: undefined,
          },
        },
      }))

      return { success: true, retryCount: data.retry_count }
    } catch (e) {
      console.error('Failed to retry task:', e)
      return { success: false, error: 'Failed to connect to server' }
    }
  },
}),
    {
      name: 'orchestration-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential data, exclude WebSocket and transient state
      partialize: (state) => ({
        sessionId: state.sessionId,
        sessionProjectId: state.sessionProjectId,
        selectedProjectId: state.selectedProjectId,
        tasks: state.tasks,
        rootTaskId: state.rootTaskId,
        agents: state.agents,
        messages: state.messages,
        pendingApprovals: state.pendingApprovals,
        tokenUsage: state.tokenUsage,
        totalCost: state.totalCost,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

// Helper: Transform snake_case task from backend to camelCase Task
function transformTask(raw: Record<string, unknown>): Task {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: raw.description as string,
    status: raw.status as TaskStatus,
    parentId: (raw.parent_id ?? raw.parentId ?? null) as string | null,
    children: (raw.children ?? []) as string[],
    result: raw.result,
    error: raw.error as string | undefined,
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()) as string,
    // Soft delete fields
    isDeleted: (raw.is_deleted ?? raw.isDeleted ?? false) as boolean,
    deletedAt: (raw.deleted_at ?? raw.deletedAt ?? null) as string | null,
  }
}

// Message handler
function handleMessage(
  data: {
    type: string
    payload: Record<string, unknown>
    session_id?: string
    timestamp?: string
  },
  set: (state: Partial<OrchestrationState> | ((state: OrchestrationState) => Partial<OrchestrationState>)) => void,
  _get: () => OrchestrationState
) {
  const { type, payload } = data

  switch (type) {
    case 'task_started':
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'system',
            content: 'Task started',
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      break

    case 'task_progress':
      // Update task progress
      break

    case 'task_completed':
      set((state) => ({
        isProcessing: false,
        rootTaskId: payload.root_task_id as string | null,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'system',
            content: 'Task completed',
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      notificationService.notifyTaskCompleted((payload.title as string) || 'Task completed')
      break

    case 'task_failed':
      set((state) => ({
        isProcessing: false,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'error',
            content: `Task failed: ${payload.reason || 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      notificationService.notifyTaskFailed((payload.reason as string) || 'Unknown error')
      break

    case 'agent_thinking':
      set((state) => ({
        activeAgentId: payload.agent_id as string,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'thinking',
            content: payload.thought as string,
            timestamp: new Date().toISOString(),
            agentId: payload.agent_id as string,
          },
        ],
      }))
      break

    case 'agent_action':
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'action',
            content: `${payload.agent_name}: ${payload.action}`,
            timestamp: new Date().toISOString(),
            agentId: payload.agent_id as string,
          },
        ],
      }))
      break

    case 'state_update': {
      const rawTasks = (payload.tasks as Record<string, Record<string, unknown>>) || {}
      const transformedTasks: Record<string, Task> = {}
      for (const [id, raw] of Object.entries(rawTasks)) {
        transformedTasks[id] = transformTask(raw)
      }
      set({
        tasks: transformedTasks,
        agents: (payload.agents as Record<string, Agent>) || {},
        currentTaskId: payload.current_task_id as string | null,
        activeAgentId: payload.active_agent_id as string | null,
      })
      break
    }

    case 'error':
      console.error('[WS] Server error:', payload)
      set((state) => ({
        isProcessing: false,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'error',
            content: payload.message as string,
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      notificationService.notifyTaskFailed(payload.message as string || 'Server error')
      break

    case 'pong':
      // Keep-alive response
      break

    // HITL message handlers
    case 'approval_required':
      set((state) => ({
        pendingApprovals: {
          ...state.pendingApprovals,
          [payload.approval_id as string]: {
            approval_id: payload.approval_id as string,
            task_id: payload.task_id as string,
            tool_name: payload.tool_name as string,
            tool_args: payload.tool_args as Record<string, unknown>,
            risk_level: payload.risk_level as string,
            risk_description: payload.risk_description as string,
            created_at: payload.created_at as string,
            status: 'pending' as const,
          },
        },
        waitingForApproval: true,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'warning',
            content: `Approval required: ${payload.risk_description}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      notificationService.notifyApprovalRequired(payload.risk_description as string)
      break

    case 'approval_granted':
      set((state) => ({
        pendingApprovals: {
          ...state.pendingApprovals,
          [payload.approval_id as string]: {
            ...state.pendingApprovals[payload.approval_id as string],
            status: 'approved' as const,
          },
        },
        waitingForApproval: false,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'system',
            content: 'Operation approved, resuming execution',
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      break

    case 'approval_denied':
      set((state) => ({
        pendingApprovals: {
          ...state.pendingApprovals,
          [payload.approval_id as string]: {
            ...state.pendingApprovals[payload.approval_id as string],
            status: 'denied' as const,
          },
        },
        waitingForApproval: false,
        isProcessing: false,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            type: 'error',
            content: `Operation denied: ${payload.note || 'No reason provided'}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      break

    // Token/Cost tracking handler
    case 'token_update':
      set((state) => {
        const agentName = payload.agent_name as string
        const currentUsage = state.tokenUsage[agentName] || {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          total_cost_usd: 0,
          call_count: 0,
        }

        return {
          tokenUsage: {
            ...state.tokenUsage,
            [agentName]: {
              total_input_tokens: currentUsage.total_input_tokens + (payload.input_tokens as number),
              total_output_tokens: currentUsage.total_output_tokens + (payload.output_tokens as number),
              total_tokens: currentUsage.total_tokens + (payload.total_tokens as number),
              total_cost_usd: currentUsage.total_cost_usd + (payload.cost_usd as number),
              call_count: currentUsage.call_count + 1,
            },
          },
          totalCost: payload.session_total_cost_usd as number,
        }
      })
      break
  }
}
