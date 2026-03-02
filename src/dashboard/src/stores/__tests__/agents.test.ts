import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useAgentsStore, Agent, AgentRegistryStats, TaskAnalysisHistory, TaskAnalysisResult } from '../agents'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A test agent',
  category: 'development',
  status: 'available',
  capabilities: [{ name: 'Testing', description: 'Test capability', keywords: ['test'], priority: 1 }],
  specializations: ['React', 'TypeScript'],
  estimated_cost_per_task: 0.01,
  avg_execution_time_ms: 1000,
  total_tasks_completed: 10,
  success_rate: 0.95,
  is_available: true,
}

const mockStats: AgentRegistryStats = {
  total_agents: 5,
  available_agents: 3,
  busy_agents: 2,
  by_category: { development: 2, orchestration: 2, quality: 1 },
  total_tasks_completed: 100,
  avg_success_rate: 0.92,
}

describe('agents store', () => {
  beforeEach(() => {
    // Reset store - all fields
    useAgentsStore.setState({
      agents: [],
      stats: null,
      searchResults: [],
      lastAnalysis: null,
      isLoading: false,
      error: null,
      selectedAgentId: null,
      categoryFilter: null,
      // History state
      analysisHistory: [],
      historyLoading: false,
      historyTotal: 0,
      historyHasMore: false,
      historyProjectFilter: null,
      selectedHistoryId: null,
      // Execution state
      executingAnalysisId: null,
      executionSessionId: null,
      executionError: null,
      // Image/OCR state
      attachedImages: [],
      ocrStatuses: {},
      attachedMdFiles: [],
      mdReadStatuses: {},
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('has empty agents array', () => {
      expect(useAgentsStore.getState().agents).toEqual([])
    })

    it('has null stats', () => {
      expect(useAgentsStore.getState().stats).toBeNull()
    })

    it('has no selected agent', () => {
      expect(useAgentsStore.getState().selectedAgentId).toBeNull()
    })

    it('has no category filter', () => {
      expect(useAgentsStore.getState().categoryFilter).toBeNull()
    })
  })

  describe('setSelectedAgent', () => {
    it('sets selected agent id', () => {
      const { setSelectedAgent } = useAgentsStore.getState()

      setSelectedAgent('agent-1')
      expect(useAgentsStore.getState().selectedAgentId).toBe('agent-1')
    })

    it('clears selected agent when null', () => {
      const { setSelectedAgent } = useAgentsStore.getState()

      setSelectedAgent('agent-1')
      setSelectedAgent(null)
      expect(useAgentsStore.getState().selectedAgentId).toBeNull()
    })
  })

  describe('clearError', () => {
    it('clears error state', () => {
      useAgentsStore.setState({ error: 'Some error' })

      const { clearError } = useAgentsStore.getState()
      clearError()

      expect(useAgentsStore.getState().error).toBeNull()
    })
  })

  describe('fetchAgents', () => {
    it('sets loading state during fetch', async () => {
      let resolvePromise: (v: unknown) => void
      mockApiClient.get.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const { fetchAgents } = useAgentsStore.getState()
      const promise = fetchAgents()

      expect(useAgentsStore.getState().isLoading).toBe(true)

      resolvePromise!([mockAgent])
      await promise
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('updates agents on successful fetch', async () => {
      mockApiClient.get.mockResolvedValueOnce([mockAgent])

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().agents).toHaveLength(1)
      expect(useAgentsStore.getState().agents[0].name).toBe('Test Agent')
    })

    it('sets error on fetch failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch agents'))

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().error).toContain('Failed to fetch agents')
    })

    it('handles network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().error).toBe('Network error')
    })

    it('adds category filter to URL', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents('development')

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('category=development')
      )
    })

    it('adds available_only filter to URL', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents(undefined, true)

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('available_only=true')
      )
    })
  })

  describe('fetchStats', () => {
    it('updates stats on successful fetch', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockStats)

      const { fetchStats } = useAgentsStore.getState()
      await fetchStats()

      expect(useAgentsStore.getState().stats).toEqual(mockStats)
    })

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      const { fetchStats } = useAgentsStore.getState()
      await fetchStats()

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('searchAgents', () => {
    it('calls apiClient.post with query', async () => {
      mockApiClient.post.mockResolvedValueOnce([{ agent: mockAgent, score: 0.9 }])

      const { searchAgents } = useAgentsStore.getState()
      await searchAgents('react developer')

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/agents/search'),
        expect.objectContaining({
          query: 'react developer',
        })
      )
    })

    it('updates searchResults on success', async () => {
      mockApiClient.post.mockResolvedValueOnce([{ agent: mockAgent, score: 0.9 }])

      const { searchAgents } = useAgentsStore.getState()
      await searchAgents('test')

      expect(useAgentsStore.getState().searchResults).toHaveLength(1)
    })
  })

  describe('analyzeTask', () => {
    const mockAnalysisResult = {
      success: true,
      analysis: {
        type: 'simple',
        analysis: {
          complexity_score: 3,
          effort_level: 'medium',
          requires_decomposition: false,
          context_summary: 'Test task',
          key_requirements: ['Testing'],
        },
        execution_plan: {
          strategy: 'sequential',
          execution_order: ['task-1'],
          parallel_groups: [],
          subtasks: {},
        },
        subtask_count: 1,
        strategy: 'sequential',
      },
      execution_time_ms: 100,
    }

    it('calls apiClient.post with task (no images)', async () => {
      // analyzeTask -> apiClient.post, then fetchAnalysisHistory -> apiClient.get
      mockApiClient.post.mockResolvedValueOnce(mockAnalysisResult)
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      const { analyzeTask } = useAgentsStore.getState()
      await analyzeTask('Build a React component')

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/agents/orchestrate/analyze'),
        expect.objectContaining({
          task: 'Build a React component',
        })
      )
    })

    it('returns analysis result', async () => {
      mockApiClient.post.mockResolvedValueOnce(mockAnalysisResult)
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      const { analyzeTask } = useAgentsStore.getState()
      const result = await analyzeTask('Test task')

      expect(result).toEqual(mockAnalysisResult)
      expect(useAgentsStore.getState().lastAnalysis).toEqual(mockAnalysisResult)
    })

    it('returns null and sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('API error'))

      const { analyzeTask } = useAgentsStore.getState()
      const result = await analyzeTask('Test task')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().error).toBe('API error')
    })
  })

  describe('setCategoryFilter', () => {
    it('sets category filter and triggers fetch', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      const { setCategoryFilter } = useAgentsStore.getState()
      await setCategoryFilter('quality')

      expect(useAgentsStore.getState().categoryFilter).toBe('quality')
    })

    it('clears filter when null', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      useAgentsStore.setState({ categoryFilter: 'development' })

      const { setCategoryFilter } = useAgentsStore.getState()
      await setCategoryFilter(null)

      expect(useAgentsStore.getState().categoryFilter).toBeNull()
    })
  })

  // ── Image Attachment Actions ────────────────────────────

  describe('setAttachedImages', () => {
    it('sets attached images', () => {
      const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png')]
      useAgentsStore.getState().setAttachedImages(files)
      expect(useAgentsStore.getState().attachedImages).toHaveLength(2)
    })

    it('replaces existing images', () => {
      useAgentsStore.setState({ attachedImages: [new File(['x'], 'x.png')] })
      const newFiles = [new File(['y'], 'y.png')]
      useAgentsStore.getState().setAttachedImages(newFiles)
      expect(useAgentsStore.getState().attachedImages).toHaveLength(1)
      expect(useAgentsStore.getState().attachedImages[0].name).toBe('y.png')
    })
  })

  describe('addAttachedImages', () => {
    it('adds images to existing list', () => {
      useAgentsStore.setState({ attachedImages: [new File(['a'], 'a.png')] })
      useAgentsStore.getState().addAttachedImages([new File(['b'], 'b.png')])
      expect(useAgentsStore.getState().attachedImages).toHaveLength(2)
    })

    it('enforces max 5 images', () => {
      const existing = [1, 2, 3, 4].map((i) => new File([`${i}`], `${i}.png`))
      useAgentsStore.setState({ attachedImages: existing })
      const newOnes = [5, 6, 7].map((i) => new File([`${i}`], `${i}.png`))
      useAgentsStore.getState().addAttachedImages(newOnes)
      expect(useAgentsStore.getState().attachedImages).toHaveLength(5)
    })
  })

  describe('removeAttachedImage', () => {
    it('removes image by index', () => {
      const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png'), new File(['c'], 'c.png')]
      useAgentsStore.setState({ attachedImages: files })
      useAgentsStore.getState().removeAttachedImage(1)
      const remaining = useAgentsStore.getState().attachedImages
      expect(remaining).toHaveLength(2)
      expect(remaining[0].name).toBe('a.png')
      expect(remaining[1].name).toBe('c.png')
    })
  })

  describe('clearAttachedImages', () => {
    it('clears all images and ocr statuses', () => {
      useAgentsStore.setState({
        attachedImages: [new File(['a'], 'a.png')],
        ocrStatuses: { 'a.png': 'done' },
      })
      useAgentsStore.getState().clearAttachedImages()
      expect(useAgentsStore.getState().attachedImages).toHaveLength(0)
      expect(useAgentsStore.getState().ocrStatuses).toEqual({})
    })
  })

  // ── OCR Actions ────────────────────────────────────────

  describe('setOcrStatus', () => {
    it('sets status for a file key', () => {
      useAgentsStore.getState().setOcrStatus('img1.png', 'processing')
      expect(useAgentsStore.getState().ocrStatuses['img1.png']).toBe('processing')
    })

    it('updates existing status', () => {
      useAgentsStore.setState({ ocrStatuses: { 'img1.png': 'processing' } })
      useAgentsStore.getState().setOcrStatus('img1.png', 'done')
      expect(useAgentsStore.getState().ocrStatuses['img1.png']).toBe('done')
    })
  })

  describe('removeOcrStatus', () => {
    it('removes status for a file key', () => {
      useAgentsStore.setState({ ocrStatuses: { 'img1.png': 'done', 'img2.png': 'error' } })
      useAgentsStore.getState().removeOcrStatus('img1.png')
      expect(useAgentsStore.getState().ocrStatuses['img1.png']).toBeUndefined()
      expect(useAgentsStore.getState().ocrStatuses['img2.png']).toBe('error')
    })
  })

  describe('clearOcrStatuses', () => {
    it('clears all OCR statuses', () => {
      useAgentsStore.setState({ ocrStatuses: { 'a.png': 'done', 'b.png': 'error' } })
      useAgentsStore.getState().clearOcrStatuses()
      expect(useAgentsStore.getState().ocrStatuses).toEqual({})
    })
  })

  // ── History Actions ────────────────────────────────────

  describe('fetchAnalysisHistory', () => {
    const mockHistoryData = {
      items: [
        { id: 'h1', task_input: 'task 1', success: true, analysis: null, error: null, execution_time_ms: 100, complexity_score: 3, effort_level: 'low', subtask_count: 1, strategy: 'sequential', project_id: null },
      ],
      total: 1,
      has_more: false,
    }

    it('fetches history and updates state', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)
      await useAgentsStore.getState().fetchAnalysisHistory()
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
      expect(useAgentsStore.getState().historyTotal).toBe(1)
      expect(useAgentsStore.getState().historyHasMore).toBe(false)
    })

    it('resets history when reset=true', async () => {
      useAgentsStore.setState({ analysisHistory: [{ id: 'old' } as unknown as TaskAnalysisHistory] })
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)
      await useAgentsStore.getState().fetchAnalysisHistory(undefined, true)
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
      expect(useAgentsStore.getState().analysisHistory[0].id).toBe('h1')
    })

    it('filters by projectId', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)
      await useAgentsStore.getState().fetchAnalysisHistory('proj-1')
      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'))
    })

    it('handles fetch failure gracefully', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))
      await useAgentsStore.getState().fetchAnalysisHistory()
      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })
  })

  describe('loadMoreHistory', () => {
    it('does nothing when historyHasMore is false', async () => {
      useAgentsStore.setState({ historyHasMore: false })
      await useAgentsStore.getState().loadMoreHistory()
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('does nothing when historyLoading is true', async () => {
      useAgentsStore.setState({ historyLoading: true, historyHasMore: true })
      await useAgentsStore.getState().loadMoreHistory()
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('appends items to existing history', async () => {
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: null,
      })
      mockApiClient.get.mockResolvedValueOnce({ items: [{ id: 'h2' }], total: 2, has_more: false })
      await useAgentsStore.getState().loadMoreHistory()
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(2)
      expect(useAgentsStore.getState().historyHasMore).toBe(false)
    })
  })

  describe('deleteAnalysis', () => {
    it('removes item from history on success', async () => {
      useAgentsStore.setState({
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory, { id: 'h2' } as unknown as TaskAnalysisHistory],
        historyTotal: 2,
        selectedHistoryId: null,
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)
      const result = await useAgentsStore.getState().deleteAnalysis('h1')
      expect(result).toBe(true)
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
      expect(useAgentsStore.getState().historyTotal).toBe(1)
    })

    it('clears selection if deleted item was selected', async () => {
      useAgentsStore.setState({
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory],
        historyTotal: 1,
        selectedHistoryId: 'h1',
        lastAnalysis: { success: true } as unknown as TaskAnalysisResult,
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)
      await useAgentsStore.getState().deleteAnalysis('h1')
      expect(useAgentsStore.getState().selectedHistoryId).toBeNull()
      expect(useAgentsStore.getState().lastAnalysis).toBeNull()
    })

    it('returns false on failure', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('Network error'))
      const result = await useAgentsStore.getState().deleteAnalysis('h1')
      expect(result).toBe(false)
    })
  })

  describe('selectHistoryItem', () => {
    it('clears selection when null is passed', () => {
      useAgentsStore.setState({ selectedHistoryId: 'h1', lastAnalysis: { success: true } as unknown as TaskAnalysisResult })
      useAgentsStore.getState().selectHistoryItem(null)
      expect(useAgentsStore.getState().selectedHistoryId).toBeNull()
      expect(useAgentsStore.getState().lastAnalysis).toBeNull()
    })

    it('sets selectedHistoryId and converts to TaskAnalysisResult', () => {
      const historyItem = {
        id: 'h1',
        task_input: 'build app',
        success: true,
        analysis: { type: 'simple' },
        error: null,
        execution_time_ms: 500,
        complexity_score: 3,
        effort_level: 'medium',
        subtask_count: 2,
        strategy: 'sequential',
        project_id: 'proj-1',
      }
      useAgentsStore.getState().selectHistoryItem(historyItem as unknown as TaskAnalysisHistory)
      expect(useAgentsStore.getState().selectedHistoryId).toBe('h1')
      expect(useAgentsStore.getState().lastAnalysis).toMatchObject({
        success: true,
        analysis_id: 'h1',
        execution_time_ms: 500,
      })
    })
  })

  // ── Execution Actions ──────────────────────────────────

  describe('executeAnalysis', () => {
    it('returns session_id on success', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: true, session_id: 'sess-1' })
      const result = await useAgentsStore.getState().executeAnalysis('analysis-1')
      expect(result).toBe('sess-1')
      expect(useAgentsStore.getState().executionSessionId).toBe('sess-1')
    })

    it('returns null when success=false', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: false, error: 'Execution failed' })
      const result = await useAgentsStore.getState().executeAnalysis('analysis-1')
      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Execution failed')
    })

    it('returns null on network error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'))
      const result = await useAgentsStore.getState().executeAnalysis('analysis-1')
      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Network error')
    })
  })

  describe('clearExecution', () => {
    it('clears execution state', () => {
      useAgentsStore.setState({
        executingAnalysisId: 'a1',
        executionSessionId: 's1',
        executionError: 'err',
      })
      useAgentsStore.getState().clearExecution()
      expect(useAgentsStore.getState().executingAnalysisId).toBeNull()
      expect(useAgentsStore.getState().executionSessionId).toBeNull()
      expect(useAgentsStore.getState().executionError).toBeNull()
    })
  })

  // ── Additional coverage tests ──────────────────────────

  describe('fetchAgents - additional branches', () => {
    it('handles non-Error thrown objects in catch', async () => {
      mockApiClient.get.mockRejectedValueOnce('string error')

      await useAgentsStore.getState().fetchAgents()

      expect(useAgentsStore.getState().error).toBe('Failed to fetch agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('fetches without query params when no filters provided', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      await useAgentsStore.getState().fetchAgents()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/agents')
    })

    it('combines category and availableOnly params', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      await useAgentsStore.getState().fetchAgents('research', true)

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('category=research')
      expect(url).toContain('available_only=true')
    })
  })

  describe('fetchStats - additional branches', () => {
    it('handles error response', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Internal Server Error'))

      await useAgentsStore.getState().fetchStats()

      expect(consoleSpy).toHaveBeenCalled()
      // Stats should remain unchanged (null) on error
      expect(useAgentsStore.getState().stats).toBeNull()
    })
  })

  describe('searchAgents - additional branches', () => {
    it('handles error on search', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to search agents'))

      await useAgentsStore.getState().searchAgents('test query')

      expect(useAgentsStore.getState().error).toContain('Failed to search agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('handles non-Error thrown objects in catch', async () => {
      mockApiClient.post.mockRejectedValueOnce('some string error')

      await useAgentsStore.getState().searchAgents('test query')

      expect(useAgentsStore.getState().error).toBe('Failed to search agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('includes category in search body when provided', async () => {
      mockApiClient.post.mockResolvedValueOnce([])

      await useAgentsStore.getState().searchAgents('query', 'quality')

      const body = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(body.category).toBe('quality')
    })
  })

  describe('analyzeTask - additional branches', () => {
    const mockAnalysisResult = {
      success: true,
      analysis: {
        type: 'simple',
        analysis: {
          complexity_score: 3,
          effort_level: 'medium',
          requires_decomposition: false,
          context_summary: 'Test task',
          key_requirements: ['Testing'],
        },
        execution_plan: {
          strategy: 'sequential',
          execution_order: ['task-1'],
          parallel_groups: [],
          subtasks: {},
        },
        subtask_count: 1,
        strategy: 'sequential',
      },
      execution_time_ms: 100,
    }

    it('uses multipart/form-data when images are attached via store state', async () => {
      // analyzeTask with images uses raw fetch, not apiClient
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      // fetchAnalysisHistory after success uses apiClient.get
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      const images = [new File(['imgdata'], 'screenshot.png', { type: 'image/png' })]
      useAgentsStore.setState({ attachedImages: images })

      await useAgentsStore.getState().analyzeTask('Analyze this UI')

      const callUrl = fetchSpy.mock.calls[0][0] as string
      expect(callUrl).toContain('analyze-with-images')
      const callOpts = fetchSpy.mock.calls[0][1] as RequestInit
      expect(callOpts.body).toBeInstanceOf(FormData)
    })

    it('uses multipart/form-data when images are passed as argument', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      const images = [new File(['imgdata'], 'test.png', { type: 'image/png' })]

      await useAgentsStore.getState().analyzeTask('Test task', undefined, images)

      const callUrl = fetchSpy.mock.calls[0][0] as string
      expect(callUrl).toContain('analyze-with-images')
    })

    it('includes context in FormData when images present and context provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      const images = [new File(['imgdata'], 'test.png', { type: 'image/png' })]

      await useAgentsStore.getState().analyzeTask('Test', { project_id: 'p1' }, images)

      const formData = fetchSpy.mock.calls[0][1]?.body as FormData
      expect(formData.get('task')).toBe('Test')
      expect(formData.get('context')).toBe(JSON.stringify({ project_id: 'p1' }))
    })

    it('handles non-Error thrown objects in catch', async () => {
      mockApiClient.post.mockRejectedValueOnce('unknown error')

      const result = await useAgentsStore.getState().analyzeTask('Test task')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().error).toBe('Failed to analyze task')
      expect(useAgentsStore.getState().lastAnalysis).toMatchObject({
        success: false,
        error: 'Failed to analyze task',
      })
    })

    it('clears attachedImages and ocrStatuses on success', async () => {
      // analyzeTask with images uses raw fetch, not apiClient.post
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      // fetchAnalysisHistory after success uses apiClient.get
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      useAgentsStore.setState({
        attachedImages: [new File(['a'], 'a.png')],
        ocrStatuses: { 'a.png_1_0': 'done' },
      })

      await useAgentsStore.getState().analyzeTask('Test task')

      expect(useAgentsStore.getState().attachedImages).toHaveLength(0)
      expect(useAgentsStore.getState().ocrStatuses).toEqual({})
    })

    it('refreshes history with project_id from context after success', async () => {
      mockApiClient.post.mockResolvedValueOnce(mockAnalysisResult)
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, has_more: false })

      await useAgentsStore.getState().analyzeTask('Test', { project_id: 'proj-99' })

      // fetchAnalysisHistory is fire-and-forget, so wait for it to settle
      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('project_id=proj-99')
        )
      })
    })
  })

  // ── extractTextFromImage ──────────────────────────────
  // Note: extractTextFromImage uses raw fetch, not apiClient

  describe('extractTextFromImage', () => {
    it('returns extracted text on success', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, text: 'Hello world' }))
      )

      const file = new File(['imgdata'], 'test.png', { type: 'image/png' })
      const result = await useAgentsStore.getState().extractTextFromImage(file)

      expect(result).toBe('Hello world')
    })

    it('sends image via FormData', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, text: 'text' }))
      )

      const file = new File(['imgdata'], 'test.png', { type: 'image/png' })
      await useAgentsStore.getState().extractTextFromImage(file)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/agents/ocr'),
        expect.objectContaining({ method: 'POST' })
      )
      const body = fetchSpy.mock.calls[0][1]?.body as FormData
      expect(body.get('image')).toBe(file)
    })

    it('returns null when HTTP response is not ok', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

      const file = new File(['imgdata'], 'test.png', { type: 'image/png' })
      const result = await useAgentsStore.getState().extractTextFromImage(file)

      expect(result).toBeNull()
    })

    it('returns null when result.success is false', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'OCR failed' }))
      )

      const file = new File(['imgdata'], 'test.png', { type: 'image/png' })
      const result = await useAgentsStore.getState().extractTextFromImage(file)

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith('OCR error:', 'OCR failed')
    })

    it('returns null on network error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const file = new File(['imgdata'], 'test.png', { type: 'image/png' })
      const result = await useAgentsStore.getState().extractTextFromImage(file)

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith('OCR request failed:', expect.any(Error))
    })
  })

  // ── executeAnalysis - additional branches ─────────────

  describe('executeAnalysis - additional branches', () => {
    it('sets executingAnalysisId on start', async () => {
      let resolvePromise: (v: unknown) => void
      mockApiClient.post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useAgentsStore.getState().executeAnalysis('a-1')
      expect(useAgentsStore.getState().executingAnalysisId).toBe('a-1')
      resolvePromise!({ success: true, session_id: 'sess-1' })
      await promise
    })

    it('passes projectId in request body', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: true, session_id: 'sess-1' })

      await useAgentsStore.getState().executeAnalysis('a-1', 'proj-5')

      const body = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(body.project_id).toBe('proj-5')
    })

    it('sends null project_id when not provided', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: true, session_id: 'sess-1' })

      await useAgentsStore.getState().executeAnalysis('a-1')

      const body = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(body.project_id).toBeNull()
    })

    it('handles non-Error thrown objects in catch', async () => {
      mockApiClient.post.mockRejectedValueOnce('string error')

      const result = await useAgentsStore.getState().executeAnalysis('a-1')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Failed to execute analysis')
    })

    it('uses fallback error message when success is false without error', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: false })

      const result = await useAgentsStore.getState().executeAnalysis('a-1')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Execution failed')
    })
  })

  // ── executeWithWarp ───────────────────────────────────
  // executeWithWarp uses apiClient.get (analysis) + apiClient.post (warp)

  describe('executeWithWarp', () => {
    const mockAnalysisData = {
      task_input: 'Build a feature',
      analysis: {
        type: 'complex',
        analysis: {
          complexity_score: 5,
          effort_level: 'high',
          requires_decomposition: true,
          context_summary: 'Build feature',
          key_requirements: ['React'],
        },
        execution_plan: {
          strategy: 'parallel',
          execution_order: ['task-1', 'task-2'],
          parallel_groups: [['task-1', 'task-2']],
          subtasks: {
            'task-1': { title: 'Setup', agent: 'dev-agent', dependencies: [], effort: 'low' },
            'task-2': { title: 'Implement', agent: null, dependencies: ['task-1'], effort: 'high' },
          },
        },
        subtask_count: 2,
        strategy: 'parallel',
      },
      project_id: 'proj-1',
      image_paths: ['/tmp/img.png'],
    }

    it('returns true on successful warp execution', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockAnalysisData) // analysis fetch
      mockApiClient.post.mockResolvedValueOnce({ success: true }) // warp open

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(true)
      expect(useAgentsStore.getState().executingAnalysisId).toBeNull()
    })

    it('sets executingAnalysisId at start', async () => {
      let resolvePromise: (v: unknown) => void
      mockApiClient.get.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(useAgentsStore.getState().executingAnalysisId).toBe('a-1')

      resolvePromise!(mockAnalysisData)
      mockApiClient.post.mockResolvedValueOnce({ success: true })
      await promise.catch(() => {})
    })

    it('returns false when analysis fetch fails', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Not Found'))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Not Found')
    })

    it('returns false when no project id available', async () => {
      const dataWithoutProject = { ...mockAnalysisData, project_id: null }
      mockApiClient.get.mockResolvedValueOnce(dataWithoutProject)

      const result = await useAgentsStore.getState().executeWithWarp('a-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('프로젝트')
    })

    it('uses analysis project_id when projectId argument is not provided', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockAnalysisData)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      await useAgentsStore.getState().executeWithWarp('a-1')

      const warpBody = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(warpBody.project_id).toBe('proj-1')
    })

    it('returns false when warp result.success is false', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockAnalysisData)
      mockApiClient.post.mockResolvedValueOnce({ success: false, error: 'Warp error' })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Warp error')
    })

    it('handles network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Network error')
    })

    it('handles non-Error thrown objects in catch', async () => {
      mockApiClient.get.mockRejectedValueOnce('string error')

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Warp 실행에 실패했습니다')
    })

    it('sends correct warp request body with image_paths', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockAnalysisData)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      const warpBody = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(warpBody.image_paths).toEqual(['/tmp/img.png'])
      expect(warpBody.use_claude_cli).toBe(true)
      expect(warpBody.new_window).toBe(false)
    })

    it('sends null image_paths when not present in analysis', async () => {
      const dataNoImages = { ...mockAnalysisData, image_paths: null }
      mockApiClient.get.mockResolvedValueOnce(dataNoImages)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      const warpBody = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(warpBody.image_paths).toBeNull()
    })

    it('uses default error when warp result success is false without error field', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockAnalysisData)
      mockApiClient.post.mockResolvedValueOnce({ success: false })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('Warp')
    })

    it('handles analysis with empty parallel_groups (no subtasks section)', async () => {
      const dataNoGroups = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: {
            ...mockAnalysisData.analysis.execution_plan,
            parallel_groups: [],
            subtasks: {},
          },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataNoGroups)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles analysis with single-item group (non-parallel step)', async () => {
      const dataSingleGroup = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: {
            ...mockAnalysisData.analysis.execution_plan,
            parallel_groups: [['task-1']],
            subtasks: {
              'task-1': { title: 'Solo task', agent: null, dependencies: [], effort: 'low' },
            },
          },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataSingleGroup)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles subtask with missing title/effort/agent and with dependencies', async () => {
      const dataEdgeCases = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: {
            ...mockAnalysisData.analysis.execution_plan,
            parallel_groups: [['task-x', 'task-y']],
            subtasks: {
              'task-x': { title: '', agent: 'some-agent', dependencies: ['dep-1', 'dep-2'], effort: '' },
              'task-y': { title: 'Has title', agent: null, dependencies: [], effort: 'high' },
            },
          },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataEdgeCases)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles subtask id not found in subtasks map', async () => {
      const dataMissing = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: {
            ...mockAnalysisData.analysis.execution_plan,
            parallel_groups: [['task-missing', 'task-1']],
            subtasks: {
              'task-1': { title: 'Exists', agent: null, dependencies: [], effort: 'medium' },
            },
          },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataMissing)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles analysis with null execution_plan', async () => {
      const dataNoExecPlan = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: null as unknown,
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataNoExecPlan)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles analysis with null analysis field', async () => {
      const dataNoAnalysis = {
        ...mockAnalysisData,
        analysis: null,
      }
      mockApiClient.get.mockResolvedValueOnce(dataNoAnalysis)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles subtask with undefined dependencies', async () => {
      const dataNoDepsProp = {
        ...mockAnalysisData,
        analysis: {
          ...mockAnalysisData.analysis,
          execution_plan: {
            ...mockAnalysisData.analysis.execution_plan,
            parallel_groups: [['task-a']],
            subtasks: {
              'task-a': { title: 'No deps field', agent: null, effort: 'medium' },
            },
          },
        },
      }
      mockApiClient.get.mockResolvedValueOnce(dataNoDepsProp)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('uses fallback title when task_input is null', async () => {
      const dataNoTaskInput = {
        ...mockAnalysisData,
        task_input: null,
      }
      mockApiClient.get.mockResolvedValueOnce(dataNoTaskInput)
      mockApiClient.post.mockResolvedValueOnce({ success: true })

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)

      const warpBody = mockApiClient.post.mock.calls[0][1] as Record<string, unknown>
      expect(warpBody.title).toContain('Analysis')
    })
  })

  // ── fetchAnalysisHistory - additional branches ────────

  describe('fetchAnalysisHistory - additional branches', () => {
    const mockHistoryData = {
      items: [{ id: 'h1' }],
      total: 1,
      has_more: false,
    }

    it('resets history when project filter changes', async () => {
      useAgentsStore.setState({
        analysisHistory: [{ id: 'old' } as unknown as TaskAnalysisHistory],
        historyTotal: 5,
        historyProjectFilter: 'proj-old',
      })
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)

      await useAgentsStore.getState().fetchAnalysisHistory('proj-new')

      expect(useAgentsStore.getState().historyProjectFilter).toBe('proj-new')
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
    })

    it('does not reset when same project filter is used', async () => {
      useAgentsStore.setState({
        analysisHistory: [{ id: 'existing' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: 'proj-1',
        historyTotal: 1,
        historyHasMore: false,
      })
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)

      await useAgentsStore.getState().fetchAnalysisHistory('proj-1')

      expect(useAgentsStore.getState().historyProjectFilter).toBe('proj-1')
    })

    it('handles error response', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Server Error'))

      await useAgentsStore.getState().fetchAnalysisHistory()

      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })

    it('sets historyProjectFilter to null when projectId is undefined', async () => {
      useAgentsStore.setState({ historyProjectFilter: 'some-proj' })
      mockApiClient.get.mockResolvedValueOnce(mockHistoryData)

      await useAgentsStore.getState().fetchAnalysisHistory(undefined, true)

      expect(useAgentsStore.getState().historyProjectFilter).toBeNull()
    })
  })

  // ── loadMoreHistory - additional branches ─────────────

  describe('loadMoreHistory - additional branches', () => {
    it('includes project filter in request when set', async () => {
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: 'proj-filter',
      })
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 1, has_more: false })

      await useAgentsStore.getState().loadMoreHistory()

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-filter'))
    })

    it('sets correct offset based on existing history length', async () => {
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory, { id: 'h2' } as unknown as TaskAnalysisHistory, { id: 'h3' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: null,
      })
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 3, has_more: false })

      await useAgentsStore.getState().loadMoreHistory()

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('offset=3'))
    })

    it('handles error response gracefully', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [],
        historyProjectFilter: null,
      })
      mockApiClient.get.mockRejectedValueOnce(new Error('Server Error'))

      await useAgentsStore.getState().loadMoreHistory()

      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })

    it('handles network error gracefully', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [],
        historyProjectFilter: null,
      })
      mockApiClient.get.mockRejectedValueOnce(new Error('Connection refused'))

      await useAgentsStore.getState().loadMoreHistory()

      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })
  })

  // ── deleteAnalysis - additional branches ──────────────

  describe('deleteAnalysis - additional branches', () => {
    it('preserves selection when deleted item was not selected', async () => {
      useAgentsStore.setState({
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory, { id: 'h2' } as unknown as TaskAnalysisHistory],
        historyTotal: 2,
        selectedHistoryId: 'h2',
        lastAnalysis: { success: true } as unknown as TaskAnalysisResult,
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useAgentsStore.getState().deleteAnalysis('h1')

      expect(useAgentsStore.getState().selectedHistoryId).toBe('h2')
      expect(useAgentsStore.getState().lastAnalysis).toMatchObject({ success: true })
    })

    it('handles error response', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.delete.mockRejectedValueOnce(new Error('Server Error'))

      const result = await useAgentsStore.getState().deleteAnalysis('h1')

      expect(result).toBe(false)
    })
  })

  // ── selectHistoryItem - additional branches ───────────

  describe('selectHistoryItem - additional branches', () => {
    it('converts error field from string to result format', () => {
      const historyItem = {
        id: 'h-err',
        task_input: 'failed task',
        success: false,
        analysis: null,
        error: 'Something went wrong',
        execution_time_ms: 50,
        complexity_score: null,
        effort_level: null,
        subtask_count: null,
        strategy: null,
        project_id: null,
        image_paths: null,
        created_at: '2025-01-01T00:00:00Z',
      }
      useAgentsStore.getState().selectHistoryItem(historyItem as unknown as TaskAnalysisHistory)

      const lastAnalysis = useAgentsStore.getState().lastAnalysis
      expect(lastAnalysis).not.toBeNull()
      expect(lastAnalysis?.success).toBe(false)
      expect(lastAnalysis?.error).toBe('Something went wrong')
      expect(lastAnalysis?.analysis).toBeUndefined()
      expect(lastAnalysis?.analysis_id).toBe('h-err')
    })
  })
})
