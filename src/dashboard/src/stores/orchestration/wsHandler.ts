// WebSocket message handler and task transformation utilities

import { notificationService } from '../../services/notificationService'
import type {
  OrchestrationState,
  Task,
  TaskStatus,
  Agent,
} from './types'
import { identifyProvider, PROVIDER_CONFIG } from './types'

// Helper: Transform snake_case task from backend to camelCase Task
export function transformTask(raw: Record<string, unknown>): Task {
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
    // Pause/Resume fields
    pausedAt: (raw.paused_at ?? raw.pausedAt ?? null) as string | null,
    pauseReason: (raw.pause_reason ?? raw.pauseReason ?? null) as string | null,
    // Soft delete fields
    isDeleted: (raw.is_deleted ?? raw.isDeleted ?? false) as boolean,
    deletedAt: (raw.deleted_at ?? raw.deletedAt ?? null) as string | null,
  }
}

// Message handler
export function handleMessage(
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
        const model = payload.model as string || ''
        const inputTokens = payload.input_tokens as number
        const outputTokens = payload.output_tokens as number
        const totalTokens = payload.total_tokens as number
        const costUsd = payload.cost_usd as number

        // Update agent-level usage
        const currentUsage = state.tokenUsage[agentName] || {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          total_cost_usd: 0,
          call_count: 0,
        }

        // Update provider-level usage
        const provider = identifyProvider(model)
        const currentProviderUsage = state.providerUsage[provider] || {
          provider,
          displayName: PROVIDER_CONFIG[provider].displayName,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          callCount: 0,
        }

        return {
          tokenUsage: {
            ...state.tokenUsage,
            [agentName]: {
              total_input_tokens: currentUsage.total_input_tokens + inputTokens,
              total_output_tokens: currentUsage.total_output_tokens + outputTokens,
              total_tokens: currentUsage.total_tokens + totalTokens,
              total_cost_usd: currentUsage.total_cost_usd + costUsd,
              call_count: currentUsage.call_count + 1,
            },
          },
          providerUsage: {
            ...state.providerUsage,
            [provider]: {
              ...currentProviderUsage,
              inputTokens: currentProviderUsage.inputTokens + inputTokens,
              outputTokens: currentProviderUsage.outputTokens + outputTokens,
              totalTokens: currentProviderUsage.totalTokens + totalTokens,
              costUsd: currentProviderUsage.costUsd + costUsd,
              callCount: currentProviderUsage.callCount + 1,
            },
          },
          totalCost: payload.session_total_cost_usd as number,
        }
      })
      break
  }
}
