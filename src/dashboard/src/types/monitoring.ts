/**
 * Monitoring types for project health checks.
 */

export type CheckType = 'test' | 'lint' | 'typecheck' | 'build'

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

// Check type metadata for display
export const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  test: 'Test',
  lint: 'Lint',
  typecheck: 'TypeCheck',
  build: 'Build',
}

export const CHECK_TYPE_COMMANDS: Record<CheckType, string> = {
  test: 'npm test',
  lint: 'npm run lint',
  typecheck: 'npm run type-check',
  build: 'npm run build:preview',
}

export const ALL_CHECK_TYPES: CheckType[] = ['test', 'lint', 'typecheck', 'build']

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
