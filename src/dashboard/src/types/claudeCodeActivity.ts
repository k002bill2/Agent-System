/**
 * Claude Code Activity/Tasks types for Dashboard integration
 *
 * These types support real-time activity streaming and task tracking
 * from external Claude Code CLI sessions.
 */

export type ActivityEventType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error'

export type ClaudeCodeTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/**
 * Activity event extracted from Claude Code session transcript.
 */
export interface ActivityEvent {
  id: string
  type: ActivityEventType
  timestamp: string
  content?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_result?: string
  session_id: string
}

/**
 * Task extracted from TaskCreate/TaskUpdate tool calls.
 */
export interface ClaudeCodeTask {
  id: string
  title: string
  description?: string
  status: ClaudeCodeTaskStatus
  created_at: string
  updated_at: string
  parent_id?: string
  children: string[]
  active_form?: string
}

/**
 * Response for activity list endpoint.
 */
export interface ActivityResponse {
  session_id: string
  events: ActivityEvent[]
  total_count: number
  offset: number
  limit: number
  has_more: boolean
}

/**
 * Response for tasks endpoint.
 */
export interface TasksResponse {
  session_id: string
  tasks: Record<string, ClaudeCodeTask>
  root_task_ids: string[]
  total_count: number
}

/**
 * Data source for Activity/Tasks pages.
 */
export type DataSource = 'aos' | 'claude-code'
