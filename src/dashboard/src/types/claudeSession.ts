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
  summary?: string  // AI-generated conversation summary

  // External session tracking
  source_user: string  // Username who owns this session
  source_path: string  // Base path where session was found
}

export interface ClaudeSessionDetail extends ClaudeSessionInfo {
  recent_messages: SessionMessage[]
  current_task?: string
}

export interface ClaudeSessionResponse {
  sessions: ClaudeSessionInfo[]
  total_count: number  // Total count before filtering
  filtered_count: number  // Count after filtering (for pagination)
  active_count: number
  has_more: boolean  // Whether more sessions are available
  offset: number  // Current offset
  limit: number  // Page size
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
