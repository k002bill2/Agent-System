import { create } from 'zustand'
import {
  CheckType,
  ProjectHealth,
  ProjectContext,
  CheckStartedPayload,
  CheckProgressPayload,
  CheckCompletedPayload,
} from '../types/monitoring'

interface LogLine {
  timestamp: string
  text: string
  isStderr: boolean
}

interface MonitoringState {
  // Project health data
  projectHealth: ProjectHealth | null
  isLoadingHealth: boolean

  // Project context data
  projectContext: ProjectContext | null
  isLoadingContext: boolean

  // Running checks
  runningChecks: Set<CheckType>

  // Logs per check type
  checkLogs: Record<CheckType, LogLine[]>

  // Currently selected log view
  activeLogView: CheckType | 'all'

  // Currently selected context tab
  activeContextTab: 'claude-md' | 'dev-docs' | 'session'

  // Error state
  error: string | null

  // Actions
  fetchProjectHealth: (projectId: string) => Promise<void>
  fetchProjectContext: (projectId: string) => Promise<void>
  runCheck: (projectId: string, checkType: CheckType) => void
  runAllChecks: (projectId: string) => void
  setActiveLogView: (view: CheckType | 'all') => void
  setActiveContextTab: (tab: 'claude-md' | 'dev-docs' | 'session') => void
  clearLogs: (checkType?: CheckType) => void
  clearError: () => void
}

const API_BASE = 'http://localhost:8000/api'

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  projectHealth: null,
  isLoadingHealth: false,
  projectContext: null,
  isLoadingContext: false,
  runningChecks: new Set(),
  checkLogs: {
    test: [],
    lint: [],
    typecheck: [],
    build: [],
  },
  activeLogView: 'all',
  activeContextTab: 'claude-md',
  error: null,

  fetchProjectHealth: async (projectId: string) => {
    set({ isLoadingHealth: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/health`)
      if (!res.ok) {
        throw new Error(`Failed to fetch health: ${res.statusText}`)
      }

      const data = await res.json()
      set({ projectHealth: data, isLoadingHealth: false })
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
    const { runningChecks, checkLogs } = get()

    // Don't start if already running
    if (runningChecks.has(checkType)) {
      return
    }

    // Mark as running and clear logs
    const newRunning = new Set(runningChecks)
    newRunning.add(checkType)
    set({
      runningChecks: newRunning,
      checkLogs: { ...checkLogs, [checkType]: [] },
    })

    // Start SSE connection
    const eventSource = new EventSource(
      `${API_BASE}/projects/${projectId}/checks/${checkType}`,
    )

    eventSource.addEventListener('check_started', (event) => {
      const payload: CheckStartedPayload = JSON.parse(event.data)
      const { projectHealth } = get()

      if (projectHealth) {
        set({
          projectHealth: {
            ...projectHealth,
            checks: {
              ...projectHealth.checks,
              [checkType]: {
                ...projectHealth.checks[checkType],
                status: 'running',
              },
            },
          },
        })
      }

      // Add log entry
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: payload.started_at,
              text: `>>> Starting ${checkType}...`,
              isStderr: false,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_progress', (event) => {
      const payload: CheckProgressPayload = JSON.parse(event.data)

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: payload.output,
              isStderr: payload.is_stderr,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_completed', (event) => {
      const payload: CheckCompletedPayload = JSON.parse(event.data)
      const { runningChecks: currentRunning, projectHealth } = get()

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)

      // Update health
      if (projectHealth) {
        set({
          runningChecks: newRunning,
          projectHealth: {
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
        })
      } else {
        set({ runningChecks: newRunning })
      }

      // Add completion log
      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: `>>> ${checkType} completed with exit code ${payload.exit_code} (${payload.duration_ms}ms)`,
              isStderr: payload.status === 'failure',
            },
          ],
        },
      }))

      eventSource.close()
    })

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event)
      const { runningChecks: currentRunning } = get()

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)
      set({ runningChecks: newRunning, error: `Check ${checkType} failed` })

      eventSource.close()
    })
  },

  runAllChecks: (projectId: string) => {
    const { runningChecks } = get()

    // Don't start if any check is running
    if (runningChecks.size > 0) {
      return
    }

    // Clear all logs
    set({
      checkLogs: {
        test: [],
        lint: [],
        typecheck: [],
        build: [],
      },
    })

    // Start SSE connection for all checks
    const eventSource = new EventSource(
      `${API_BASE}/projects/${projectId}/checks/run-all`,
    )

    eventSource.addEventListener('check_started', (event) => {
      const payload: CheckStartedPayload = JSON.parse(event.data)
      const checkType = payload.check_type
      const { projectHealth, runningChecks: currentRunning } = get()

      // Add to running set
      const newRunning = new Set(currentRunning)
      newRunning.add(checkType)

      if (projectHealth) {
        set({
          runningChecks: newRunning,
          projectHealth: {
            ...projectHealth,
            checks: {
              ...projectHealth.checks,
              [checkType]: {
                ...projectHealth.checks[checkType],
                status: 'running',
              },
            },
          },
        })
      } else {
        set({ runningChecks: newRunning })
      }

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: payload.started_at,
              text: `>>> Starting ${checkType}...`,
              isStderr: false,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_progress', (event) => {
      const payload: CheckProgressPayload = JSON.parse(event.data)
      const checkType = payload.check_type

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: payload.output,
              isStderr: payload.is_stderr,
            },
          ],
        },
      }))
    })

    eventSource.addEventListener('check_completed', (event) => {
      const payload: CheckCompletedPayload = JSON.parse(event.data)
      const checkType = payload.check_type
      const { runningChecks: currentRunning, projectHealth } = get()

      // Remove from running set
      const newRunning = new Set(currentRunning)
      newRunning.delete(checkType)

      if (projectHealth) {
        set({
          runningChecks: newRunning,
          projectHealth: {
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
        })
      } else {
        set({ runningChecks: newRunning })
      }

      set((state) => ({
        checkLogs: {
          ...state.checkLogs,
          [checkType]: [
            ...state.checkLogs[checkType],
            {
              timestamp: new Date().toISOString(),
              text: `>>> ${checkType} completed with exit code ${payload.exit_code} (${payload.duration_ms}ms)`,
              isStderr: payload.status === 'failure',
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
      set({ runningChecks: new Set(), error: 'Failed to run checks' })
      eventSource.close()
    })
  },

  setActiveLogView: (view: CheckType | 'all') => {
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
}))
