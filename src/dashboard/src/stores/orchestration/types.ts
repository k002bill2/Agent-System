// Types and constants for orchestration store

// Task status
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'paused'

// Connection status for auto-reconnect
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

// Reconnect configuration
export const RECONNECT_CONFIG = {
  maxAttempts: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  heartbeatInterval: 25000,
}

// Exponential backoff with jitter
export const calculateBackoff = (attempt: number): number => {
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
  is_active?: boolean
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
  // Pause/Resume fields
  pausedAt: string | null
  pauseReason: string | null
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

// Provider identification
export type LLMProvider = 'google' | 'anthropic' | 'ollama' | 'openai' | 'unknown'

export interface ProviderUsage {
  provider: LLMProvider
  displayName: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  callCount: number
}

// Provider display configuration
export const PROVIDER_CONFIG: Record<LLMProvider, { displayName: string; color: string; icon: string }> = {
  google: { displayName: 'Google Gemini', color: 'blue', icon: '🔵' },
  anthropic: { displayName: 'Anthropic Claude', color: 'orange', icon: '🟠' },
  ollama: { displayName: 'Ollama (Local)', color: 'green', icon: '🟢' },
  openai: { displayName: 'OpenAI GPT', color: 'purple', icon: '🟣' },
  unknown: { displayName: 'Unknown', color: 'gray', icon: '⚪' },
}

// Helper function to identify provider from model name
export function identifyProvider(model: string): LLMProvider {
  const modelLower = model.toLowerCase()

  // Anthropic models
  if (modelLower.includes('claude')) return 'anthropic'

  // Google models
  if (modelLower.includes('gemini')) return 'google'

  // OpenAI models
  if (modelLower.includes('gpt')) return 'openai'

  // Ollama/Local models (common patterns)
  if (
    modelLower.includes('qwen') ||
    modelLower.includes('llama') ||
    modelLower.includes('mistral') ||
    modelLower.includes('codellama') ||
    modelLower.includes(':')  // Ollama uses format like "model:tag"
  ) {
    return 'ollama'
  }

  return 'unknown'
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

export interface OrchestrationState {
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
  providerUsage: Record<LLMProvider, ProviderUsage>
  totalCost: number

  // Warp integration (deprecated: use SettingsPage terminal detection instead)
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
  // Task pause/resume actions
  pauseTask: (taskId: string, reason?: string) => Promise<{ success: boolean; error?: string }>
  resumeTask: (taskId: string) => Promise<{ success: boolean; error?: string }>
}
