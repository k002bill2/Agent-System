/**
 * Monitoring types for project health checks.
 */

// CheckType is now dynamic — any string check ID from project config
export type CheckType = string

export type CheckStatus = 'idle' | 'running' | 'success' | 'failure'

export interface CheckResult {
  project_id: string
  check_type: CheckType
  status: CheckStatus
  exit_code: number | null
  duration_ms: number | null
  stdout: string
  stderr: string
}

export interface ProjectHealth {
  project_id: string
  project_name: string
  project_path: string
  checks: Record<CheckType, CheckResult>
  last_updated: string
}

// SSE Event payloads
export interface CheckStartedPayload {
  project_id: string
  check_type: CheckType
  started_at: string
}

export interface CheckProgressPayload {
  project_id: string
  check_type: CheckType
  output: string
  is_stderr: boolean
}

export interface CheckCompletedPayload {
  project_id: string
  check_type: CheckType
  status: CheckStatus
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

// Per-project health check config from API
export interface CheckConfigEntry {
  label: string
  command: string
}

export interface CheckConfig {
  project_id: string
  check_types: string[]  // ordered list of check type IDs from backend
  checks: Record<string, CheckConfigEntry>
}

// Workflow check types for monitor integration
export type WorkflowCheckStatus = 'idle' | 'running' | 'success' | 'failure'

export interface WorkflowCheck {
  id: string
  name: string
  description: string
  status: WorkflowCheckStatus
  lastRunAt: string | null
  lastRunDuration: number | null // seconds
}

// Vault Health JSON result (parsed from check stdout)
export interface VaultHealthCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  count: number
  details: string[]
}

export interface VaultHealthMetrics {
  total_notes: number
  total_links: number
  broken_links: number
  orphan_notes: number
  missing_frontmatter: number
  broken_images: number
}

export interface VaultHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  metrics: VaultHealthMetrics
  checks: VaultHealthCheck[]
}

// Project Context types
export interface DevDocFile {
  name: string
  path: string
  content: string
  modified_at: string
}

export interface SessionInfo {
  session_id: string
  tasks_count: number
  agents_count: number
  iteration_count: number
  current_task_id: string | null
}

export interface ProjectContext {
  project_id: string
  project_name: string
  project_path: string
  claude_md: string | null
  dev_docs: DevDocFile[]
  session_info: SessionInfo | null
}
