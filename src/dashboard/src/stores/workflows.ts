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

const API_BASE = import.meta.env.VITE_API_URL || '/api'

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
  createWorkflow: (data: { name: string; description?: string; yaml_content?: string }) => Promise<Workflow | null>
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

let currentEventSource: EventSource | null = null

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
      const params = projectId ? `?project_id=${projectId}` : ''
      const res = await fetch(`${API_BASE}/workflows${params}`)
      if (!res.ok) throw new Error('Failed to fetch workflows')
      const data = await res.json()
      set({ workflows: data.workflows, isLoading: false })
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
    }
  },

  fetchRuns: async (workflowId: string) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/runs`)
      if (!res.ok) throw new Error('Failed to fetch runs')
      const data = await res.json()
      set(state => ({
        runs: { ...state.runs, [workflowId]: data.runs },
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchRun: async (runId: string) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/runs/${runId}`)
      if (!res.ok) throw new Error('Failed to fetch run')
      const run = await res.json()
      set({ activeRun: run })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createWorkflow: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to create workflow')
      }
      const workflow = await res.json()
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
      const res = await fetch(`${API_BASE}/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update workflow')
      const updated = await res.json()
      set(state => ({
        workflows: state.workflows.map(w => w.id === id ? updated : w),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteWorkflow: async (id) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete workflow')
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
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_type: triggerType, inputs }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to trigger run')
      }
      const run = await res.json()
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
      const res = await fetch(`${API_BASE}/workflows/runs/${runId}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to cancel run')
      const run = await res.json()
      set({ activeRun: run })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  retryRun: async (runId) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/runs/${runId}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to retry run')
      const run = await res.json()
      set({ activeRun: run })
      get().streamRunLogs(run.id)
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  streamRunLogs: (runId: string) => {
    // Close existing stream
    if (currentEventSource) {
      currentEventSource.close()
      currentEventSource = null
    }

    const eventSource = new EventSource(`${API_BASE}/workflows/runs/${runId}/stream`)
    currentEventSource = eventSource

    eventSource.addEventListener('log', (event) => {
      const log = JSON.parse(event.data)
      set(state => ({
        runLogs: {
          ...state.runLogs,
          [runId]: [...(state.runLogs[runId] || []), log],
        },
      }))
    })

    eventSource.addEventListener('status', (event) => {
      const { status } = JSON.parse(event.data)
      set(state => {
        if (state.activeRun && state.activeRun.id === runId) {
          return { activeRun: { ...state.activeRun, status } }
        }
        return {}
      })
    })

    eventSource.addEventListener('done', (event) => {
      const run = JSON.parse(event.data)
      set({ activeRun: run })
      eventSource.close()
      currentEventSource = null
    })

    eventSource.onerror = () => {
      eventSource.close()
      currentEventSource = null
    }
  },

  stopLogStream: () => {
    if (currentEventSource) {
      currentEventSource.close()
      currentEventSource = null
    }
  },

  // Phase 2: Secrets
  fetchSecrets: async () => {
    try {
      const res = await fetch(`${API_BASE}/secrets`)
      if (res.ok) {
        const data = await res.json()
        set({ secrets: data.secrets || [] })
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createSecret: async (data) => {
    try {
      const res = await fetch(`${API_BASE}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        get().fetchSecrets()
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteSecret: async (id) => {
    try {
      await fetch(`${API_BASE}/secrets/${id}`, { method: 'DELETE' })
      set(state => ({ secrets: state.secrets.filter(s => s.id !== id) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 2: Schedule
  fetchSchedule: async (workflowId) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/schedule`)
      if (res.ok) {
        const data = await res.json()
        set({ schedule: data })
      } else {
        set({ schedule: null })
      }
    } catch {
      set({ schedule: null })
    }
  },

  updateSchedule: async (workflowId, cron, timezone = 'UTC') => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron, timezone }),
      })
      if (res.ok) {
        const data = await res.json()
        set({ schedule: data })
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  removeSchedule: async (workflowId) => {
    try {
      await fetch(`${API_BASE}/workflows/${workflowId}/schedule`, { method: 'DELETE' })
      set({ schedule: null })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 2: Webhooks
  fetchWebhooks: async (workflowId) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/webhooks`)
      if (res.ok) {
        const data = await res.json()
        set({ webhooks: data.webhooks || [] })
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  createWebhook: async (workflowId) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/webhooks`, { method: 'POST' })
      if (res.ok) {
        get().fetchWebhooks(workflowId)
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteWebhook: async (workflowId, webhookId) => {
    try {
      await fetch(`${API_BASE}/workflows/${workflowId}/webhooks/${webhookId}`, { method: 'DELETE' })
      set(state => ({ webhooks: state.webhooks.filter(w => w.id !== webhookId) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 3: Artifacts
  fetchArtifacts: async (runId) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/runs/${runId}/artifacts`)
      if (res.ok) {
        const data = await res.json()
        set(state => ({
          artifacts: { ...state.artifacts, [runId]: data.artifacts || [] },
        }))
      }
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  // Phase 3: Templates
  fetchTemplates: async (category) => {
    try {
      const params = category ? `?category=${category}` : ''
      const res = await fetch(`${API_BASE}/workflows/templates${params}`)
      if (res.ok) {
        const data = await res.json()
        set({ templates: data.templates || [] })
      }
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
