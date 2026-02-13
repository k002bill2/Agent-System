/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMonitoringStore } from '../monitoring'

const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock EventSource
class MockEventSource {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  constructor(url: string) { this.url = url }
  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
}
// @ts-expect-error - Mock
global.EventSource = MockEventSource

function resetStore() {
  useMonitoringStore.setState({
    projectHealthMap: {},
    isLoadingHealth: false,
    projectContext: null,
    isLoadingContext: false,
    runningChecksMap: {},
    checkLogs: { test: [], lint: [], typecheck: [], build: [] },
    activeLogView: 'all',
    activeContextTab: 'claude-md',
    workflowChecks: [],
    isLoadingWorkflows: false,
    runningWorkflowIds: new Set(),
    workflowLogs: {},
    error: null,
  })
}

describe('monitoring store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty projectHealthMap', () => {
      expect(useMonitoringStore.getState().projectHealthMap).toEqual({})
    })

    it('has default activeLogView as all', () => {
      expect(useMonitoringStore.getState().activeLogView).toBe('all')
    })

    it('has default activeContextTab as claude-md', () => {
      expect(useMonitoringStore.getState().activeContextTab).toBe('claude-md')
    })

    it('has empty check logs', () => {
      const logs = useMonitoringStore.getState().checkLogs
      expect(logs.test).toEqual([])
      expect(logs.lint).toEqual([])
      expect(logs.typecheck).toEqual([])
      expect(logs.build).toEqual([])
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setActiveLogView updates view', () => {
      useMonitoringStore.getState().setActiveLogView('test')
      expect(useMonitoringStore.getState().activeLogView).toBe('test')
    })

    it('setActiveLogView accepts workflow ID', () => {
      useMonitoringStore.getState().setActiveLogView('wf-123')
      expect(useMonitoringStore.getState().activeLogView).toBe('wf-123')
    })

    it('setActiveContextTab updates tab', () => {
      useMonitoringStore.getState().setActiveContextTab('dev-docs')
      expect(useMonitoringStore.getState().activeContextTab).toBe('dev-docs')
    })

    it('clearError clears error', () => {
      useMonitoringStore.setState({ error: 'some error' })
      useMonitoringStore.getState().clearError()
      expect(useMonitoringStore.getState().error).toBeNull()
    })
  })

  // ── clearLogs ──────────────────────────────────────────

  describe('clearLogs', () => {
    beforeEach(() => {
      useMonitoringStore.setState({
        checkLogs: {
          test: [{ timestamp: '', text: 'test log', isStderr: false, projectId: 'p1' }],
          lint: [{ timestamp: '', text: 'lint log', isStderr: false, projectId: 'p1' }],
          typecheck: [],
          build: [],
        },
      })
    })

    it('clears specific check type logs', () => {
      useMonitoringStore.getState().clearLogs('test')

      const logs = useMonitoringStore.getState().checkLogs
      expect(logs.test).toEqual([])
      expect(logs.lint).toHaveLength(1) // preserved
    })

    it('clears all logs when no type specified', () => {
      useMonitoringStore.getState().clearLogs()

      const logs = useMonitoringStore.getState().checkLogs
      expect(logs.test).toEqual([])
      expect(logs.lint).toEqual([])
      expect(logs.typecheck).toEqual([])
      expect(logs.build).toEqual([])
    })
  })

  // ── getProjectHealth ───────────────────────────────────

  describe('getProjectHealth', () => {
    it('returns null for unknown project', () => {
      expect(useMonitoringStore.getState().getProjectHealth('unknown')).toBeNull()
    })

    it('returns health for known project', () => {
      const health = { project_id: 'p1', checks: {}, last_updated: '' }
      useMonitoringStore.setState({
        projectHealthMap: { p1: health as any },
      })

      expect(useMonitoringStore.getState().getProjectHealth('p1')).toEqual(health)
    })
  })

  // ── getRunningChecks ───────────────────────────────────

  describe('getRunningChecks', () => {
    it('returns empty set for unknown project', () => {
      const result = useMonitoringStore.getState().getRunningChecks('unknown')
      expect(result.size).toBe(0)
    })

    it('returns running checks for project', () => {
      const running = new Set(['test', 'lint'] as any)
      useMonitoringStore.setState({
        runningChecksMap: { p1: running },
      })

      expect(useMonitoringStore.getState().getRunningChecks('p1').size).toBe(2)
    })
  })

  // ── fetchProjectHealth ─────────────────────────────────

  describe('fetchProjectHealth', () => {
    it('fetches and stores health data', async () => {
      const healthData = {
        project_id: 'p1',
        checks: { test: { status: 'success' } },
        last_updated: '2025-01-01T00:00:00Z',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(healthData),
      })

      await useMonitoringStore.getState().fetchProjectHealth('p1')

      const state = useMonitoringStore.getState()
      expect(state.projectHealthMap['p1']).toEqual(healthData)
      expect(state.isLoadingHealth).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      await useMonitoringStore.getState().fetchProjectHealth('p1')

      expect(useMonitoringStore.getState().error).toContain('Failed to fetch health')
    })
  })

  // ── fetchProjectContext ────────────────────────────────

  describe('fetchProjectContext', () => {
    it('fetches and stores context', async () => {
      const contextData = { claude_md: '# Test', dev_docs: null }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(contextData),
      })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().projectContext).toEqual(contextData)
      expect(useMonitoringStore.getState().isLoadingContext).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().error).toContain('Failed to fetch context')
    })
  })

  // ── fetchWorkflowChecks ────────────────────────────────

  describe('fetchWorkflowChecks', () => {
    it('fetches workflows and maps to checks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          workflows: [
            { id: 'wf-1', name: 'CI', description: 'CI Pipeline', last_run_status: 'completed', last_run_at: '2025-01-01' },
            { id: 'wf-2', name: 'Deploy', description: '', last_run_status: 'failed', last_run_at: null },
            { id: 'wf-3', name: 'Test', description: '', last_run_status: null, last_run_at: null },
          ],
        }),
      })

      await useMonitoringStore.getState().fetchWorkflowChecks('p1')

      const checks = useMonitoringStore.getState().workflowChecks
      expect(checks).toHaveLength(3)
      expect(checks[0].status).toBe('success')
      expect(checks[1].status).toBe('failure')
      expect(checks[2].status).toBe('idle')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      await useMonitoringStore.getState().fetchWorkflowChecks('p1')

      expect(useMonitoringStore.getState().error).toContain('Failed to fetch workflows')
    })
  })

  // ── clearWorkflowLogs ──────────────────────────────────

  describe('clearWorkflowLogs', () => {
    beforeEach(() => {
      useMonitoringStore.setState({
        workflowLogs: {
          'wf-1': [{ timestamp: '', text: 'log1', isStderr: false, projectId: '' }],
          'wf-2': [{ timestamp: '', text: 'log2', isStderr: false, projectId: '' }],
        },
      })
    })

    it('clears logs for specific workflow', () => {
      useMonitoringStore.getState().clearWorkflowLogs('wf-1')

      const logs = useMonitoringStore.getState().workflowLogs
      expect(logs['wf-1']).toEqual([])
      expect(logs['wf-2']).toHaveLength(1) // preserved
    })

    it('clears all workflow logs when no ID', () => {
      useMonitoringStore.getState().clearWorkflowLogs()
      expect(useMonitoringStore.getState().workflowLogs).toEqual({})
    })
  })
})
