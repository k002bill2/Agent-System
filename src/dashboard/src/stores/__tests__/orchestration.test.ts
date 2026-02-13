/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useOrchestrationStore,
  identifyProvider,
  PROVIDER_CONFIG,
} from '../orchestration'

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

// Mock WebSocket
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
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ session_id: 'sess-1', ttl_remaining_hours: 24 }),
        })

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(true)
      expect(useOrchestrationStore.getState().sessionInfo).toBeTruthy()
    })

    it('returns false on refresh failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useOrchestrationStore.getState().refreshSession()

      expect(result).toBe(false)
    })
  })

  // ── checkWarpStatus ────────────────────────────────────

  describe('checkWarpStatus', () => {
    it('stores warp status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ installed: true }),
      })

      await useOrchestrationStore.getState().checkWarpStatus()

      expect(useOrchestrationStore.getState().warpInstalled).toBe(true)
    })

    it('sets false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'))

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const result = await useOrchestrationStore.getState().openInWarp('some cmd')

      expect(result.success).toBe(true)
      expect(result.sessionMonitorHint).toBeTruthy()
      expect(useOrchestrationStore.getState().warpLoading).toBe(false)
    })

    it('returns error on failure', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'not installed' }),
      })

      const result = await useOrchestrationStore.getState().openInWarp()

      expect(result.success).toBe(false)
      expect(result.error).toBe('not installed')
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ selectedProjectId: 'p1' })
      mockFetch.mockRejectedValueOnce(new Error('Network'))

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted_task_ids: ['t1'] }),
      })

      const result = await useOrchestrationStore.getState().deleteTask('t1')

      expect(result.success).toBe(true)
      expect(result.deletedIds).toEqual(['t1'])
      expect(useOrchestrationStore.getState().tasks['t1'].isDeleted).toBe(true)
    })

    it('returns error on API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useOrchestrationStore.getState().deleteTask('t1')

      expect(result.success).toBe(false)
    })

    it('handles network error', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockFetch.mockRejectedValueOnce(new Error('Network'))

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          exists: true,
          children_count: 2,
          in_progress_count: 1,
          in_progress_ids: ['t2'],
          can_delete: false,
        }),
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ retry_count: 2 }),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paused_at: '2025-01-01T00:00:00Z' }),
      })

      const result = await useOrchestrationStore.getState().pauseTask('t1', 'need review')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('paused')
      expect(useOrchestrationStore.getState().tasks['t1'].pauseReason).toBe('need review')
    })

    it('handles API failure', async () => {
      useOrchestrationStore.setState({ sessionId: 'sess-1' })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Cannot pause' }),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await useOrchestrationStore.getState().resumeTask('t1')

      expect(result.success).toBe(true)
      expect(useOrchestrationStore.getState().tasks['t1'].status).toBe('pending')
      expect(useOrchestrationStore.getState().tasks['t1'].pausedAt).toBeNull()
      expect(useOrchestrationStore.getState().tasks['t1'].pauseReason).toBeNull()
    })
  })
})
