import { create } from 'zustand'
import type {
  Workflow,
  WorkflowRun,
  WorkflowLog,
  TriggerType,
  SecretVariable,
  CronSchedule,
  WebhookConfig,
  Artifact,
  Template,
} from '../types/workflow'

import { apiClient } from '../services/apiClient'
import { getApiUrl } from '../config/api'
import { createAuthenticatedSseClient } from '../services/authenticatedSse'
import type { AuthenticatedSseClient } from '../services/authenticatedSse'

interface WorkflowState {
  // Data
  workflows: Workflow[]
  selectedWorkflowId: string | null
  runs: Record<string, WorkflowRun[]>  // workflow_id -> runs
  activeRun: WorkflowRun | null
  runLogs: Record<string, WorkflowLog[]>  // run_id -> logs

  // UI state
  isLoading: boolean
  isRunning: boolean
  error: string | null
  showCreateModal: boolean
  showYamlEditor: boolean
  showSecretsManager: boolean
  showTemplateGallery: boolean

  // Phase 2+3 data
  secrets: SecretVariable[]
  schedule: CronSchedule | null
  webhooks: WebhookConfig[]
  artifacts: Record<string, Artifact[]>  // run_id -> artifacts
  templates: Template[]

  // Actions
  fetchWorkflows: (projectId?: string) => Promise<void>
  fetchRuns: (workflowId: string) => Promise<void>
  fetchRun: (runId: string) => Promise<void>
  createWorkflow: (data: { name: string; description?: string; yaml_content?: string; project_id?: string | null }) => Promise<Workflow | null>
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  triggerRun: (workflowId: string, triggerType?: TriggerType, inputs?: Record<string, unknown>) => Promise<WorkflowRun | null>
  cancelRun: (runId: string) => Promise<void>
  retryRun: (runId: string) => Promise<void>
  streamRunLogs: (runId: string) => void
  stopLogStream: () => void

  // Phase 2: Secrets, Schedule, Webhooks
  fetchSecrets: () => Promise<void>
  createSecret: (data: { name: string; value: string; scope: string }) => Promise<void>
  deleteSecret: (id: string) => Promise<void>
  fetchSchedule: (workflowId: string) => Promise<void>
  updateSchedule: (workflowId: string, cron: string, timezone?: string) => Promise<void>
  removeSchedule: (workflowId: string) => Promise<void>
  fetchWebhooks: (workflowId: string) => Promise<void>
  createWebhook: (workflowId: string) => Promise<void>
  deleteWebhook: (workflowId: string, webhookId: string) => Promise<void>

  // Phase 3: Artifacts, Templates
  fetchArtifacts: (runId: string) => Promise<void>
  fetchTemplates: (category?: string) => Promise<void>

  // UI actions
  selectWorkflow: (id: string | null) => void
  setActiveRun: (run: WorkflowRun | null) => void
  setShowCreateModal: (show: boolean) => void
  setShowYamlEditor: (show: boolean) => void
  setShowSecretsManager: (show: boolean) => void
  setShowTemplateGallery: (show: boolean) => void
}

let currentSseClient: AuthenticatedSseClient | null = null
/**
 * Monotonic id for the active log stream. Every handler checks it before
 * touching the store so a superseded stream can never revive stale state.
 */
