/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMonitoringStore } from '../monitoring'

const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock EventSource - tracks created instances for test assertions
const eventSourceInstances: MockEventSource[] = []

class MockEventSource {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  constructor(url: string) {
    this.url = url
    eventSourceInstances.push(this)
  }
  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
  /** Helper to simulate receiving an event */
  emit(event: string, data: unknown) {
    const msg = { data: JSON.stringify(data) } as MessageEvent
    ;(this.listeners[event] || []).forEach((h) => h(msg))
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
  eventSourceInstances.length = 0
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

  // ── runCheck ───────────────────────────────────────────

  describe('runCheck', () => {
    it('creates EventSource and marks check as running', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')

      expect(eventSourceInstances).toHaveLength(1)
      expect(eventSourceInstances[0].url).toContain('/projects/p1/checks/test')
      expect(useMonitoringStore.getState().runningChecksMap['p1']?.has('test')).toBe(true)
    })

    it('does not start if check already running', () => {
      useMonitoringStore.setState({
        runningChecksMap: { p1: new Set(['test' as any]) },
      })

      useMonitoringStore.getState().runCheck('p1', 'test')

      expect(eventSourceInstances).toHaveLength(0)
    })

    it('handles check_started event and adds log', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('check_started', {
        project_id: 'p1',
        check_type: 'test',
        started_at: '2025-01-01T00:00:00Z',
      })

      const logs = useMonitoringStore.getState().checkLogs['test']
      expect(logs).toHaveLength(1)
      expect(logs[0].text).toContain('Starting test')
    })

    it('ignores check_started event from different project', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('check_started', {
        project_id: 'p2', // different project
        check_type: 'test',
        started_at: '2025-01-01T00:00:00Z',
      })

      expect(useMonitoringStore.getState().checkLogs['test']).toHaveLength(0)
    })

