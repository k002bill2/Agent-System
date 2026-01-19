import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { notificationService } from '../services/notificationService'

// Types
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

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

interface OrchestrationState {
  // Connection
  sessionId: string | null
  sessionProjectId: string | null  // 현재 세션이 연결된 프로젝트 ID
  connected: boolean
  ws: WebSocket | null
  isInitialLoading: boolean
  isIntentionalDisconnect: boolean

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

  // Actions
  fetchProjects: () => Promise<void>
  selectProject: (projectId: string | null) => void
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  sendMessage: (content: string) => void
  cancelTask: () => void
  approveOperation: (approvalId: string, note?: string) => Promise<void>
  denyOperation: (approvalId: string, note?: string) => Promise<void>
  clearSession: () => void
  openInWarp: (command?: string) => Promise<{ success: boolean; error?: string }>
  checkWarpStatus: () => Promise<void>
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
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
      set({ connected: true, sessionId, sessionProjectId: selectedProjectId, ws, isInitialLoading: false })
      console.log('WebSocket connected')
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
      const { isIntentionalDisconnect } = get()
      set({ connected: false, ws: null })
      console.log('[WS] Disconnected:', { code: event.code, reason: event.reason })
      // 의도적인 종료가 아닐 때만 알림
      if (!isIntentionalDisconnect) {
        notificationService.notifyConnectionLost()
      }
      set({ isIntentionalDisconnect: false })
    }

    ws.onerror = (error) => {
      console.error('[WS] Error:', error)
    }
  },

  // Disconnect
  disconnect: () => {
    const { ws } = get()
    // 의도적 종료 플래그 설정
    set({ isIntentionalDisconnect: true })
    if (ws) {
      ws.close()
    }
    set({ connected: false, ws: null, sessionId: null })
  },

  // Reconnect to existing session
  reconnect: async () => {
    const { sessionId, connected, ws: existingWs } = get()

    // Already connected
    if (connected && existingWs) return

    // No session to reconnect to
    if (!sessionId) {
      set({ isInitialLoading: false })
      return
    }

    // Verify session exists on server
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) {
        console.log('Session no longer exists, creating new session')
        set({ sessionId: null, sessionProjectId: null })
        // Create new session instead of just clearing
        get().connect()
        return
      }
    } catch (e) {
      console.error('Failed to verify session:', e)
      set({ sessionId: null, sessionProjectId: null })
      // Create new session on error
      get().connect()
      return
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${sessionId}`)

    ws.onopen = () => {
      set({ connected: true, ws, isInitialLoading: false })
      console.log('WebSocket reconnected to session:', sessionId)
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
      const { isIntentionalDisconnect } = get()
      set({ connected: false, ws: null })
      console.log('[WS] Disconnected:', { code: event.code, reason: event.reason })
      // 의도적인 종료가 아닐 때만 알림
      if (!isIntentionalDisconnect) {
        notificationService.notifyConnectionLost()
      }
      set({ isIntentionalDisconnect: false })
    }

    ws.onerror = (error) => {
      console.error('[WS] Error:', error)
    }
  },

  // Clear all session data
  clearSession: () => {
    const { ws } = get()
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
    })
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

  // Open project in Warp terminal
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
        }),
      })

      const data = await res.json()
      set({ warpLoading: false })

      if (data.success) {
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Failed to open Warp' }
      }
    } catch (e) {
      console.error('Failed to open Warp:', e)
      set({ warpLoading: false })
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
