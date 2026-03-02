// Orchestration store - Zustand store definition with actions

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { authFetch } from '../auth'
import type { OrchestrationState, TaskStatus, LLMProvider, ProviderUsage } from './types'
import { connectWebSocket, reconnectWebSocket, disconnectWebSocket, clearSessionData } from './wsConnection'

// Re-export all types and constants for backward compatibility
export type {
  TaskStatus,
  ConnectionStatus,
  Project,
  Task,
  Agent,
  Message,
  ApprovalRequest,
  TokenUsage,
  LLMProvider,
  ProviderUsage,
  SessionInfo,
  OrchestrationState,
} from './types'

export {
  RECONNECT_CONFIG,
  calculateBackoff,
  PROVIDER_CONFIG,
  identifyProvider,
} from './types'

export { transformTask, handleMessage } from './wsHandler'

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
  providerUsage: {} as Record<LLMProvider, ProviderUsage>,
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
      const res = await authFetch('/api/projects')
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
    await connectWebSocket(set, get)
  },

  // Disconnect
  disconnect: () => {
    disconnectWebSocket(set, get)
  },

  // Reconnect to existing session
  reconnect: async () => {
    await reconnectWebSocket(set, get)
  },

  // Clear all session data
  clearSession: () => {
    clearSessionData(set, get)
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
        // Session refresh failed, may be expired
        return false
      }

      // Update session info
      const infoRes = await fetch(`/api/sessions/${sessionId}/info`)
      if (infoRes.ok) {
        const sessionInfo = await infoRes.json()
        set({ sessionInfo })
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

  // Pause a task
  pauseTask: async (taskId: string, reason?: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { success: false, error: 'No active session' }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          success: false,
          error: error.detail || 'Failed to pause task',
        }
      }

      const data = await res.json()

      // Update local state
      set((state) => ({
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...state.tasks[taskId],
            status: 'paused' as TaskStatus,
            pausedAt: data.paused_at,
            pauseReason: reason || null,
          },
        },
      }))

      return { success: true }
    } catch (e) {
      console.error('Failed to pause task:', e)
      return { success: false, error: 'Failed to connect to server' }
    }
  },

  // Resume a paused task
  resumeTask: async (taskId: string) => {
    const { sessionId } = get()
    if (!sessionId) {
      return { success: false, error: 'No active session' }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${taskId}/resume`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          success: false,
          error: error.detail || 'Failed to resume task',
        }
      }

      // Update local state
      set((state) => ({
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...state.tasks[taskId],
            status: 'pending' as TaskStatus,
            pausedAt: null,
            pauseReason: null,
          },
        },
      }))

      return { success: true }
    } catch (e) {
      console.error('Failed to resume task:', e)
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
        providerUsage: state.providerUsage,
        totalCost: state.totalCost,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