let streamGeneration = 0

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  selectedWorkflowId: null,
  runs: {},
  activeRun: null,
  runLogs: {},
  isLoading: false,
  isRunning: false,
  error: null,
  showCreateModal: false,
  showYamlEditor: false,
  showSecretsManager: false,
  showTemplateGallery: false,
  secrets: [],
  schedule: null,
  webhooks: [],
  artifacts: {},
  templates: [],

  fetchWorkflows: async (projectId?: string) => {
    set({ isLoading: true, error: null })
    try {
      const params = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
      const data = await apiClient.get<{ workflows: Workflow[] }>(`/api/workflows${params}`)
      set({ workflows: data.workflows, isLoading: false })
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
    }
  },

  fetchRuns: async (workflowId: string) => {
    try {
      const data = await apiClient.get<{ runs: WorkflowRun[] }>(`/api/workflows/${workflowId}/runs`)
      set(state => ({
        runs: { ...state.runs, [workflowId]: data.runs },
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchRun: async (runId: string) => {
    try {
      const run = await apiClient.get<WorkflowRun>(`/api/workflows/runs/${runId}`)
      set({ activeRun: run })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createWorkflow: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const workflow = await apiClient.post<Workflow>('/api/workflows', data)
      set(state => ({
        workflows: [workflow, ...state.workflows],
        isLoading: false,
        showCreateModal: false,
      }))
      return workflow
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
      return null
    }
  },

  updateWorkflow: async (id, data) => {
    try {
      const updated = await apiClient.put<Workflow>(`/api/workflows/${id}`, data)
      set(state => ({
        workflows: state.workflows.map(w => w.id === id ? updated : w),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteWorkflow: async (id) => {
    try {
      await apiClient.delete(`/api/workflows/${id}`)
      set(state => ({
        workflows: state.workflows.filter(w => w.id !== id),
        selectedWorkflowId: state.selectedWorkflowId === id ? null : state.selectedWorkflowId,
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  triggerRun: async (workflowId, triggerType = 'manual', inputs = {}) => {
    set({ isRunning: true, error: null })
    try {
      const run = await apiClient.post<WorkflowRun>(`/api/workflows/${workflowId}/runs`, { trigger_type: triggerType, inputs })
      set(state => {
        const existing = state.runs[workflowId] || []
        return {
          runs: { ...state.runs, [workflowId]: [run, ...existing] },
          activeRun: run,
          isRunning: false,
        }
      })
      // Auto-start log streaming
      get().streamRunLogs(run.id)
      return run
    } catch (e) {
      set({ error: (e as Error).message, isRunning: false })
      return null
    }
  },

  cancelRun: async (runId) => {
    try {
      const run = await apiClient.post<WorkflowRun>(`/api/workflows/runs/${runId}/cancel`)
      set({ activeRun: run })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  retryRun: async (runId) => {
    try {
      const run = await apiClient.post<WorkflowRun>(`/api/workflows/runs/${runId}/retry`)
      set({ activeRun: run })
      get().streamRunLogs(run.id)
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  streamRunLogs: (runId: string) => {
    // Close any existing stream and invalidate its in-flight handlers.
    if (currentSseClient) {
      currentSseClient.close()
      currentSseClient = null
    }

    const generation = ++streamGeneration
    const isCurrent = () => streamGeneration === generation

    // Drop logs from a previous attempt at this run so a re-stream cannot
    // append onto stale output.
    set(state => ({ runLogs: { ...state.runLogs, [runId]: [] }, error: null }))

    const detach = () => {
      if (!isCurrent()) return
      currentSseClient = null
    }

    /** Terminal, non-success end of the stream. */
    const failStream = (message: string) => {
      if (!isCurrent()) return
      detach()
      set({ error: message, isRunning: false })
    }

    const parse = (event: MessageEvent<string>): Record<string, unknown> | null => {
      try {
        return JSON.parse(event.data)
      } catch {
        return null
      }
    }

    const client = createAuthenticatedSseClient(
      getApiUrl(`/api/workflows/runs/${encodeURIComponent(runId)}/stream`),
      {
        onStatus: (status) => {
          if (status === 'authentication-failed') failStream('Workflow log stream authentication failed')
          else if (status === 'permission-denied') failStream('Workflow log stream permission denied')
          else if (status === 'error') failStream('Workflow log stream error')
          // A clean EOF after `done` is suppressed by close() below, so a
          // surviving 'closed' means the stream ended before completing.
          else if (status === 'closed') failStream('Workflow log stream ended before completion')
        },
      },
    )
    currentSseClient = client

    client.addEventListener('log', (event) => {
      if (!isCurrent()) {
        client.close()
        return
      }
      const log = parse(event)
      if (!log) return
      set(state => ({
        runLogs: {
          ...state.runLogs,
          [runId]: [...(state.runLogs[runId] || []), log as unknown as WorkflowLog],
        },
      }))
    })

    client.addEventListener('status', (event) => {
      if (!isCurrent()) {
        client.close()
        return
      }
      const data = parse(event)
      if (!data) return
      const status = data.status
      set(state => {
        if (state.activeRun && state.activeRun.id === runId) {
          return { activeRun: { ...state.activeRun, status: status as WorkflowRun['status'] } }
        }
        return {}
      })
    })

    client.addEventListener('done', (event) => {
      if (!isCurrent()) {
        client.close()
        return
      }
      const run = parse(event)
      // close() before the transport reaches EOF, so the terminal 'closed'
      // status is suppressed and a completed run reports no error.
      client.close()
      detach()
      if (run) set({ activeRun: run as unknown as WorkflowRun, isRunning: false })
    })
  },

  stopLogStream: () => {
    streamGeneration += 1
    if (currentSseClient) {
      currentSseClient.close()
      currentSseClient = null
    }
  },

  // Phase 2: Secrets
  fetchSecrets: async () => {
    try {
      const data = await apiClient.get<{ secrets: SecretVariable[] }>('/api/secrets')
      set({ secrets: data.secrets || [] })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createSecret: async (data) => {
    try {
      await apiClient.post('/api/secrets', data)
      get().fetchSecrets()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteSecret: async (id) => {
    try {
      await apiClient.delete(`/api/secrets/${id}`)
      set(state => ({ secrets: state.secrets.filter(s => s.id !== id) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 2: Schedule
  fetchSchedule: async (workflowId) => {
    try {
      const data = await apiClient.get<CronSchedule>(`/api/workflows/${workflowId}/schedule`)
      set({ schedule: data })
    } catch {
      set({ schedule: null })
    }
  },

  updateSchedule: async (workflowId, cron, timezone = 'UTC') => {
    try {
      const data = await apiClient.put<CronSchedule>(`/api/workflows/${workflowId}/schedule`, { cron, timezone })
      set({ schedule: data })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  removeSchedule: async (workflowId) => {
    try {
      await apiClient.delete(`/api/workflows/${workflowId}/schedule`)
      set({ schedule: null })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 2: Webhooks
  fetchWebhooks: async (workflowId) => {
    try {
      const data = await apiClient.get<{ webhooks: WebhookConfig[] }>(`/api/workflows/${workflowId}/webhooks`)
      set({ webhooks: data.webhooks || [] })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createWebhook: async (workflowId) => {
    try {
      await apiClient.post(`/api/workflows/${workflowId}/webhooks`)
      get().fetchWebhooks(workflowId)
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteWebhook: async (workflowId, webhookId) => {
    try {
      await apiClient.delete(`/api/workflows/${workflowId}/webhooks/${webhookId}`)
      set(state => ({ webhooks: state.webhooks.filter(w => w.id !== webhookId) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 3: Artifacts
  fetchArtifacts: async (runId) => {
    try {
      const data = await apiClient.get<{ artifacts: Artifact[] }>(`/api/workflows/runs/${runId}/artifacts`)
      set(state => ({
        artifacts: { ...state.artifacts, [runId]: data.artifacts || [] },
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 3: Templates
  fetchTemplates: async (category) => {
    try {
      const params = category ? `?category=${category}` : ''
      const data = await apiClient.get<{ templates: Template[] }>(`/api/workflows/templates${params}`)
      set({ templates: data.templates || [] })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  selectWorkflow: (id) => set({ selectedWorkflowId: id, activeRun: null }),
  setActiveRun: (run) => set({ activeRun: run }),
  setShowCreateModal: (show) => set({ showCreateModal: show }),
  setShowYamlEditor: (show) => set({ showYamlEditor: show }),
  setShowSecretsManager: (show) => set({ showSecretsManager: show }),
  setShowTemplateGallery: (show) => set({ showTemplateGallery: show }),
}))
