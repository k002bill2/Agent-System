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

import {
  useOrchestrationStore,
  identifyProvider,
  PROVIDER_CONFIG,
} from '../orchestration'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid' })

// Mock notificationService
vi.mock('../../services/notificationService', () => ({
  notificationService: {
    notify: vi.fn(),
    notifyTaskCompleted: vi.fn(),
    notifyTaskFailed: vi.fn(),
    notifyApprovalRequired: vi.fn(),
    notifyConnectionLost: vi.fn(),
  },
}))

// Mock WebSocket - captures instances for manual callback triggering
let lastCreatedWs: MockWebSocket | null = null

class MockWebSocket {
  url: string
  readyState = 1 // OPEN
  onopen: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()
  static OPEN = 1

  constructor(url: string) {
    this.url = url
    lastCreatedWs = this // eslint-disable-line @typescript-eslint/no-this-alias
    // Simulate async open
    setTimeout(() => {
      if (this.onopen) this.onopen(new Event('open'))
    }, 0)
  }
}
// @ts-expect-error - Mock
global.WebSocket = MockWebSocket

function resetStore() {
  useOrchestrationStore.setState({
    sessionId: null,
    sessionProjectId: null,
    connected: false,
    ws: null,
    isInitialLoading: true,
    isIntentionalDisconnect: false,
    connectionStatus: 'disconnected',
    reconnectAttempt: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    sessionInfo: null,
    projects: [],
    selectedProjectId: null,
    tasks: {},
    rootTaskId: null,
    currentTaskId: null,
    agents: {},
    activeAgentId: null,
    messages: [],
    isProcessing: false,
    pendingApprovals: {},
    waitingForApproval: false,
    tokenUsage: {},
    providerUsage: {} as any,
    totalCost: 0,
    warpInstalled: null,
    warpLoading: false,
    showDeletedTasks: false,
    _hasHydrated: false,
  })
}