    it('handles check_progress event and appends log', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('check_progress', {
        project_id: 'p1',
        check_type: 'test',
        output: 'Test output line',
        is_stderr: false,
      })

      const logs = useMonitoringStore.getState().checkLogs['test']
      expect(logs[0].text).toBe('Test output line')
      expect(logs[0].isStderr).toBe(false)
    })

    it('handles check_completed event and removes from running', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('check_completed', {
        project_id: 'p1',
        check_type: 'test',
        status: 'success',
        exit_code: 0,
        duration_ms: 1200,
        stdout: 'All tests passed',
        stderr: '',
      })

      expect(useMonitoringStore.getState().runningChecksMap['p1']?.has('test')).toBe(false)
      expect(es.close).toHaveBeenCalled()
    })

    it('updates health on check_completed when health exists', () => {
      useMonitoringStore.setState({
        projectHealthMap: {
          p1: { project_id: 'p1', checks: { test: { status: 'running' } }, last_updated: '' } as any,
        },
      })

      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('check_completed', {
        project_id: 'p1',
        check_type: 'test',
        status: 'success',
        exit_code: 0,
        duration_ms: 500,
        stdout: 'ok',
        stderr: '',
      })

      const health = useMonitoringStore.getState().projectHealthMap['p1']
      expect(health.checks['test'].status).toBe('success')
    })

    it('handles error event and removes from running', () => {
      useMonitoringStore.getState().runCheck('p1', 'test')
      const es = eventSourceInstances[0]

      es.emit('error', {})

      expect(useMonitoringStore.getState().runningChecksMap['p1']?.has('test')).toBe(false)
      expect(useMonitoringStore.getState().error).toContain('test')
      expect(es.close).toHaveBeenCalled()
    })
  })

  // ── runAllChecks ───────────────────────────────────────

  describe('runAllChecks', () => {
    it('creates EventSource for run-all', () => {
      useMonitoringStore.getState().runAllChecks('p1')

      expect(eventSourceInstances).toHaveLength(1)
      expect(eventSourceInstances[0].url).toContain('/projects/p1/checks/run-all')
    })

    it('does not start if any check already running', () => {
      useMonitoringStore.setState({
        runningChecksMap: { p1: new Set(['test' as any]) },
      })

      useMonitoringStore.getState().runAllChecks('p1')

      expect(eventSourceInstances).toHaveLength(0)
    })

    it('handles check_started event for each check type', () => {
      useMonitoringStore.getState().runAllChecks('p1')
      const es = eventSourceInstances[0]

      es.emit('check_started', {
        project_id: 'p1',
        check_type: 'lint',
        started_at: '2025-01-01T00:00:00Z',
      })

      expect(useMonitoringStore.getState().runningChecksMap['p1']?.has('lint')).toBe(true)
      expect(useMonitoringStore.getState().checkLogs['lint']).toHaveLength(1)
    })

    it('closes EventSource on build check_completed', () => {
      useMonitoringStore.getState().runAllChecks('p1')
      const es = eventSourceInstances[0]

      es.emit('check_completed', {
        project_id: 'p1',
        check_type: 'build',
        status: 'success',
        exit_code: 0,
        duration_ms: 5000,
        stdout: '',
        stderr: '',
      })

      expect(es.close).toHaveBeenCalled()
    })

    it('handles error event and clears running checks', () => {
      useMonitoringStore.getState().runAllChecks('p1')
      const es = eventSourceInstances[0]

      es.emit('error', {})

      const runningChecks = useMonitoringStore.getState().runningChecksMap['p1']
      expect(runningChecks?.size).toBe(0)
      expect(useMonitoringStore.getState().error).toBe('Failed to run checks')
      expect(es.close).toHaveBeenCalled()
    })
  })

  // ── runWorkflowCheck ───────────────────────────────────

  describe('runWorkflowCheck', () => {
    const mockWorkflow = {
      id: 'wf-1',
      name: 'CI Pipeline',
      description: 'Run CI',
      status: 'idle' as const,
      lastRunAt: null,
      lastRunDuration: null,
    }

    beforeEach(() => {
      useMonitoringStore.setState({ workflowChecks: [mockWorkflow] })
    })

    it('marks workflow as running and adds start log', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'run-1' }),
      })

      const promise = useMonitoringStore.getState().runWorkflowCheck('wf-1')

      // Wait for the fetch and SSE setup
      await promise

      const state = useMonitoringStore.getState()
      // At least the start log should exist
      expect((state.workflowLogs['wf-1'] || []).length).toBeGreaterThan(0)
    })

    it('does not start if already running', async () => {
      useMonitoringStore.setState({
        runningWorkflowIds: new Set(['wf-1']),
      })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('sets error when trigger fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const state = useMonitoringStore.getState()
      expect(state.error).toContain('Failed to trigger workflow')
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
      const wf = state.workflowChecks.find((w) => w.id === 'wf-1')
      expect(wf?.status).toBe('failure')
    })

    it('handles SSE log event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'run-1' }),
      })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const es = eventSourceInstances[0]
      es.emit('log', { message: 'Running tests...', timestamp: '2025-01-01T00:00:00Z' })

      const logs = useMonitoringStore.getState().workflowLogs['wf-1']
      const logEntry = logs.find((l) => l.text === 'Running tests...')
      expect(logEntry).toBeDefined()
    })

    it('handles SSE done event and marks success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'run-1' }),
      })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const es = eventSourceInstances[0]
      es.emit('done', {
        status: 'completed',
        completed_at: '2025-01-01T00:05:00Z',
        duration_seconds: 300,
      })

      const state = useMonitoringStore.getState()
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
      const wf = state.workflowChecks.find((w) => w.id === 'wf-1')
      expect(wf?.status).toBe('success')
      expect(es.close).toHaveBeenCalled()
    })

    it('handles SSE error event and marks failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'run-1' }),
      })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const es = eventSourceInstances[0]
      es.emit('error', {})

      const state = useMonitoringStore.getState()
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
      expect(state.error).toBe('Workflow stream error')
      const wf = state.workflowChecks.find((w) => w.id === 'wf-1')
      expect(wf?.status).toBe('failure')
    })

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const state = useMonitoringStore.getState()
      expect(state.error).toBe('Connection refused')
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
    })
  })
})
