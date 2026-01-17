/**
 * Claude Code external session types
 */

export type SessionStatus = 'active' | 'idle' | 'completed' | 'unknown'

export type MessageType = 'user' | 'assistant' | 'progress' | 'tool_use' | 'tool_result'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

export interface SessionMessage {
  type: MessageType
  timestamp: string
  model?: string
  content?: string
  tool_name?: string
  tool_id?: string
  tool_input?: Record<string, unknown>
  usage?: TokenUsage
}

export interface ClaudeSessionInfo {
  session_id: string
  slug: string
  status: SessionStatus
  model: string
  project_path: string
  project_name: string
  git_branch: string
  cwd: string
  version: string
  created_at: string
  last_activity: string
  message_count: number
  user_message_count: number
  assistant_message_count: number
  tool_call_count: number
  total_input_tokens: number
  total_output_tokens: number
  estimated_cost: number
  file_path: string
  file_size: number
}

export interface ClaudeSessionDetail extends ClaudeSessionInfo {
  recent_messages: SessionMessage[]
  current_task?: string
}

export interface ClaudeSessionResponse {
  sessions: ClaudeSessionInfo[]
  total_count: number
  active_count: number
}

export interface TranscriptEntry {
  sessionId: string
  slug: string
  version: string
  gitBranch: string
  cwd: string
  type: string
  message: {
    model?: string
    content?: unknown
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
  }
  timestamp: string
}

export interface TranscriptResponse {
  session_id: string
  entries: TranscriptEntry[]
  offset: number
  limit: number
  total_count: number
  has_more: boolean
}
