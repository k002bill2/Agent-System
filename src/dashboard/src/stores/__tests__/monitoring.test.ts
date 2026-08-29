/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useMonitoringStore } from '../monitoring'
import { apiClient } from '../../services/apiClient'
import { ApiError } from '../../services/errors'

const mockApiClient = vi.mocked(apiClient)

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

vi.mock('../../services/authenticatedSse', () => ({
  createAuthenticatedSseClient: (url: string) => new MockEventSource(url),
}))

function resetStore() {
  useMonitoringStore.setState({
    projectHealthMap: {},
    isLoadingHealth: false,
    checkConfigMap: {},
    projectContext: null,
    isLoadingContext: false,
    runningChecksMap: {},
    checkLogs: {},
    activeLogView: 'all',
    activeContextTab: 'claude-md',
    workflowChecks: [],
    workflowProjectId: null,
    isLoadingWorkflows: false,
    runningWorkflowIds: new Set(),
    workflowLogs: {},
    error: null,
    contextUnavailableReason: null,
    contextUnavailableProjectId: null,
    monitoringCapabilitiesErrorMap: {},
    monitoringCapabilitiesMap: {
      p1: {
        project_id: 'p1',
        mode: 'filesystem',
        health_config: 'available',
        health: 'available',
        checks: 'available',
        reason: null,
      },
    },
  })
  eventSourceInstances.length = 0
}