describe('orchestration store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
    vi.clearAllTimers()
    lastCreatedWs = null
  })

  // ── identifyProvider ────────────────────────────────────

  describe('identifyProvider', () => {
    it('identifies Anthropic models', () => {
      expect(identifyProvider('claude-3-sonnet')).toBe('anthropic')
      expect(identifyProvider('Claude-3.5-Haiku')).toBe('anthropic')
    })

    it('identifies Google models', () => {
      expect(identifyProvider('gemini-pro')).toBe('google')
      expect(identifyProvider('Gemini-1.5-Flash')).toBe('google')
    })

    it('identifies OpenAI models', () => {
      expect(identifyProvider('gpt-4')).toBe('openai')
      expect(identifyProvider('GPT-4o-mini')).toBe('openai')
    })

    it('identifies Ollama models', () => {
      expect(identifyProvider('qwen2:7b')).toBe('ollama')
      expect(identifyProvider('llama3')).toBe('ollama')
      expect(identifyProvider('mistral')).toBe('ollama')
      expect(identifyProvider('codellama:13b')).toBe('ollama')
      expect(identifyProvider('custom-model:latest')).toBe('ollama')
    })

    it('returns unknown for unrecognized models', () => {
      expect(identifyProvider('some-random-model')).toBe('unknown')
    })
  })

  // ── PROVIDER_CONFIG ─────────────────────────────────────

  describe('PROVIDER_CONFIG', () => {
    it('has all provider entries', () => {
      expect(PROVIDER_CONFIG.google).toBeDefined()
      expect(PROVIDER_CONFIG.anthropic).toBeDefined()
      expect(PROVIDER_CONFIG.ollama).toBeDefined()
      expect(PROVIDER_CONFIG.openai).toBeDefined()
      expect(PROVIDER_CONFIG.unknown).toBeDefined()
    })

    it('each config has displayName, color, icon', () => {
      for (const config of Object.values(PROVIDER_CONFIG)) {
        expect(config.displayName).toBeTruthy()
        expect(config.color).toBeTruthy()
        expect(config.icon).toBeTruthy()
      }
    })
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has no session', () => {
      expect(useOrchestrationStore.getState().sessionId).toBeNull()
    })

    it('is not connected', () => {
      expect(useOrchestrationStore.getState().connected).toBe(false)
    })

    it('has empty tasks', () => {
      expect(useOrchestrationStore.getState().tasks).toEqual({})
    })

    it('has disconnected status', () => {
      expect(useOrchestrationStore.getState().connectionStatus).toBe('disconnected')
    })
  })

  // ── Simple Actions ─────────────────────────────────────

  describe('simple actions', () => {
    it('selectProject', () => {
      useOrchestrationStore.getState().selectProject('p1')
      expect(useOrchestrationStore.getState().selectedProjectId).toBe('p1')
    })

    it('setShowDeletedTasks', () => {
      useOrchestrationStore.getState().setShowDeletedTasks(true)
      expect(useOrchestrationStore.getState().showDeletedTasks).toBe(true)
    })

    it('setHasHydrated', () => {
      useOrchestrationStore.getState().setHasHydrated(true)
      expect(useOrchestrationStore.getState()._hasHydrated).toBe(true)
    })
  })

  // ── fetchProjects ──────────────────────────────────────

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      const projects = [{ id: 'p1', name: 'App' }, { id: 'p2', name: 'Lib' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(projects),
      })

      await useOrchestrationStore.getState().fetchProjects()

      expect(useOrchestrationStore.getState().projects).toEqual(projects)
    })

    it('auto-selects first project if none selected', async () => {
      const projects = [{ id: 'p1' }, { id: 'p2' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(projects),
      })

      await useOrchestrationStore.getState().fetchProjects()

      expect(useOrchestrationStore.getState().selectedProjectId).toBe('p1')
    })

    it('keeps existing selection', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p2' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'p1' }]),
      })

      await useOrchestrationStore.getState().fetchProjects()

      expect(useOrchestrationStore.getState().selectedProjectId).toBe('p2')
    })

    it('handles fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useOrchestrationStore.getState().fetchProjects()

      expect(useOrchestrationStore.getState().projects).toEqual([])
    })

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useOrchestrationStore.getState().fetchProjects()

      expect(useOrchestrationStore.getState().projects).toEqual([])
    })
  })

  // ── sendMessage ────────────────────────────────────────

  describe('sendMessage', () => {
    it('does nothing without ws', () => {
      useOrchestrationStore.getState().sendMessage('hello')

      expect(useOrchestrationStore.getState().isProcessing).toBe(false)
    })

    it('sends message via ws and adds to history', () => {
      const mockWs = { send: vi.fn(), readyState: 1 }
      useOrchestrationStore.setState({ ws: mockWs as any, sessionId: 'sess-1' })

      useOrchestrationStore.getState().sendMessage('hello world')

      expect(mockWs.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(mockWs.send.mock.calls[0][0])
      expect(sent.type).toBe('task_create')
      expect(sent.payload.description).toBe('hello world')
      expect(sent.session_id).toBe('sess-1')
      expect(useOrchestrationStore.getState().isProcessing).toBe(true)
      expect(useOrchestrationStore.getState().messages).toHaveLength(1)
      expect(useOrchestrationStore.getState().messages[0].type).toBe('user')
    })
  })

  // ── cancelTask ─────────────────────────────────────────

  describe('cancelTask', () => {
    it('does nothing without ws', () => {
      useOrchestrationStore.getState().cancelTask()
      // No error
    })

    it('sends cancel message', () => {
      const mockWs = { send: vi.fn() }
      useOrchestrationStore.setState({ ws: mockWs as any, sessionId: 'sess-1' })

      useOrchestrationStore.getState().cancelTask()

      const sent = JSON.parse(mockWs.send.mock.calls[0][0])
      expect(sent.type).toBe('task_cancel')
    })
  })

  // ── approveOperation ───────────────────────────────────

  describe('approveOperation', () => {
    it('does nothing without ws', async () => {
      await useOrchestrationStore.getState().approveOperation('ap-1')
      // No error
    })

    it('sends approval and updates state', async () => {
      const mockWs = { send: vi.fn() }
      useOrchestrationStore.setState({
        ws: mockWs as any,
        sessionId: 'sess-1',
        pendingApprovals: {
          'ap-1': { approval_id: 'ap-1', status: 'pending' } as any,
        },
        waitingForApproval: true,
      })

      await useOrchestrationStore.getState().approveOperation('ap-1', 'ok')

      const sent = JSON.parse(mockWs.send.mock.calls[0][0])
      expect(sent.type).toBe('approval_response')
      expect(sent.payload.approved).toBe(true)
      expect(useOrchestrationStore.getState().pendingApprovals['ap-1'].status).toBe('approved')
      expect(useOrchestrationStore.getState().waitingForApproval).toBe(false)
    })
  })

  // ── denyOperation ──────────────────────────────────────

  describe('denyOperation', () => {
    it('sends denial and updates state', async () => {
      const mockWs = { send: vi.fn() }
      useOrchestrationStore.setState({
        ws: mockWs as any,
        sessionId: 'sess-1',
        pendingApprovals: {
          'ap-1': { approval_id: 'ap-1', status: 'pending' } as any,
        },
        waitingForApproval: true,
        isProcessing: true,
      })

      await useOrchestrationStore.getState().denyOperation('ap-1', 'not safe')

      const sent = JSON.parse(mockWs.send.mock.calls[0][0])
      expect(sent.payload.approved).toBe(false)
      expect(useOrchestrationStore.getState().pendingApprovals['ap-1'].status).toBe('denied')
      expect(useOrchestrationStore.getState().isProcessing).toBe(false)
    })
  })

  // ── clearSession ───────────────────────────────────────

  describe('clearSession', () => {
    it('clears all session data and closes ws', () => {
      const mockWs = { close: vi.fn() }
      const mockTimer = setTimeout(() => {}, 1000)
      const mockHB = setInterval(() => {}, 1000)
      useOrchestrationStore.setState({
        ws: mockWs as any,
        sessionId: 'sess-1',
        connected: true,
        tasks: { t1: {} as any },
        messages: [{ id: '1' } as any],
        reconnectTimer: mockTimer,
        heartbeatTimer: mockHB,
      })

      useOrchestrationStore.getState().clearSession()

      const state = useOrchestrationStore.getState()
      expect(mockWs.close).toHaveBeenCalled()
      expect(state.sessionId).toBeNull()
      expect(state.connected).toBe(false)
      expect(state.ws).toBeNull()
      expect(state.tasks).toEqual({})
      expect(state.messages).toEqual([])
      expect(state.connectionStatus).toBe('disconnected')
    })
  })

  // ── disconnect ─────────────────────────────────────────

  describe('disconnect', () => {
    it('closes ws and clears connection state', () => {
      const mockWs = { close: vi.fn() }
      useOrchestrationStore.setState({
        ws: mockWs as any,
        sessionId: 'sess-1',
        connected: true,
      })

      useOrchestrationStore.getState().disconnect()

      expect(mockWs.close).toHaveBeenCalled()
      expect(useOrchestrationStore.getState().connected).toBe(false)
      expect(useOrchestrationStore.getState().sessionId).toBeNull()
    })

    it('clears timers', () => {
      const mockTimer = setTimeout(() => {}, 1000)
      const mockHB = setInterval(() => {}, 1000)
      useOrchestrationStore.setState({
        reconnectTimer: mockTimer,
        heartbeatTimer: mockHB,
      })

      useOrchestrationStore.getState().disconnect()

      expect(useOrchestrationStore.getState().reconnectTimer).toBeNull()
      expect(useOrchestrationStore.getState().heartbeatTimer).toBeNull()
    })
  })

  // ── refreshSession ─────────────────────────────────────

  describe('refreshSession', () => {
    it('returns false without session', async () => {
      const result = await useOrchestrationStore.getState().refreshSession()
      expect(result).toBe(false)
    })

    it('refreshes session and updates info', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockResolvedValueOnce({})
      mockApiClient.get.mockResolvedValueOnce({ session_id: 'sess-1', ttl_remaining_hours: 24 })

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(true)
      expect(useOrchestrationStore.getState().sessionInfo).toBeTruthy()
    })

    it('returns false on refresh failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed'))

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'))

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(false)
    })
  })

  // ── checkWarpStatus ────────────────────────────────────

  describe('checkWarpStatus', () => {
    it('stores warp status', async () => {
      mockApiClient.get.mockResolvedValueOnce({ installed: true })

      await useOrchestrationStore.getState().checkWarpStatus()

      expect(useOrchestrationStore.getState().warpInstalled).toBe(true)
    })

    it('sets false on error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Error'))

      await useOrchestrationStore.getState().checkWarpStatus()

      expect(useOrchestrationStore.getState().warpInstalled).toBe(false)
    })
  })

  // ── openInWarp ─────────────────────────────────────────

  describe('openInWarp', () => {
    it('returns error without project', async () => {
      const result = await useOrchestrationStore.getState().openInWarp()
      expect(result.success).toBe(false)
      expect(result.error).toContain('No project selected')
    })

    it('opens warp successfully', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useOrchestrationStore.getState().openInWarp('some cmd')

      expect(result.success).toBe(true)
      expect(result.sessionMonitorHint).toBeTruthy()
      expect(useOrchestrationStore.getState().warpLoading).toBe(false)
    })

    it('returns error on failure', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockApiClient.post.mockResolvedValueOnce({ success: false, error: 'not installed' })

      const result = await useOrchestrationStore.getState().openInWarp()

      expect(result.success).toBe(false)
      expect(result.error).toBe('not installed')
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Network'))

      const result = await useOrchestrationStore.getState().openInWarp()

      expect(result.success).toBe(false)
      expect(useOrchestrationStore.getState().warpLoading).toBe(false)
    })
  })

  // ── deleteTask ─────────────────────────────────────────

  describe('deleteTask', () => {
    it('returns error without session', async () => {
      const result = await useOrchestrationStore.getState().deleteTask('t1')
      expect(result.success).toBe(false)
    })

    it('deletes task and marks local state', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', isDeleted: false } as any },
      })
      mockApiClient.delete.mockResolvedValueOnce({ deleted_task_ids: ['t1'] })

      const result = await useOrchestrationStore.getState().deleteTask('t1')

      expect(result.success).toBe(true)
      expect(result.deletedIds).toEqual(['t1'])
      expect(useOrchestrationStore.getState().tasks['t1'].isDeleted).toBe(true)
    })

    it('returns error on API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.delete.mockRejectedValueOnce(new Error('Not found'))

      const result = await useOrchestrationStore.getState().deleteTask('t1')

      expect(result.success).toBe(false)
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.delete.mockRejectedValueOnce(new Error('Failed to connect to server'))

      const result = await useOrchestrationStore.getState().deleteTask('t1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to server')
    })
  })

  // ── cancelSingleTask ───────────────────────────────────

  describe('cancelSingleTask', () => {
    it('returns error without session', async () => {
      const result = await useOrchestrationStore.getState().cancelSingleTask('t1')
      expect(result.success).toBe(false)
    })

    it('cancels task and updates local state', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', status: 'in_progress' } as any },
      })
      mockApiClient.post.mockResolvedValueOnce({})

      const result = await useOrchestrationStore.getState().cancelSingleTask('t1')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('cancelled')
    })
  })

  // ── getTaskDeletionInfo ────────────────────────────────

  describe('getTaskDeletionInfo', () => {
    it('returns exists:false without session', async () => {
      const result = await useOrchestrationStore.getState().getTaskDeletionInfo('t1')
      expect(result.exists).toBe(false)
    })

    it('fetches deletion info', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.get.mockResolvedValueOnce({
        exists: true,
        children_count: 2,
        in_progress_count: 1,
        in_progress_ids: ['t2'],
        can_delete: false,
      })

      const result = await useOrchestrationStore.getState().getTaskDeletionInfo('t1')

      expect(result.exists).toBe(true)
      expect(result.childrenCount).toBe(2)
      expect(result.canDelete).toBe(false)
    })
  })

  // ── retryTask ──────────────────────────────────────────

  describe('retryTask', () => {
    it('returns error without session', async () => {
      const result = await useOrchestrationStore.getState().retryTask('t1')
      expect(result.success).toBe(false)
    })

    it('retries task and updates status to pending', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', status: 'failed', error: 'timeout' } as any },
      })
      mockApiClient.post.mockResolvedValueOnce({ retry_count: 2 })

      const result = await useOrchestrationStore.getState().retryTask('t1')

      expect(result.success).toBe(true)
      expect(result.retryCount).toBe(2)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('pending')
      expect(useOrchestrationStore.getState().tasks['t1'].error).toBeUndefined()
    })
  })

  // ── pauseTask ──────────────────────────────────────────

  describe('pauseTask', () => {
    it('returns error without session', async () => {
      const result = await useOrchestrationStore.getState().pauseTask('t1')
      expect(result.success).toBe(false)
    })

    it('pauses task with reason', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', status: 'in_progress' } as any },
      })
      mockApiClient.post.mockResolvedValueOnce({ paused_at: '2025-01-01T00:00:00Z' })

      const result = await useOrchestrationStore.getState().pauseTask('t1', 'need review')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('paused')
      expect(useOrchestrationStore.getState().tasks['t1'].pauseReason).toBe('need review')
    })

    it('handles API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot pause'))

      const result = await useOrchestrationStore.getState().pauseTask('t1')
      expect(result.success).toBe(false)
    })
  })

  // ── resumeTask ─────────────────────────────────────────

  describe('resumeTask', () => {
    it('returns error without session', async () => {
      const result = await useOrchestrationStore.getState().resumeTask('t1')
      expect(result.success).toBe(false)
    })

    it('resumes task and clears pause data', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: {
          t1: {
            id: 't1',
            status: 'paused',
            pausedAt: '2025-01-01',
            pauseReason: 'review',
          } as any,
        },
      })
      mockApiClient.post.mockResolvedValueOnce({})

      const result = await useOrchestrationStore.getState().resumeTask('t1')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('pending')
      expect(useOrchestrationStore.getState().tasks['t1'].pausedAt).toBeNull()
      expect(useOrchestrationStore.getState().tasks['t1'].pauseReason).toBeNull()
    })

    it('handles API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot resume'))

      const result = await useOrchestrationStore.getState().resumeTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot resume')
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to connect to server'))

      const result = await useOrchestrationStore.getState().resumeTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to server')
    })
  })

  // ── cancelSingleTask (additional) ───────────────────────

  describe('cancelSingleTask (error paths)', () => {
    it('handles API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot cancel'))

      const result = await useOrchestrationStore.getState().cancelSingleTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot cancel')
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to connect to server'))

      const result = await useOrchestrationStore.getState().cancelSingleTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to server')
    })
  })

  // ── retryTask (additional) ──────────────────────────────

  describe('retryTask (error paths)', () => {
    it('handles API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot retry'))

      const result = await useOrchestrationStore.getState().retryTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot retry')
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to connect to server'))

      const result = await useOrchestrationStore.getState().retryTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to server')
    })
  })

  // ── getTaskDeletionInfo (additional) ────────────────────

  describe('getTaskDeletionInfo (error paths)', () => {
    it('returns exists:false on API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      const result = await useOrchestrationStore.getState().getTaskDeletionInfo('t1')
      expect(result.exists).toBe(false)
    })

    it('returns exists:false on network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.get.mockRejectedValueOnce(new Error('Network'))

      const result = await useOrchestrationStore.getState().getTaskDeletionInfo('t1')
      expect(result.exists).toBe(false)
    })
  })

  // ── deleteTask (additional) ─────────────────────────────

  describe('deleteTask (additional error paths)', () => {
    it('returns error message from thrown error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.delete.mockRejectedValueOnce(new Error('Task is in progress'))

      const result = await useOrchestrationStore.getState().deleteTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Task is in progress')
    })

    it('handles empty deleted_task_ids gracefully', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', isDeleted: false } as any },
      })
      mockApiClient.delete.mockResolvedValueOnce({})

      const result = await useOrchestrationStore.getState().deleteTask('t1')
      expect(result.success).toBe(true)
      // Tasks remain unchanged since deleted_task_ids is empty
      expect(useOrchestrationStore.getState().tasks['t1'].isDeleted).toBe(false)
    })
  })

  // ── openInWarp (additional) ─────────────────────────────

  describe('openInWarp (additional)', () => {
    it('opens via frontend when open_via_frontend is true', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      // Save original window.location.href
      const originalHref = window.location.href
      // Mock window.location
      delete (window as any).location
      window.location = { href: originalHref } as any

      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        open_via_frontend: true,
        uri: 'warp://open?path=/test',
      })

      const result = await useOrchestrationStore.getState().openInWarp()

      expect(result.success).toBe(true)
      expect(window.location.href).toBe('warp://open?path=/test')

      // Restore
      window.location = { href: originalHref } as any
    })

    it('returns default error message when data.error is empty', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockApiClient.post.mockResolvedValueOnce({ success: false })

      const result = await useOrchestrationStore.getState().openInWarp()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to open Warp')
    })
  })

  // ── refreshSession (additional) ─────────────────────────

  describe('refreshSession (additional)', () => {
    it('returns true even when info fetch fails', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockResolvedValueOnce({})
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      const result = await useOrchestrationStore.getState().refreshSession()

      // Refresh succeeded even though info fetch failed
      expect(result).toBe(true)
      expect(useOrchestrationStore.getState().sessionInfo).toBeNull()
    })
  })

  // ── pauseTask (additional) ──────────────────────────────

  describe('pauseTask (additional)', () => {
    it('pauses task without reason (null pauseReason)', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        tasks: { t1: { id: 't1', status: 'in_progress' } as any },
      })
      mockApiClient.post.mockResolvedValueOnce({ paused_at: '2025-01-01T00:00:00Z' })

      const result = await useOrchestrationStore.getState().pauseTask('t1')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].pauseReason).toBeNull()
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to connect to server'))

      const result = await useOrchestrationStore.getState().pauseTask('t1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to server')
    })
  })

  // ── connect ─────────────────────────────────────────────

  describe('connect', () => {
    // Helper: start connect and manually trigger WS onopen
    async function connectAndOpen(sessionId = 'sess-new') {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: sessionId }),
      })

      const connectPromise = useOrchestrationStore.getState().connect()
      await connectPromise

      // Manually trigger the WebSocket's onopen
      const ws = lastCreatedWs!
      expect(ws).not.toBeNull()
      ws.onopen!(new Event('open'))

      return ws
    }

    it('creates session and connects to WebSocket', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-new')

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
        method: 'POST',
      }))

      const state = useOrchestrationStore.getState()
      expect(state.connected).toBe(true)
      expect(state.sessionId).toBe('sess-new')
      expect(state.sessionProjectId).toBe('p1')
      expect(state.connectionStatus).toBe('connected')
      expect(state.isInitialLoading).toBe(false)
      expect(state.reconnectAttempt).toBe(0)
      expect(state.heartbeatTimer).not.toBeNull()
      expect(ws.url).toContain('ws://')
      expect(ws.url).toContain('/ws/sess-new')
    })

    it('handles session creation failure (non-ok response)', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Unauthorized' }),
      })

      await useOrchestrationStore.getState().connect()

      expect(useOrchestrationStore.getState().isInitialLoading).toBe(false)
      expect(useOrchestrationStore.getState().connected).toBe(false)
    })

    it('handles session creation network error', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      mockFetch.mockRejectedValueOnce(new Error('Network'))

      await useOrchestrationStore.getState().connect()

      expect(useOrchestrationStore.getState().isInitialLoading).toBe(false)
      expect(useOrchestrationStore.getState().connected).toBe(false)
    })

    it('handles incoming WebSocket messages', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-msg')

      // Simulate receiving a task_started message
      ws.onmessage!({ data: JSON.stringify({ type: 'task_started', payload: {} }) } as any)

      const messages = useOrchestrationStore.getState().messages
      expect(messages.length).toBeGreaterThanOrEqual(1)
      expect(messages.some((m: any) => m.content === 'Task started')).toBe(true)
    })

    it('handles invalid JSON in WebSocket message', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-bad')

      ws.onmessage!({ data: 'not valid json' } as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WS] Failed to parse message:',
        expect.any(Error),
        'not valid json'
      )
      consoleErrorSpy.mockRestore()
    })

    it('handles WebSocket error event', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-err')

      ws.onerror!(new Event('error'))

      expect(consoleErrorSpy).toHaveBeenCalledWith('[WS] Error:', expect.any(Event))
      consoleErrorSpy.mockRestore()
    })

    it('auto-reconnects on unintentional disconnect', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-recon')

      // Simulate unintentional close
      ws.onclose!({ code: 1006 } as any)

      const state = useOrchestrationStore.getState()
      expect(state.connected).toBe(false)
      expect(state.connectionStatus).toBe('reconnecting')
      expect(state.reconnectAttempt).toBe(1)
      expect(state.reconnectTimer).not.toBeNull()
    })

    it('sets failed status after max reconnect attempts', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-maxre')

      // Set reconnect attempt to max (5)
      useOrchestrationStore.setState({ reconnectAttempt: 5 })

      ws.onclose!({ code: 1006 } as any)

      const state = useOrchestrationStore.getState()
      expect(state.connectionStatus).toBe('failed')

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyConnectionLost).toHaveBeenCalled()
    })

    it('does not auto-reconnect on intentional disconnect', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-intent')

      // Set intentional disconnect
      useOrchestrationStore.setState({ isIntentionalDisconnect: true })

      ws.onclose!({ code: 1000 } as any)

      const state = useOrchestrationStore.getState()
      expect(state.connectionStatus).toBe('disconnected')
      expect(state.reconnectAttempt).toBe(0)
      expect(state.isIntentionalDisconnect).toBe(false)
    })

    it('clears heartbeat timer on close', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      const ws = await connectAndOpen('sess-hb')

      expect(useOrchestrationStore.getState().heartbeatTimer).not.toBeNull()

      // Set intentional to avoid reconnect
      useOrchestrationStore.setState({ isIntentionalDisconnect: true })
      ws.onclose!({ code: 1000 } as any)

      expect(useOrchestrationStore.getState().heartbeatTimer).toBeNull()
    })
  })

  // ── reconnect ───────────────────────────────────────────

  describe('reconnect', () => {
    it('does nothing when already connected', async () => {
      const mockWs = { send: vi.fn(), readyState: 1, close: vi.fn() }
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        connected: true,
        ws: mockWs as any,
      })

      await useOrchestrationStore.getState().reconnect()

      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does nothing when already connecting', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-1',
        connectionStatus: 'connecting',
      })

      await useOrchestrationStore.getState().reconnect()

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('clears state when no session to reconnect', async () => {
      useOrchestrationStore.setState({ sessionId: null })

      await useOrchestrationStore.getState().reconnect()

      expect(useOrchestrationStore.getState().isInitialLoading).toBe(false)
      expect(useOrchestrationStore.getState().connectionStatus).toBe('disconnected')
    })

    it('clears state when session sync fails (expired)', async () => {
      useOrchestrationStore.setState({
        sessionId: 'sess-expired',
        tasks: { t1: { id: 't1' } as any },
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      await useOrchestrationStore.getState().reconnect()

      const state = useOrchestrationStore.getState()
      expect(state.sessionId).toBeNull()
      expect(state.sessionProjectId).toBeNull()
      expect(state.sessionInfo).toBeNull()
      expect(state.tasks).toEqual({})
      expect(state.connectionStatus).toBe('disconnected')
      expect(state.isInitialLoading).toBe(false)
    })

    it('clears state on sync network error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ sessionId: 'sess-neterr' })

      mockFetch.mockRejectedValueOnce(new Error('Network'))

      await useOrchestrationStore.getState().reconnect()

      const state = useOrchestrationStore.getState()
      expect(state.sessionId).toBeNull()
      expect(state.connectionStatus).toBe('disconnected')
      expect(state.isInitialLoading).toBe(false)
      consoleErrorSpy.mockRestore()
    })

    it('syncs session state and reconnects WebSocket', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-sync' })

      const syncData = {
        session_info: { session_id: 'sess-sync', ttl_remaining_hours: 20 },
        tasks: {
          t1: {
            id: 't1',
            title: 'Task 1',
            description: 'Desc',
            status: 'completed',
            parent_id: null,
            children: [],
            created_at: '2025-01-01',
            updated_at: '2025-01-01',
          },
        },
        root_task_id: 't1',
        agents: { a1: { id: 'a1', name: 'Agent', role: 'lead', status: 'completed', currentTask: null } },
        pending_approvals: {},
        waiting_for_approval: false,
        token_usage: { Agent: { total_input_tokens: 100, total_output_tokens: 50, total_tokens: 150, total_cost_usd: 0.01, call_count: 1 } },
        total_cost: 0.01,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(syncData),
      })

      const reconnectPromise = useOrchestrationStore.getState().reconnect()
      await reconnectPromise

      // Verify synced state
      const stateBeforeOpen = useOrchestrationStore.getState()
      expect(stateBeforeOpen.sessionInfo).toEqual(syncData.session_info)
      expect(stateBeforeOpen.rootTaskId).toBe('t1')
      expect(stateBeforeOpen.tasks['t1']).toBeDefined()
      expect(stateBeforeOpen.tasks['t1'].title).toBe('Task 1')
      expect(stateBeforeOpen.tasks['t1'].parentId).toBeNull()
      expect(stateBeforeOpen.agents).toEqual(syncData.agents)
      expect(stateBeforeOpen.tokenUsage).toEqual(syncData.token_usage)
      expect(stateBeforeOpen.totalCost).toBe(0.01)

      // Manually trigger WebSocket onopen
      const ws = lastCreatedWs!
      expect(ws).not.toBeNull()
      ws.onopen!(new Event('open'))

      expect(useOrchestrationStore.getState().connected).toBe(true)
      expect(useOrchestrationStore.getState().connectionStatus).toBe('connected')
      expect(useOrchestrationStore.getState().reconnectAttempt).toBe(0)
    })

    it('handles WebSocket close during reconnect (auto-reconnect)', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-reclose' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          session_info: null,
          tasks: {},
          root_task_id: null,
          agents: {},
          pending_approvals: {},
          waiting_for_approval: false,
          token_usage: {},
          total_cost: 0,
        }),
      })

      await useOrchestrationStore.getState().reconnect()

      // Trigger onopen then onclose
      const ws = lastCreatedWs!
      ws.onopen!(new Event('open'))
      ws.onclose!({ code: 1006 } as any)

      expect(useOrchestrationStore.getState().connected).toBe(false)
      expect(useOrchestrationStore.getState().connectionStatus).toBe('reconnecting')
    })

    it('handles WebSocket error during reconnect', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ sessionId: 'sess-reconerr' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          session_info: null,
          tasks: {},
          root_task_id: null,
          agents: {},
          pending_approvals: {},
          waiting_for_approval: false,
          token_usage: {},
          total_cost: 0,
        }),
      })

      await useOrchestrationStore.getState().reconnect()

      const ws = lastCreatedWs!
      ws.onopen!(new Event('open'))
      ws.onerror!(new Event('error'))

      expect(consoleErrorSpy).toHaveBeenCalledWith('[WS] Error:', expect.any(Event))
      consoleErrorSpy.mockRestore()
    })

    it('handles incoming messages during reconnect', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-reconmsg' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          session_info: null,
          tasks: {},
          root_task_id: null,
          agents: {},
          pending_approvals: {},
          waiting_for_approval: false,
          token_usage: {},
          total_cost: 0,
        }),
      })

      await useOrchestrationStore.getState().reconnect()

      const ws = lastCreatedWs!
      ws.onopen!(new Event('open'))

      // Send a message through the reconnected WebSocket
      ws.onmessage!({ data: JSON.stringify({ type: 'task_started', payload: {} }) } as any)

      expect(useOrchestrationStore.getState().messages.some(
        (m: any) => m.content === 'Task started'
      )).toBe(true)
    })

    it('handles invalid JSON in reconnect WebSocket message', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ sessionId: 'sess-reconbad' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          session_info: null,
          tasks: {},
          root_task_id: null,
          agents: {},
          pending_approvals: {},
          waiting_for_approval: false,
          token_usage: {},
          total_cost: 0,
        }),
      })

      await useOrchestrationStore.getState().reconnect()

      const ws = lastCreatedWs!
      ws.onopen!(new Event('open'))
      ws.onmessage!({ data: 'bad json' } as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WS] Failed to parse message:',
        expect.any(Error),
        'bad json'
      )
      consoleErrorSpy.mockRestore()
    })
  })

  // ── handleMessage (via WebSocket messages) ──────────────

  describe('handleMessage (WebSocket message types)', () => {
    // Helper: connect and return WS with onmessage ready
    async function connectAndGetWs() {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: 'sess-hm' }),
      })

      await useOrchestrationStore.getState().connect()

      const ws = lastCreatedWs!
      ws.onopen!(new Event('open'))

      return ws
    }

    function sendMessage(ws: MockWebSocket, messageData: any) {
      ws.onmessage!({ data: JSON.stringify(messageData) } as any)
    }

    it('handles task_started message', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, { type: 'task_started', payload: {} })

      const messages = useOrchestrationStore.getState().messages
      expect(messages.some((m: any) => m.content === 'Task started' && m.type === 'system')).toBe(true)
    })

    it('handles task_progress message (no-op)', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, { type: 'task_progress', payload: {} })

      const messages = useOrchestrationStore.getState().messages
      expect(messages.every((m: any) => m.content !== 'Task progress')).toBe(true)
    })

    it('handles task_completed message', async () => {
      useOrchestrationStore.setState({ isProcessing: true })
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'task_completed',
        payload: { root_task_id: 'root-1', title: 'My Task' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.isProcessing).toBe(false)
      expect(state.rootTaskId).toBe('root-1')
      expect(state.messages.some((m: any) => m.content === 'Task completed')).toBe(true)

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyTaskCompleted).toHaveBeenCalledWith('My Task')
    })

    it('handles task_completed with fallback title', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'task_completed',
        payload: { root_task_id: null },
      })

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyTaskCompleted).toHaveBeenCalledWith('Task completed')
    })

    it('handles task_failed message', async () => {
      useOrchestrationStore.setState({ isProcessing: true })
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'task_failed',
        payload: { reason: 'Timeout error' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.isProcessing).toBe(false)
      expect(state.messages.some((m: any) => m.content.includes('Timeout error'))).toBe(true)

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyTaskFailed).toHaveBeenCalledWith('Timeout error')
    })

    it('handles task_failed with no reason', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, { type: 'task_failed', payload: {} })

      const state = useOrchestrationStore.getState()
      expect(state.messages.some((m: any) => m.content.includes('Unknown error'))).toBe(true)
    })

    it('handles agent_thinking message', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'agent_thinking',
        payload: { agent_id: 'a1', thought: 'Analyzing task...' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.activeAgentId).toBe('a1')
      expect(state.messages.some((m: any) =>
        m.type === 'thinking' && m.content === 'Analyzing task...' && m.agentId === 'a1'
      )).toBe(true)
    })

    it('handles agent_action message', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'agent_action',
        payload: { agent_id: 'a1', agent_name: 'Coder', action: 'Writing code' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.messages.some((m: any) =>
        m.type === 'action' && m.content === 'Coder: Writing code' && m.agentId === 'a1'
      )).toBe(true)
    })

    it('handles state_update message with task transformation', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'state_update',
        payload: {
          tasks: {
            t1: {
              id: 't1',
              title: 'Updated Task',
              description: 'Desc',
              status: 'in_progress',
              parent_id: null,
              children: ['t2'],
              created_at: '2025-01-01',
              updated_at: '2025-01-02',
              is_deleted: false,
              deleted_at: null,
              paused_at: null,
              pause_reason: null,
            },
            t2: {
              id: 't2',
              title: 'Child Task',
              description: 'Child desc',
              status: 'pending',
              parent_id: 't1',
              children: [],
              created_at: '2025-01-01',
              updated_at: '2025-01-01',
            },
          },
          agents: { a1: { id: 'a1', name: 'Lead', role: 'lead', status: 'in_progress', currentTask: 't1' } },
          current_task_id: 't1',
          active_agent_id: 'a1',
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.tasks['t1'].title).toBe('Updated Task')
      expect(state.tasks['t1'].parentId).toBeNull()
      expect(state.tasks['t1'].children).toEqual(['t2'])
      expect(state.tasks['t1'].isDeleted).toBe(false)
      expect(state.tasks['t2'].parentId).toBe('t1')
      expect(state.currentTaskId).toBe('t1')
      expect(state.activeAgentId).toBe('a1')
    })

    it('handles state_update with camelCase task fields', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'state_update',
        payload: {
          tasks: {
            t1: {
              id: 't1',
              title: 'CamelCase',
              description: 'Desc',
              status: 'completed',
              parentId: 'root',
              children: [],
              createdAt: '2025-01-01',
              updatedAt: '2025-01-02',
              isDeleted: true,
              deletedAt: '2025-01-03',
              pausedAt: '2025-01-01',
              pauseReason: 'review',
            },
          },
          current_task_id: null,
          active_agent_id: null,
        },
      })

      const task = useOrchestrationStore.getState().tasks['t1']
      expect(task.parentId).toBe('root')
      expect(task.isDeleted).toBe(true)
      expect(task.deletedAt).toBe('2025-01-03')
      expect(task.pausedAt).toBe('2025-01-01')
      expect(task.pauseReason).toBe('review')
    })

    it('handles state_update with empty tasks', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'state_update',
        payload: {
          current_task_id: null,
          active_agent_id: null,
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.tasks).toEqual({})
      expect(state.agents).toEqual({})
    })

    it('handles error message', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useOrchestrationStore.setState({ isProcessing: true })
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'error',
        payload: { message: 'Internal server error' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.isProcessing).toBe(false)
      expect(state.messages.some((m: any) =>
        m.type === 'error' && m.content === 'Internal server error'
      )).toBe(true)

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyTaskFailed).toHaveBeenCalledWith('Internal server error')
      consoleErrorSpy.mockRestore()
    })

    it('handles error message with fallback', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const ws = await connectAndGetWs()
      sendMessage(ws, { type: 'error', payload: {} })

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyTaskFailed).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('handles pong message (no-op)', async () => {
      const ws = await connectAndGetWs()
      const messagesBefore = useOrchestrationStore.getState().messages.length
      sendMessage(ws, { type: 'pong', payload: {} })

      const messagesAfter = useOrchestrationStore.getState().messages
      expect(messagesAfter.length).toBe(messagesBefore)
    })

    it('handles approval_required message', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'approval_required',
        payload: {
          approval_id: 'ap-1',
          task_id: 't1',
          tool_name: 'delete_file',
          tool_args: { path: '/important.txt' },
          risk_level: 'high',
          risk_description: 'Deleting important file',
          created_at: '2025-01-01T00:00:00Z',
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.pendingApprovals['ap-1']).toBeDefined()
      expect(state.pendingApprovals['ap-1'].tool_name).toBe('delete_file')
      expect(state.pendingApprovals['ap-1'].tool_args).toEqual({ path: '/important.txt' })
      expect(state.pendingApprovals['ap-1'].risk_level).toBe('high')
      expect(state.pendingApprovals['ap-1'].status).toBe('pending')
      expect(state.waitingForApproval).toBe(true)
      expect(state.messages.some((m: any) =>
        m.type === 'warning' && m.content.includes('Deleting important file')
      )).toBe(true)

      const { notificationService } = await import('../../services/notificationService')
      expect(notificationService.notifyApprovalRequired).toHaveBeenCalledWith('Deleting important file')
    })

    it('handles approval_granted message', async () => {
      useOrchestrationStore.setState({
        pendingApprovals: {
          'ap-1': { approval_id: 'ap-1', status: 'pending' } as any,
        },
        waitingForApproval: true,
      })

      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'approval_granted',
        payload: { approval_id: 'ap-1' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.pendingApprovals['ap-1'].status).toBe('approved')
      expect(state.waitingForApproval).toBe(false)
      expect(state.messages.some((m: any) =>
        m.content === 'Operation approved, resuming execution'
      )).toBe(true)
    })

    it('handles approval_denied message', async () => {
      useOrchestrationStore.setState({
        pendingApprovals: {
          'ap-2': { approval_id: 'ap-2', status: 'pending' } as any,
        },
        waitingForApproval: true,
        isProcessing: true,
      })

      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'approval_denied',
        payload: { approval_id: 'ap-2', note: 'Too risky' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.pendingApprovals['ap-2'].status).toBe('denied')
      expect(state.waitingForApproval).toBe(false)
      expect(state.isProcessing).toBe(false)
      expect(state.messages.some((m: any) =>
        m.type === 'error' && m.content.includes('Too risky')
      )).toBe(true)
    })

    it('handles approval_denied with no note', async () => {
      useOrchestrationStore.setState({
        pendingApprovals: {
          'ap-3': { approval_id: 'ap-3', status: 'pending' } as any,
        },
        waitingForApproval: true,
      })

      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'approval_denied',
        payload: { approval_id: 'ap-3' },
      })

      const state = useOrchestrationStore.getState()
      expect(state.messages.some((m: any) =>
        m.content.includes('No reason provided')
      )).toBe(true)
    })

    it('handles token_update message', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'token_update',
        payload: {
          agent_name: 'Coder',
          model: 'gemini-pro',
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          cost_usd: 0.005,
          session_total_cost_usd: 0.005,
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.tokenUsage['Coder']).toBeDefined()
      expect(state.tokenUsage['Coder'].total_input_tokens).toBe(100)
      expect(state.tokenUsage['Coder'].total_output_tokens).toBe(50)
      expect(state.tokenUsage['Coder'].total_tokens).toBe(150)
      expect(state.tokenUsage['Coder'].total_cost_usd).toBe(0.005)
      expect(state.tokenUsage['Coder'].call_count).toBe(1)

      expect(state.providerUsage['google']).toBeDefined()
      expect(state.providerUsage['google'].provider).toBe('google')
      expect(state.providerUsage['google'].displayName).toBe('Google Gemini')
      expect(state.providerUsage['google'].inputTokens).toBe(100)
      expect(state.providerUsage['google'].outputTokens).toBe(50)
      expect(state.providerUsage['google'].callCount).toBe(1)

      expect(state.totalCost).toBe(0.005)
    })

    it('handles token_update with cumulative agent usage', async () => {
      // Pre-set some existing usage
      useOrchestrationStore.setState({
        tokenUsage: {
          Coder: {
            total_input_tokens: 100,
            total_output_tokens: 50,
            total_tokens: 150,
            total_cost_usd: 0.005,
            call_count: 1,
          },
        },
        providerUsage: {
          google: {
            provider: 'google',
            displayName: 'Google Gemini',
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            costUsd: 0.005,
            callCount: 1,
          },
        } as any,
      })

      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'token_update',
        payload: {
          agent_name: 'Coder',
          model: 'gemini-pro',
          input_tokens: 200,
          output_tokens: 100,
          total_tokens: 300,
          cost_usd: 0.01,
          session_total_cost_usd: 0.015,
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.tokenUsage['Coder'].total_input_tokens).toBe(300)
      expect(state.tokenUsage['Coder'].total_output_tokens).toBe(150)
      expect(state.tokenUsage['Coder'].total_tokens).toBe(450)
      expect(state.tokenUsage['Coder'].call_count).toBe(2)
      expect(state.providerUsage['google'].inputTokens).toBe(300)
      expect(state.providerUsage['google'].callCount).toBe(2)
      expect(state.totalCost).toBe(0.015)
    })

    it('handles token_update with empty model string', async () => {
      const ws = await connectAndGetWs()
      sendMessage(ws, {
        type: 'token_update',
        payload: {
          agent_name: 'Agent',
          model: '',
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
          cost_usd: 0.001,
          session_total_cost_usd: 0.001,
        },
      })

      const state = useOrchestrationStore.getState()
      // Empty model string -> 'unknown' provider
      expect(state.providerUsage['unknown']).toBeDefined()
      expect(state.providerUsage['unknown'].callCount).toBe(1)
      expect(state.providerUsage['unknown'].displayName).toBe('Unknown')
    })

    it('handles token_update with different provider models', async () => {
      const ws = await connectAndGetWs()

      // Claude model
      sendMessage(ws, {
        type: 'token_update',
        payload: {
          agent_name: 'Writer',
          model: 'claude-3-sonnet',
          input_tokens: 50,
          output_tokens: 25,
          total_tokens: 75,
          cost_usd: 0.002,
          session_total_cost_usd: 0.002,
        },
      })

      const state = useOrchestrationStore.getState()
      expect(state.providerUsage['anthropic']).toBeDefined()
      expect(state.providerUsage['anthropic'].callCount).toBe(1)
      expect(state.tokenUsage['Writer']).toBeDefined()
    })

    it('handles unknown message type gracefully', async () => {
      const ws = await connectAndGetWs()
      const messagesBefore = useOrchestrationStore.getState().messages.length

      // Should not throw
      sendMessage(ws, { type: 'some_unknown_type', payload: {} })

      // No crash, no new messages
      expect(useOrchestrationStore.getState().messages.length).toBe(messagesBefore)
    })
  })

  // ── sendMessage (additional) ────────────────────────────

  describe('sendMessage (additional)', () => {
    it('does nothing without sessionId even if ws exists', () => {
      const mockWs = { send: vi.fn() }
      useOrchestrationStore.setState({ ws: mockWs as any, sessionId: null })

      useOrchestrationStore.getState().sendMessage('hello')

      expect(mockWs.send).not.toHaveBeenCalled()
    })

    it('truncates title to 50 chars', () => {
      const mockWs = { send: vi.fn() }
      useOrchestrationStore.setState({ ws: mockWs as any, sessionId: 'sess-1' })
      const longMessage = 'A'.repeat(100)

      useOrchestrationStore.getState().sendMessage(longMessage)

      const sent = JSON.parse(mockWs.send.mock.calls[0][0])
      expect(sent.payload.title).toHaveLength(50)
      expect(sent.payload.description).toHaveLength(100)
    })
  })

  // ── clearSession (additional) ───────────────────────────

  describe('clearSession (additional)', () => {
    it('works with no ws, no timers', () => {
      useOrchestrationStore.setState({
        ws: null,
        reconnectTimer: null,
        heartbeatTimer: null,
        sessionId: 'sess-1',
      })

      useOrchestrationStore.getState().clearSession()

      expect(useOrchestrationStore.getState().sessionId).toBeNull()
      expect(useOrchestrationStore.getState().tokenUsage).toEqual({})
      expect(useOrchestrationStore.getState().totalCost).toBe(0)
    })
  })

  // ── disconnect (additional) ─────────────────────────────

  describe('disconnect (additional)', () => {
    it('works with no ws', () => {
      useOrchestrationStore.setState({
        ws: null,
        connected: true,
        sessionId: 'sess-1',
        reconnectTimer: null,
        heartbeatTimer: null,
      })

      useOrchestrationStore.getState().disconnect()

      expect(useOrchestrationStore.getState().connected).toBe(false)
      expect(useOrchestrationStore.getState().connectionStatus).toBe('disconnected')
    })
  })

  // ── checkWarpStatus (additional) ────────────────────────

  describe('checkWarpStatus (additional)', () => {
    it('sets false on non-ok response (apiClient throws)', async () => {
      useOrchestrationStore.setState({ warpInstalled: null })
      mockApiClient.get.mockRejectedValueOnce(new Error('Unauthorized'))

      await useOrchestrationStore.getState().checkWarpStatus()

      // apiClient throws on non-ok, catch block sets warpInstalled to false
      expect(useOrchestrationStore.getState().warpInstalled).toBe(false)
    })
  })
})
