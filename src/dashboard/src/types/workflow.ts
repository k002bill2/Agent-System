export type WorkflowStatus = 'active' | 'inactive' | 'draft'
export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type JobStatus = 'queued' | 'running' | 'success' | 'failure' | 'skipped' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped'
export type TriggerType = 'manual' | 'push' | 'pull_request' | 'schedule' | 'webhook' | 'merge'
export type RunnerType = 'local' | 'docker'

export interface WorkflowStepDef {
  name: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
  if?: string
  continue_on_error?: boolean
  timeout_minutes?: number
}

export interface WorkflowJobDef {
  name?: string
  runs_on?: RunnerType
  needs?: string[]
  steps: WorkflowStepDef[]
  matrix?: Record<string, string[]>
  environment?: string
  if?: string
  env?: Record<string, string>
  timeout_minutes?: number
}

export interface WorkflowDefinition {
  name: string
  description?: string
  on?: Record<string, unknown>
  env?: Record<string, string>
  jobs: Record<string, WorkflowJobDef>
}

export interface Workflow {
  id: string
  name: string
  description: string
  status: WorkflowStatus
  project_id: string | null
  definition: WorkflowDefinition
  yaml_content: string | null
  version: number
  created_by: string | null
  created_at: string
  updated_at: string
  last_run_at: string | null
  last_run_status: WorkflowRunStatus | null
}

export interface WorkflowStep {
  id: string
  job_id: string
  name: string
  status: StepStatus
  run?: string
  uses?: string
  output?: string
  error?: string
  duration_ms?: number
  started_at?: string
  completed_at?: string
}

export interface WorkflowJob {
  id: string
  run_id: string
  name: string
  status: JobStatus
  runner: RunnerType
  needs: string[]
  environment?: string
  started_at?: string
  completed_at?: string
  duration_seconds?: number
  steps: WorkflowStep[]
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  workflow_name: string
  trigger_type: TriggerType
  trigger_payload: Record<string, unknown>
  status: WorkflowRunStatus
  started_at: string
  completed_at?: string
  duration_seconds?: number
  total_cost: number
  error_summary?: string
  jobs: WorkflowJob[]
}

export interface WorkflowLog {
  timestamp: string
  level: string
  message: string
}

// Phase 2: Trigger & Schedule types
export interface CronSchedule {
  cron: string
  timezone: string
  is_active: boolean
  next_run?: string
}

export interface WebhookConfig {
  id: string
  workflow_id: string
  url: string
  secret?: string
  is_active: boolean
  allowed_events: string[]
  created_at: string
}

export interface SecretVariable {
  id: string
  name: string
  scope: 'workflow' | 'project' | 'global'
  scope_id?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// Phase 3: Artifact & Template types
export interface RetryConfig {
  max_attempts: number
  backoff: 'linear' | 'exponential'
  delay_seconds?: number
}

export interface Artifact {
  id: string
  run_id: string
  job_id?: string
  step_id?: string
  name: string
  path: string
  size_bytes: number
  content_type: string
  retention_days: number
  expires_at?: string
  created_at: string
}

export type TemplateCategory = 'ci' | 'deploy' | 'test' | 'utility'

export interface Template {
  id: string
  name: string
  description: string
  category: TemplateCategory
  tags: string[]
  yaml_content: string
  icon: string
  popularity: number
  created_at: string
  updated_at: string
}