describe('monitoring store', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
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
      expect(logs).toEqual({})
    })
  })

  describe('monitoring capabilities', () => {
    it('fetches and stores the backend capability before legacy operations', async () => {
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      const capabilities = {
        project_id: 'p1',
        mode: 'database',
        health_config: 'disabled',
        health: 'disabled',
        checks: 'disabled',
        reason: 'Database-backed project monitoring is not available',
      }
      mockApiClient.get.mockResolvedValueOnce(capabilities)

      await useMonitoringStore.getState().fetchMonitoringCapabilities('p1')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/projects/p1/monitoring-capabilities')
      expect(useMonitoringStore.getState().monitoringCapabilitiesMap.p1).toEqual(capabilities)
    })

    it('shares an in-flight capability request for the same project', async () => {
      let resolveCapabilities!: (value: unknown) => void
      const pendingCapabilities = new Promise((resolve) => {
        resolveCapabilities = resolve
      })
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      mockApiClient.get.mockReturnValueOnce(pendingCapabilities as any)

      const firstRequest = useMonitoringStore.getState().fetchMonitoringCapabilities('p1')
      const secondRequest = useMonitoringStore.getState().fetchMonitoringCapabilities('p1')
      expect(mockApiClient.get).toHaveBeenCalledTimes(1)

      resolveCapabilities({
        project_id: 'p1',
        mode: 'database',
        health_config: 'disabled',
        health: 'disabled',
        checks: 'disabled',
        reason: 'Database-backed project monitoring is not available',
      })

      await expect(firstRequest).resolves.toMatchObject({ project_id: 'p1' })
      await expect(secondRequest).resolves.toMatchObject({ project_id: 'p1' })
    })

    it('propagates capability failures for direct consumers', async () => {
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      mockApiClient.get.mockRejectedValueOnce(new Error('capability authentication failed'))

      await useMonitoringStore.getState().fetchMonitoringCapabilities('p1')

      expect(useMonitoringStore.getState().error).toContain('capability authentication failed')
      expect(useMonitoringStore.getState().monitoringCapabilitiesErrorMap.p1).toContain('capability authentication failed')
    })

    it('blocks legacy health and check operations when the backend disables them', async () => {
      const capabilities = {
        project_id: 'p1' as string,
        mode: 'database' as const,
        health_config: 'disabled' as const,
        health: 'disabled' as const,
        checks: 'disabled' as const,
        reason: 'Database-backed project monitoring is not available',
      }
      useMonitoringStore.setState({ monitoringCapabilitiesMap: { p1: capabilities } })

      await useMonitoringStore.getState().fetchCheckConfig('p1')
      await useMonitoringStore.getState().fetchProjectHealth('p1')
      useMonitoringStore.getState().runCheck('p1', 'test')
      useMonitoringStore.getState().runAllChecks('p1')

      expect(mockApiClient.get).not.toHaveBeenCalledWith(expect.stringContaining('/health-config'))
      expect(mockApiClient.get).not.toHaveBeenCalledWith(expect.stringContaining('/health'))
      expect(eventSourceInstances).toHaveLength(0)
      expect(useMonitoringStore.getState().error).toContain('Database-backed')
    })
    it('fetches project context in database mode', async () => {
      const capabilities = {
        project_id: 'p1' as string,
        mode: 'database' as const,
        health_config: 'disabled' as const,
        health: 'disabled' as const,
        checks: 'disabled' as const,
        reason: 'Database-backed project monitoring is not available',
      }
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      mockApiClient.get
        .mockResolvedValueOnce(capabilities)
        .mockResolvedValueOnce({
          project_id: 'p1',
          project_name: 'Database project',
          project_path: '/registered/project',
          claude_md: '# DB context',
          dev_docs: [],
          session_info: null,
        })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/projects/p1/monitoring-capabilities')
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/projects/p1/context')
      expect(useMonitoringStore.getState().projectContext?.claude_md).toBe('# DB context')
      expect(useMonitoringStore.getState().contextUnavailableReason).toBeNull()
      expect(useMonitoringStore.getState().error).toBeNull()
    })
    it('stores a 503 context failure as a project-scoped unavailable state', async () => {
      mockApiClient.get.mockRejectedValueOnce(
        new ApiError({
          message: 'Project has no registered filesystem path for context',
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }),
      )

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().error).toBeNull()
      expect(useMonitoringStore.getState().contextUnavailableProjectId).toBe('p1')
      expect(useMonitoringStore.getState().contextUnavailableReason).toBe(
        'Project has no registered filesystem path for context',
      )
    })
    it('clears stale context when capability loading fails', async () => {
      useMonitoringStore.setState({
        projectContext: {
          project_id: 'p1',
          project_name: 'Previous project',
          project_path: '/previous',
          claude_md: '# stale',
          dev_docs: [],
          session_info: null,
        },
      })
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      mockApiClient.get.mockRejectedValueOnce(new Error('capability request failed'))

      await useMonitoringStore.getState().fetchProjectContext('p2')

      expect(useMonitoringStore.getState().projectContext).toBeNull()
      expect(useMonitoringStore.getState().isLoadingContext).toBe(false)
    })

    it('ignores a late response from a previously selected project', async () => {
      let resolveP1!: (value: unknown) => void
      const p1Context = new Promise((resolve) => {
        resolveP1 = resolve
      })
      mockApiClient.get.mockReturnValueOnce(p1Context as any)

      const p1Capabilities = {
        project_id: 'p1' as string,
        mode: 'filesystem' as const,
        health_config: 'available' as const,
        health: 'available' as const,
        checks: 'available' as const,
        reason: null,
      }
      useMonitoringStore.setState({
        monitoringCapabilitiesMap: {
          p1: p1Capabilities,
          p2: {
            project_id: 'p2',
            mode: 'database',
            health_config: 'disabled',
            health: 'disabled',
            checks: 'disabled',
            reason: 'Database-backed project monitoring is not available',
          },
        },
      })
      const p1Request = useMonitoringStore.getState().fetchProjectContext('p1')
      mockApiClient.get.mockResolvedValueOnce({
        project_id: 'p2',
        project_name: 'Current project',
        project_path: '/current',
        claude_md: '# current',
        dev_docs: [],
        session_info: null,
      })
      const p2Request = useMonitoringStore.getState().fetchProjectContext('p2')
      await p2Request

      resolveP1({
        project_id: 'p1',
        project_name: 'Previous project',
        project_path: '/previous',
        claude_md: '# stale',
        dev_docs: [],
        session_info: null,
      })
      await p1Request

      expect(useMonitoringStore.getState().projectContext?.project_id).toBe('p2')
      expect(useMonitoringStore.getState().projectContext?.claude_md).toBe('# current')
      expect(useMonitoringStore.getState().contextUnavailableReason).toBeNull()
    })

    it('re-fetches capabilities when the cached project identity is inconsistent', async () => {
      useMonitoringStore.setState({
        monitoringCapabilitiesMap: {
          p1: {
            project_id: 'different-project',
            mode: 'filesystem',
            health_config: 'available',
            health: 'available',
            checks: 'available',
            reason: null,
          },
        },
      })
      mockApiClient.get
        .mockResolvedValueOnce({
          project_id: 'p1',
          mode: 'filesystem',
          health_config: 'available',
          health: 'available',
          checks: 'available',
          reason: null,
        })
        .mockResolvedValueOnce({ project_id: 'p1', claude_md: '# Current', dev_docs: [], session_info: null })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/api/projects/p1/monitoring-capabilities')
      expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/api/projects/p1/context')
      expect(useMonitoringStore.getState().projectContext?.project_id).toBe('p1')
    })

    it('ignores a late capability failure from a previously selected project', async () => {
      let rejectP1!: (reason?: unknown) => void
      const p1Capabilities = new Promise((_resolve, reject) => {
        rejectP1 = reject
      })
      mockApiClient.get.mockReturnValueOnce(p1Capabilities as any)

      const p1Request = useMonitoringStore.getState().fetchProjectContext('p1')
      useMonitoringStore.setState({
        monitoringCapabilitiesMap: {
          p2: {
            project_id: 'p2',
            mode: 'database',
            health_config: 'disabled',
            health: 'disabled',
            checks: 'disabled',
            reason: 'Database-backed project monitoring is not available',
          },
        },
      })
      mockApiClient.get.mockResolvedValueOnce({
        project_id: 'p2',
        project_name: 'Current project',
        project_path: '/current',
        claude_md: '# current',
        dev_docs: [],
        session_info: null,
      })
      await useMonitoringStore.getState().fetchProjectContext('p2')

      rejectP1(new Error('previous project capability request failed'))
      await p1Request

      expect(useMonitoringStore.getState().error).toBeNull()
      expect(useMonitoringStore.getState().contextUnavailableReason).toBeNull()
    })

    it('rejects capability responses for a different project', async () => {
      useMonitoringStore.setState({ monitoringCapabilitiesMap: {} })
      mockApiClient.get.mockResolvedValueOnce({
        project_id: 'p2',
        mode: 'database',
        health_config: 'disabled',
        health: 'disabled',
        checks: 'disabled',
        reason: 'Database-backed project monitoring is not available',
      })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().projectContext).toBeNull()
      expect(useMonitoringStore.getState().contextUnavailableReason).toBeNull()
      expect(useMonitoringStore.getState().error).toContain('did not match')
      expect(mockApiClient.get).not.toHaveBeenCalledWith('/api/projects/p1/context')
    })

    it('ignores context responses for a different project', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        project_id: 'p2',
        project_name: 'Wrong project',
        project_path: '/wrong',
        claude_md: '# wrong',
        dev_docs: [],
        session_info: null,
      })

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().projectContext).toBeNull()
      expect(useMonitoringStore.getState().isLoadingContext).toBe(false)
    })
  })

  // ── UI Actions ──────────────────────────────────────────
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
      expect(logs['test']).toEqual([])
      expect(logs['lint']).toHaveLength(1) // preserved
    })

    it('clears all logs when no type specified', () => {
      useMonitoringStore.getState().clearLogs()

      const logs = useMonitoringStore.getState().checkLogs
      expect(logs['test']).toEqual([])
      expect(logs['lint']).toEqual([])
      expect(logs['typecheck']).toEqual([])
      expect(logs['build']).toEqual([])
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

  // ── getCheckTypes ──────────────────────────────────────

  describe('getCheckTypes', () => {
    it('returns empty array for unknown project', () => {
      expect(useMonitoringStore.getState().getCheckTypes('unknown')).toEqual([])
    })

    it('returns check types from config', () => {
      useMonitoringStore.setState({
        checkConfigMap: {
          p1: {
            project_id: 'p1',
            check_types: ['test', 'lint', 'typecheck', 'build'],
            checks: {},
          },
        },
      })

      expect(useMonitoringStore.getState().getCheckTypes('p1')).toEqual([
        'test', 'lint', 'typecheck', 'build',
      ])
    })
  })

  // ── fetchCheckConfig ──────────────────────────────────

  describe('fetchCheckConfig', () => {
    it('fetches config and initializes checkLogs for new check types', async () => {
      const configData = {
        project_id: 'p1',
        check_types: ['test', 'lint', 'custom-check'],
        checks: {
          test: { label: 'Test', command: 'npm test' },
          lint: { label: 'Lint', command: 'npm run lint' },
          'custom-check': { label: 'Custom', command: 'custom cmd' },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(configData)

      await useMonitoringStore.getState().fetchCheckConfig('p1')

      const state = useMonitoringStore.getState()
      expect(state.checkConfigMap['p1']).toEqual(configData)
      expect(state.checkLogs['test']).toEqual([])
      expect(state.checkLogs['lint']).toEqual([])
      expect(state.checkLogs['custom-check']).toEqual([])
    })

    it('preserves existing logs when fetching config', async () => {
      useMonitoringStore.setState({
        checkLogs: {
          test: [{ timestamp: '', text: 'existing', isStderr: false, projectId: 'p1' }],
        },
      })

      const configData = {
        project_id: 'p1',
        check_types: ['test', 'lint'],
        checks: {},
      }
      mockApiClient.get.mockResolvedValueOnce(configData)

      await useMonitoringStore.getState().fetchCheckConfig('p1')

      const state = useMonitoringStore.getState()
      expect(state.checkLogs['test']).toHaveLength(1) // preserved
      expect(state.checkLogs['lint']).toEqual([]) // initialized
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
      mockApiClient.get.mockResolvedValueOnce(healthData)

      await useMonitoringStore.getState().fetchProjectHealth('p1')

      const state = useMonitoringStore.getState()
      expect(state.projectHealthMap['p1']).toEqual(healthData)
      expect(state.isLoadingHealth).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch health'))

      await useMonitoringStore.getState().fetchProjectHealth('p1')

      expect(useMonitoringStore.getState().error).toContain('Failed to fetch health')
    })
  })

  // ── fetchProjectContext ────────────────────────────────

  describe('fetchProjectContext', () => {
    it('fetches and stores context', async () => {
      const contextData = { project_id: 'p1', claude_md: '# Test', dev_docs: null }
      mockApiClient.get.mockResolvedValueOnce(contextData)

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().projectContext).toEqual(contextData)
      expect(useMonitoringStore.getState().isLoadingContext).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch context'))

      await useMonitoringStore.getState().fetchProjectContext('p1')

      expect(useMonitoringStore.getState().error).toContain('Failed to fetch context')
    })
  })

  // ── fetchWorkflowChecks ────────────────────────────────

  describe('fetchWorkflowChecks', () => {
    it('rejects workflows from a different project', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        workflows: [{ id: 'wf-other', project_id: 'p2', name: 'Other', description: '' }],
      })

      await useMonitoringStore.getState().fetchWorkflowChecks('p1')

      expect(useMonitoringStore.getState().workflowChecks).toEqual([])
      expect(useMonitoringStore.getState().error).toContain('different project')
    })

    it('rejects a global (null project) workflow in a project-scoped response', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        workflows: [{ id: 'wf-global', project_id: null, name: 'Global', description: '' }],
      })

      await useMonitoringStore.getState().fetchWorkflowChecks('p1')

      expect(useMonitoringStore.getState().workflowChecks).toEqual([])
      expect(useMonitoringStore.getState().error).toContain('different project')
    })

    it('encodes the project id in the request URL', async () => {
      mockApiClient.get.mockResolvedValueOnce({ workflows: [] })

      await useMonitoringStore.getState().fetchWorkflowChecks('p 1&x=2')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/workflows?project_id=p%201%26x%3D2')
    })

    it('fetches workflows and maps to checks', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        workflows: [
          { id: 'wf-1', project_id: 'p1', name: 'CI', description: 'CI Pipeline', last_run_status: 'completed', last_run_at: '2025-01-01' },
          { id: 'wf-2', project_id: 'p1', name: 'Deploy', description: '', last_run_status: 'failed', last_run_at: null },
          { id: 'wf-3', project_id: 'p1', name: 'Test', description: '', last_run_status: null, last_run_at: null },
        ],
      })

      await useMonitoringStore.getState().fetchWorkflowChecks('p1')

      const checks = useMonitoringStore.getState().workflowChecks
      expect(checks).toHaveLength(3)
      expect(checks[0].status).toBe('success')
      expect(checks[1].status).toBe('failure')
      expect(checks[2].status).toBe('idle')
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch workflows'))

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

      expect(useMonitoringStore.getState().checkLogs['test'] || []).toHaveLength(0)
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

    it('closes EventSource on all_checks_done event', () => {
      useMonitoringStore.getState().runAllChecks('p1')
      const es = eventSourceInstances[0]

      es.emit('all_checks_done', {})

      expect(es.close).toHaveBeenCalled()
    })

    it('does not close EventSource on individual check_completed', () => {
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

      expect(es.close).not.toHaveBeenCalled()
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
      useMonitoringStore.setState({ workflowChecks: [mockWorkflow], workflowProjectId: 'p1' })
    })

    it('marks workflow as running and adds start log', async () => {
      mockApiClient.post.mockResolvedValueOnce({ id: 'run-1' })

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

      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it('sets error when trigger fails', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to trigger workflow'))

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const state = useMonitoringStore.getState()
      expect(state.error).toContain('Failed to trigger workflow')
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
      const wf = state.workflowChecks.find((w) => w.id === 'wf-1')
      expect(wf?.status).toBe('failure')
    })

    it('handles SSE log event', async () => {
      mockApiClient.post.mockResolvedValueOnce({ id: 'run-1' })

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const es = eventSourceInstances[0]
      es.emit('log', { message: 'Running tests...', timestamp: '2025-01-01T00:00:00Z' })

      const logs = useMonitoringStore.getState().workflowLogs['wf-1']
      const logEntry = logs.find((l) => l.text === 'Running tests...')
      expect(logEntry).toBeDefined()
    })

    it('handles SSE done event and marks success', async () => {
      mockApiClient.post.mockResolvedValueOnce({ id: 'run-1' })

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
      mockApiClient.post.mockResolvedValueOnce({ id: 'run-1' })

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
      mockApiClient.post.mockRejectedValueOnce(new Error('Connection refused'))

      await useMonitoringStore.getState().runWorkflowCheck('wf-1')

      const state = useMonitoringStore.getState()
      expect(state.error).toBe('Connection refused')
      expect(state.runningWorkflowIds.has('wf-1')).toBe(false)
    })
  })
})
