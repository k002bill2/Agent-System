import { create } from 'zustand'
import {
  CheckType,
  ProjectHealth,
  ProjectContext,
  CheckStartedPayload,
  CheckProgressPayload,
  CheckCompletedPayload,
  WorkflowCheck,
  WorkflowCheckStatus,
} from '../types/monitoring'

export interface LogLine {
  timestamp: string
  text: string
  isStderr: boolean
  projectId: string
}

interface MonitoringState {
  // Project health data (per project)
  projectHealthMap: Record<string, ProjectHealth>
  isLoadingHealth: boolean

  // Project context data
  projectContext: ProjectContext | null
  isLoadingContext: boolean

  // Running checks (per project)
  runningChecksMap: Record<string, Set<CheckType>>

  // Logs per check type
  checkLogs: Record<CheckType, LogLine[]>

  // Currently selected log view (CheckType, 'all', or workflow ID)
  activeLogView: CheckType | 'all' | string

  // Currently selected context tab
  activeContextTab: 'claude-md' | 'dev-docs' | 'session'

  // Workflow checks
  workflowChecks: WorkflowCheck[]
  isLoadingWorkflows: boolean
  runningWorkflowIds: Set<string>
  workflowLogs: Record<string, LogLine[]>

  // Error state
  error: string | null

  // Actions
  getProjectHealth: (projectId: string) => ProjectHealth | null
  getRunningChecks: (projectId: string) => Set<CheckType>
  fetchProjectHealth: (projectId: string) => Promise<void>
  fetchProjectContext: (projectId: string) => Promise<void>
  runCheck: (projectId: string, checkType: CheckType) => void
  runAllChecks: (projectId: string) => void
  setActiveLogView: (view: CheckType | 'all' | string) => void
  setActiveContextTab: (tab: 'claude-md' | 'dev-docs' | 'session') => void
  clearLogs: (checkType?: CheckType) => void
  clearError: () => void

  // Workflow actions
  fetchWorkflowChecks: (projectId: string) => Promise<void>
  runWorkflowCheck: (workflowId: string) => Promise<void>
  clearWorkflowLogs: (workflowId?: string) => void
}

