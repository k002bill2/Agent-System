/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMCPStore } from '../mcp'

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useMCPStore.setState({
    servers: [],
    stats: null,
    lastToolResult: null,
    selectedTools: [],
    lastBatchResult: null,
    isCallingBatch: false,
    isLoading: false,
    error: null,
    selectedServerId: null,
    statusFilter: null,
    isCallingTool: false,
  })
}

describe('mcp store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty servers', () => {
      expect(useMCPStore.getState().servers).toEqual([])
    })

    it('has null stats', () => {
      expect(useMCPStore.getState().stats).toBeNull()
    })

    it('has no selected server', () => {
      expect(useMCPStore.getState().selectedServerId).toBeNull()
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setSelectedServer', () => {
      useMCPStore.getState().setSelectedServer('srv-1')
      expect(useMCPStore.getState().selectedServerId).toBe('srv-1')
    })

    it('setSelectedServer null', () => {
      useMCPStore.getState().setSelectedServer('srv-1')
      useMCPStore.getState().setSelectedServer(null)
      expect(useMCPStore.getState().selectedServerId).toBeNull()
    })

    it('setStatusFilter', () => {
      useMCPStore.getState().setStatusFilter('running')
      expect(useMCPStore.getState().statusFilter).toBe('running')
    })

    it('clearError', () => {
      useMCPStore.setState({ error: 'some error' })
      useMCPStore.getState().clearError()
      expect(useMCPStore.getState().error).toBeNull()
    })

    it('clearToolResult', () => {
      useMCPStore.setState({ lastToolResult: { success: true, execution_time_ms: 100 } as any })
      useMCPStore.getState().clearToolResult()
      expect(useMCPStore.getState().lastToolResult).toBeNull()
    })

    it('clearBatchResult', () => {
      useMCPStore.setState({ lastBatchResult: {} as any })
      useMCPStore.getState().clearBatchResult()
      expect(useMCPStore.getState().lastBatchResult).toBeNull()
    })
  })

  // ── fetchServers ───────────────────────────────────────

  describe('fetchServers', () => {
    it('fetches and stores servers', async () => {
      const servers = [
        { id: 'srv-1', name: 'filesystem', type: 'filesystem', status: 'running' },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(servers),
      })

      await useMCPStore.getState().fetchServers()

      expect(useMCPStore.getState().servers).toEqual(servers)
      expect(useMCPStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Server Error' })

      await useMCPStore.getState().fetchServers()

      expect(useMCPStore.getState().error).toContain('Failed to fetch MCP servers')
      expect(useMCPStore.getState().isLoading).toBe(false)
    })
  })

  // ── fetchStats ─────────────────────────────────────────

  describe('fetchStats', () => {
    it('fetches and stores stats', async () => {
      const stats = { total_servers: 3, running_servers: 2, total_tools: 10 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(stats),
      })

      await useMCPStore.getState().fetchStats()

      expect(useMCPStore.getState().stats).toEqual(stats)
    })

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      await useMCPStore.getState().fetchStats()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── fetchServerTools ───────────────────────────────────

  describe('fetchServerTools', () => {
    it('fetches tools and updates server', async () => {
      useMCPStore.setState({
        servers: [{ id: 'srv-1', name: 'fs', tools: [] } as any],
      })
      const tools = [{ name: 'read_file', description: 'Read a file' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tools),
      })

      const result = await useMCPStore.getState().fetchServerTools('srv-1')

      expect(result).toEqual(tools)
      expect(useMCPStore.getState().servers[0].tools).toEqual(tools)
    })

    it('returns empty array on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      const result = await useMCPStore.getState().fetchServerTools('srv-1')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })
  })

  // ── startServer ────────────────────────────────────────

  describe('startServer', () => {
    it('starts server and refreshes', async () => {
      useMCPStore.setState({
        servers: [{ id: 'srv-1', name: 'fs', status: 'stopped' } as any],
      })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) }) // start
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // fetchServers
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // fetchStats

      const result = await useMCPStore.getState().startServer('srv-1')

      expect(result).toBe(true)
    })

    it('sets error status on failure', async () => {
      useMCPStore.setState({
        servers: [{ id: 'srv-1', name: 'fs', status: 'stopped' } as any],
      })
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      const result = await useMCPStore.getState().startServer('srv-1')

      expect(result).toBe(false)
      expect(useMCPStore.getState().servers[0].status).toBe('error')
    })
  })

  // ── stopServer ─────────────────────────────────────────

  describe('stopServer', () => {
    it('stops server and refreshes', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true }) // stop
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // fetchServers
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // fetchStats

      const result = await useMCPStore.getState().stopServer('srv-1')

      expect(result).toBe(true)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      const result = await useMCPStore.getState().stopServer('srv-1')

      expect(result).toBe(false)
      expect(useMCPStore.getState().error).toContain('Failed to stop server')
    })
  })

  // ── callTool ───────────────────────────────────────────

  describe('callTool', () => {
    it('calls tool and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, result: 'file content' }),
      })

      const result = await useMCPStore.getState().callTool('srv-1', 'read_file', { path: '/test' })

      expect(result?.success).toBe(true)
      expect(result?.result).toBe('file content')
      expect(useMCPStore.getState().lastToolResult?.success).toBe(true)
      expect(useMCPStore.getState().isCallingTool).toBe(false)
    })

    it('returns error result on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Bad Request' })

      const result = await useMCPStore.getState().callTool('srv-1', 'bad_tool', {})

      expect(result?.success).toBe(false)
      expect(result?.error).toContain('Failed to call tool')
    })
  })

  // ── Batch Tool Selection ───────────────────────────────

  describe('batch tool selection', () => {
    const selection = {
      serverId: 'srv-1',
      serverName: 'fs',
      toolName: 'read_file',
      toolDescription: 'Read',
      arguments: {},
    }

    it('addToolToSelection adds tool', () => {
      useMCPStore.getState().addToolToSelection(selection)

      expect(useMCPStore.getState().selectedTools).toHaveLength(1)
    })

    it('addToolToSelection prevents duplicates', () => {
      useMCPStore.getState().addToolToSelection(selection)
      useMCPStore.getState().addToolToSelection(selection)

      expect(useMCPStore.getState().selectedTools).toHaveLength(1)
    })

    it('removeToolFromSelection removes tool', () => {
      useMCPStore.getState().addToolToSelection(selection)
      useMCPStore.getState().removeToolFromSelection('srv-1', 'read_file')

      expect(useMCPStore.getState().selectedTools).toHaveLength(0)
    })

    it('updateToolArguments updates args', () => {
      useMCPStore.getState().addToolToSelection(selection)
      useMCPStore.getState().updateToolArguments('srv-1', 'read_file', { path: '/new' })

      expect(useMCPStore.getState().selectedTools[0].arguments).toEqual({ path: '/new' })
    })

    it('clearSelectedTools clears all', () => {
      useMCPStore.getState().addToolToSelection(selection)
      useMCPStore.getState().clearSelectedTools()

      expect(useMCPStore.getState().selectedTools).toEqual([])
    })
  })

  // ── callToolsBatch ─────────────────────────────────────

  describe('callToolsBatch', () => {
    it('returns null when no tools selected', async () => {
      const result = await useMCPStore.getState().callToolsBatch()

      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('calls batch API and returns result', async () => {
      useMCPStore.getState().addToolToSelection({
        serverId: 'srv-1', serverName: 'fs', toolName: 'read_file',
        toolDescription: 'Read', arguments: { path: '/test' },
      })
      const batchResult = {
        results: [{ success: true, execution_time_ms: 10 }],
        total_execution_time_ms: 10,
        success_count: 1,
        failure_count: 0,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(batchResult),
      })

      const result = await useMCPStore.getState().callToolsBatch(5)

      expect(result).toEqual(batchResult)
      expect(useMCPStore.getState().lastBatchResult).toEqual(batchResult)
      expect(useMCPStore.getState().isCallingBatch).toBe(false)
    })

    it('sets error on failure', async () => {
      useMCPStore.getState().addToolToSelection({
        serverId: 'srv-1', serverName: 'fs', toolName: 'tool',
        toolDescription: '', arguments: {},
      })
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      const result = await useMCPStore.getState().callToolsBatch()

      expect(result).toBeNull()
      expect(useMCPStore.getState().error).toContain('Failed to call tools batch')
    })
  })
})