const API_BASE = 'http://localhost:8000/api'

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  projectHealthMap: {},
  isLoadingHealth: false,
  projectContext: null,
  isLoadingContext: false,
  runningChecksMap: {},
  checkLogs: {
    test: [],
    lint: [],
    typecheck: [],
    build: [],
  },
  activeLogView: 'all',
  activeContextTab: 'claude-md',
  workflowChecks: [],
  isLoadingWorkflows: false,
  runningWorkflowIds: new Set(),
  workflowLogs: {},
  error: null,

  getProjectHealth: (projectId: string) => {
    return get().projectHealthMap[projectId] || null
  },

  getRunningChecks: (projectId: string) => {
    return get().runningChecksMap[projectId] || new Set()
  },

  fetchProjectHealth: async (projectId: string) => {
    set({ isLoadingHealth: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/health`)
      if (!res.ok) {
        throw new Error(`Failed to fetch health: ${res.statusText}`)
      }

      const data = await res.json()
      set((state) => ({
        projectHealthMap: {
          ...state.projectHealthMap,
          [projectId]: data,
        },
        isLoadingHealth: false,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingHealth: false })
    }
  },

  fetchProjectContext: async (projectId: string) => {
    set({ isLoadingContext: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/context`)
      if (!res.ok) {
        throw new Error(`Failed to fetch context: ${res.statusText}`)
      }

      const data = await res.json()
      set({ projectContext: data, isLoadingContext: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContext: false })
    }
  },

  runCheck: (projectId: string, checkType: CheckType) => {
    const { runningChecksMap } = get()
    const runningChecks = runningChecksMap[projectId] || new Set()

    // Don't start if already running
    if (runningChecks.has(checkType)) {
      return
    }

    // Mark as running
    const newRunning = new Set(runningChecks)
    newRunning.add(checkType)
    set((state) => ({
      runningChecksMap: {
        ...state.runningChecksMap,
        [projectId]: newRunning,
      },
    }))

    // Start SSE connection
    const eventSource = new EventSource(
      `${API_BASE}/projects/${projectId}/checks/${checkType}`,
    )

    eventSource.addEventListener('check_started', (event) => {
      const payload: CheckStartedPayload = JSON.parse(event.data)
      const { projectHealthMap } = get()
      const projectHealth = projectHealthMap[projectId]

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 처리
      if (payload.project_id !== projectId) return

      // Health 업데이트
      if (projectHealth) {
        set((state) => ({
          projectHealthMap: {
            ...state.projectHealthMap,
            [projectId]: {
              ...projectHealth,
              checks: {
                ...projectHealth.checks,
                [checkType]: {
                  ...projectHealth.checks[checkType],
                  status: 'running',
                },
              },
            },
          },
        }))
      }

      // 로그 추가
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: payload.started_at,
              text: `>>> Starting ${checkType}...`,
              isStderr: false,
              projectId,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_progress', (event) => {
      const payload: CheckProgressPayload = JSON.parse(event.data)

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 로그 추가
      if (payload.project_id !== projectId) return

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: payload.output,
              isStderr: payload.is_stderr,
              projectId,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_completed', (event) => {
      const payload: CheckCompletedPayload = JSON.parse(event.data)
      const { runningChecksMap: currentRunningMap, projectHealthMap } = get()
      const currentRunning = currentRunningMap[projectId] || new Set()
      const projectHealth = projectHealthMap[projectId]

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)
      set((state) => ({
        runningChecksMap: {
          ...state.runningChecksMap,
          [projectId]: newRunning,
        },
      }))

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 처리
      if (payload.project_id !== projectId) {
        eventSource.close()
        return
      }

      // Health 업데이트
      if (projectHealth) {
        set((state) => ({
          projectHealthMap: {
            ...state.projectHealthMap,
            [projectId]: {
              ...projectHealth,
              checks: {
                ...projectHealth.checks,
                [checkType]: {
                  project_id: payload.project_id,
                  check_type: payload.check_type,
                  status: payload.status,
                  exit_code: payload.exit_code,
                  duration_ms: payload.duration_ms,
                  stdout: payload.stdout,
                  stderr: payload.stderr,
                },
              },
              last_updated: new Date().toISOString(),
            },
          },
        }))
      }

      // 로그 추가
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: `>>> ${checkType} completed with exit code ${payload.exit_code} (${payload.duration_ms}ms)`,
              isStderr: payload.status === 'failure',
              projectId,
            },
          ],
        },
      }))

      eventSource.close()
    })

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event)
      const { runningChecksMap: currentRunningMap } = get()
      const currentRunning = currentRunningMap[projectId] || new Set()

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)
      set((state) => ({
        runningChecksMap: {
          ...state.runningChecksMap,
          [projectId]: newRunning,
        },
        error: `Check ${checkType} failed`,
      }))

      eventSource.close()
    })
  },

  runAllChecks: (projectId: string) => {
    const { runningChecksMap } = get()
    const runningChecks = runningChecksMap[projectId] || new Set()

    // Don't start if any check is running for this project
    if (runningChecks.size > 0) {
      return
    }

    // Start SSE connection for all checks
    const eventSource = new EventSource(
      `${API_BASE}/projects/${projectId}/checks/run-all`,
    )

    eventSource.addEventListener('check_started', (event) => {
      const payload: CheckStartedPayload = JSON.parse(event.data)
      const checkType = payload.check_type
      const { projectHealthMap, runningChecksMap: currentRunningMap } = get()
      const projectHealth = projectHealthMap[projectId]
      const currentRunning = currentRunningMap[projectId] || new Set()

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 처리
      if (payload.project_id !== projectId) return

      // Add to running set
      const newRunning = new Set(currentRunning)
      newRunning.add(checkType)

      // Health 업데이트
      if (projectHealth) {
        set((state) => ({
          runningChecksMap: {
            ...state.runningChecksMap,
            [projectId]: newRunning,
          },
          projectHealthMap: {
            ...state.projectHealthMap,
            [projectId]: {
              ...projectHealth,
              checks: {
                ...projectHealth.checks,
                [checkType]: {
                  ...projectHealth.checks[checkType],
                  status: 'running',
                },
              },
            },
          },
        }))
      } else {
        set((state) => ({
          runningChecksMap: {
            ...state.runningChecksMap,
            [projectId]: newRunning,
          },
        }))
      }

      // 로그 추가
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: payload.started_at,
              text: `>>> Starting ${checkType}...`,
              isStderr: false,
              projectId,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_progress', (event) => {
      const payload: CheckProgressPayload = JSON.parse(event.data)
      const checkType = payload.check_type

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 로그 추가
      if (payload.project_id !== projectId) return

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: payload.output,
              isStderr: payload.is_stderr,
              projectId,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_completed', (event) => {
      const payload: CheckCompletedPayload = JSON.parse(event.data)
      const checkType = payload.check_type
      const { runningChecksMap: currentRunningMap, projectHealthMap } = get()
      const currentRunning = currentRunningMap[projectId] || new Set()
      const projectHealth = projectHealthMap[projectId]

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)
      set((state) => ({
        runningChecksMap: {
          ...state.runningChecksMap,
          [projectId]: newRunning,
        },
      }))

      // 이 SSE 연결의 프로젝트와 이벤트의 프로젝트가 같을 때만 처리
      if (payload.project_id !== projectId) return

      // Health 업데이트
      if (projectHealth) {
        set((state) => ({
          projectHealthMap: {
            ...state.projectHealthMap,
            [projectId]: {
              ...projectHealth,
              checks: {
                ...projectHealth.checks,
                [checkType]: {
                  project_id: payload.project_id,
                  check_type: payload.check_type,
                  status: payload.status,
                  exit_code: payload.exit_code,
                  duration_ms: payload.duration_ms,
                  stdout: payload.stdout,
                  stderr: payload.stderr,
                },
              },
              last_updated: new Date().toISOString(),
            },
          },
        }))
      }

      // 로그 추가
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: `>>> ${checkType} completed with exit code ${payload.exit_code} (${payload.duration_ms}ms)`,
              isStderr: payload.status === 'failure',
              projectId,
            },
          ],
        },
      }))

      // Check if this is the last check (build)
      if (checkType === 'build') {
        eventSource.close()
      }
    })

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event)
      set((state) => ({
        runningChecksMap: {
          ...state.runningChecksMap,
          [projectId]: new Set(),
        },
        error: 'Failed to run checks',
      }))
      eventSource.close()
    })
  },

  setActiveLogView: (view: CheckType | 'all' | string) => {
    set({ activeLogView: view })
  },

  setActiveContextTab: (tab: 'claude-md' | 'dev-docs' | 'session') => {
    set({ activeContextTab: tab })
  },

  clearLogs: (checkType?: CheckType) => {
    if (checkType) {
      set((state) => ({
        checkLogs: { ...state.checkLogs, [checkType]: [] },
      }))
    } else {
      set({
        checkLogs: {
          test: [],
          lint: [],
          typecheck: [],
          build: [],
        },
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },

  // ── Workflow Actions ──────────────────────────────────────

  fetchWorkflowChecks: async (projectId: string) => {
    set({ isLoadingWorkflows: true })

    try {
      const res = await fetch(`${API_BASE}/workflows?project_id=${projectId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch workflows: ${res.statusText}`)
      }

      const data = await res.json()
      const workflows = data.workflows || []

      const checks: WorkflowCheck[] = workflows.map((w: Record<string, unknown>) => {
        let status: WorkflowCheckStatus = 'idle'
        if (w.last_run_status === 'completed') status = 'success'
        else if (w.last_run_status === 'failed') status = 'failure'
        else if (w.last_run_status === 'running' || w.last_run_status === 'queued') status = 'running'

        return {
          id: w.id as string,
          name: w.name as string,
          description: (w.description as string) || '',
          status,
          lastRunAt: (w.last_run_at as string) || null,
          lastRunDuration: null,
        }
      })

      set({ workflowChecks: checks, isLoadingWorkflows: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingWorkflows: false })
    }
  },

  runWorkflowCheck: async (workflowId: string) => {
    const { runningWorkflowIds } = get()
    if (runningWorkflowIds.has(workflowId)) return

    // Mark as running
    const newRunning = new Set(runningWorkflowIds)
    newRunning.add(workflowId)
    set((state) => ({
      runningWorkflowIds: newRunning,
      workflowChecks: state.workflowChecks.map((wc) =>
        wc.id === workflowId ? { ...wc, status: 'running' as WorkflowCheckStatus } : wc
      ),
    }))

    // Add start log
    set((state) => {
      const wc = state.workflowChecks.find((w) => w.id === workflowId)
      return {
        workflowLogs: {
          ...state.workflowLogs,
          [workflowId]: [
            ...(state.workflowLogs[workflowId] || []),
            {
              timestamp: new Date().toISOString(),
              text: `>>> Starting workflow: ${wc?.name || workflowId}...`,
              isStderr: false,
              projectId: '',
            },
          ],
        },
      }
    })

    try {
      // Trigger the run
      const triggerRes = await fetch(`${API_BASE}/workflows/${workflowId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!triggerRes.ok) {
        throw new Error(`Failed to trigger workflow: ${triggerRes.statusText}`)
      }

      const runData = await triggerRes.json()
      const runId = runData.id

      // Stream logs via SSE
      const eventSource = new EventSource(`${API_BASE}/workflows/runs/${runId}/stream`)

      eventSource.addEventListener('log', (event) => {
        const logData = JSON.parse(event.data)
        set((state) => ({
          workflowLogs: {
            ...state.workflowLogs,
            [workflowId]: [
              ...(state.workflowLogs[workflowId] || []),
              {
                timestamp: logData.timestamp || new Date().toISOString(),
                text: logData.message || logData.output || JSON.stringify(logData),
                isStderr: logData.level === 'error' || logData.is_stderr === true,
                projectId: '',
              },
            ],
          },
        }))
      })

      eventSource.addEventListener('status', (event) => {
        const statusData = JSON.parse(event.data)
        const statusValue = statusData.status

        let checkStatus: WorkflowCheckStatus = 'running'
        if (statusValue === 'completed') checkStatus = 'success'
        else if (statusValue === 'failed') checkStatus = 'failure'

        set((state) => ({
          workflowChecks: state.workflowChecks.map((wc) =>
            wc.id === workflowId ? { ...wc, status: checkStatus } : wc
          ),
        }))
      })

      eventSource.addEventListener('done', (event) => {
        const doneData = JSON.parse(event.data)
        const finalStatus: WorkflowCheckStatus =
          doneData.status === 'completed' ? 'success' : doneData.status === 'failed' ? 'failure' : 'idle'

        // Remove from running
        const { runningWorkflowIds: currentRunning } = get()
        const updated = new Set(currentRunning)
        updated.delete(workflowId)

        set((state) => ({
          runningWorkflowIds: updated,
          workflowChecks: state.workflowChecks.map((wc) =>
            wc.id === workflowId
              ? {
                  ...wc,
                  status: finalStatus,
                  lastRunAt: doneData.completed_at || new Date().toISOString(),
                  lastRunDuration: doneData.duration_seconds || null,
                }
              : wc
          ),
          workflowLogs: {
            ...state.workflowLogs,
            [workflowId]: [
              ...(state.workflowLogs[workflowId] || []),
              {
                timestamp: new Date().toISOString(),
                text: `>>> Workflow ${finalStatus === 'success' ? 'completed' : 'failed'}${doneData.duration_seconds ? ` (${doneData.duration_seconds.toFixed(1)}s)` : ''}`,
                isStderr: finalStatus === 'failure',
                projectId: '',
              },
            ],
          },
        }))

        eventSource.close()
      })

      eventSource.addEventListener('error', () => {
        const { runningWorkflowIds: currentRunning } = get()
        const updated = new Set(currentRunning)
        updated.delete(workflowId)

        set((state) => ({
          runningWorkflowIds: updated,
          workflowChecks: state.workflowChecks.map((wc) =>
            wc.id === workflowId ? { ...wc, status: 'failure' as WorkflowCheckStatus } : wc
          ),
          error: `Workflow stream error`,
        }))
        eventSource.close()
      })
    } catch (e) {
      const { runningWorkflowIds: currentRunning } = get()
      const updated = new Set(currentRunning)
      updated.delete(workflowId)

      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set((state) => ({
        runningWorkflowIds: updated,
        workflowChecks: state.workflowChecks.map((wc) =>
          wc.id === workflowId ? { ...wc, status: 'failure' as WorkflowCheckStatus } : wc
        ),
        error: errorMessage,
        workflowLogs: {
          ...state.workflowLogs,
          [workflowId]: [
            ...(state.workflowLogs[workflowId] || []),
            {
              timestamp: new Date().toISOString(),
              text: `>>> Error: ${errorMessage}`,
              isStderr: true,
              projectId: '',
            },
          ],
        },
      }))
    }
  },

  clearWorkflowLogs: (workflowId?: string) => {
    if (workflowId) {
      set((state) => ({
        workflowLogs: { ...state.workflowLogs, [workflowId]: [] },
      }))
    } else {
      set({ workflowLogs: {} })
    }
  },
}))
