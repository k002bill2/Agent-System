import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAgentsStore, Agent, AgentRegistryStats, TaskAnalysisHistory, TaskAnalysisResult } from '../agents'

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
    // Reset store
    useAgentsStore.setState({
      agents: [],
      stats: null,
      searchResults: [],
      lastAnalysis: null,
      isLoading: false,
      error: null,
      selectedAgentId: null,
      categoryFilter: null,
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
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify([mockAgent]))), 50)
        )
      )

      const { fetchAgents } = useAgentsStore.getState()
      const promise = fetchAgents()

      expect(useAgentsStore.getState().isLoading).toBe(true)

      await promise
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('updates agents on successful fetch', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([mockAgent]))
      )

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().agents).toHaveLength(1)
      expect(useAgentsStore.getState().agents[0].name).toBe('Test Agent')
    })

    it('sets error on fetch failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().error).toContain('Failed to fetch agents')
    })

    it('handles network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents()

      expect(useAgentsStore.getState().error).toBe('Network error')
    })

    it('adds category filter to URL', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents('development')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('category=development')
      )
    })

    it('adds available_only filter to URL', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      const { fetchAgents } = useAgentsStore.getState()
      await fetchAgents(undefined, true)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('available_only=true')
      )
    })
  })

  describe('fetchStats', () => {
    it('updates stats on successful fetch', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockStats))
      )

      const { fetchStats } = useAgentsStore.getState()
      await fetchStats()

      expect(useAgentsStore.getState().stats).toEqual(mockStats)
    })

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const { fetchStats } = useAgentsStore.getState()
      await fetchStats()

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('searchAgents', () => {
    it('sends POST request with query', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([{ agent: mockAgent, score: 0.9 }]))
      )

      const { searchAgents } = useAgentsStore.getState()
      await searchAgents('react developer')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/agents/search'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('react developer'),
        })
      )
    })

    it('updates searchResults on success', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([{ agent: mockAgent, score: 0.9 }]))
      )

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

    it('sends POST request with task', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )

      const { analyzeTask } = useAgentsStore.getState()
      await analyzeTask('Build a React component')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/agents/orchestrate/analyze'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Build a React component'),
        })
      )
    })

    it('returns analysis result', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )

      const { analyzeTask } = useAgentsStore.getState()
      const result = await analyzeTask('Test task')

      expect(result).toEqual(mockAnalysisResult)
      expect(useAgentsStore.getState().lastAnalysis).toEqual(mockAnalysisResult)
    })

    it('returns null and sets error on failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('API error'))

      const { analyzeTask } = useAgentsStore.getState()
      const result = await analyzeTask('Test task')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().error).toBe('API error')
    })
  })

  describe('setCategoryFilter', () => {
    it('sets category filter and triggers fetch', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      const { setCategoryFilter } = useAgentsStore.getState()
      await setCategoryFilter('quality')

      expect(useAgentsStore.getState().categoryFilter).toBe('quality')
    })

    it('clears filter when null', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

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
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockHistoryData)))
      await useAgentsStore.getState().fetchAnalysisHistory()
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
      expect(useAgentsStore.getState().historyTotal).toBe(1)
      expect(useAgentsStore.getState().historyHasMore).toBe(false)
    })

    it('resets history when reset=true', async () => {
      useAgentsStore.setState({ analysisHistory: [{ id: 'old' } as unknown as TaskAnalysisHistory] })
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockHistoryData)))
      await useAgentsStore.getState().fetchAnalysisHistory(undefined, true)
      expect(useAgentsStore.getState().analysisHistory).toHaveLength(1)
      expect(useAgentsStore.getState().analysisHistory[0].id).toBe('h1')
    })

    it('filters by projectId', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockHistoryData))
      )
      await useAgentsStore.getState().fetchAnalysisHistory('proj-1')
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-1'))
    })

    it('handles fetch failure gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
      await useAgentsStore.getState().fetchAnalysisHistory()
      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })
  })

  describe('loadMoreHistory', () => {
    it('does nothing when historyHasMore is false', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      useAgentsStore.setState({ historyHasMore: false })
      await useAgentsStore.getState().loadMoreHistory()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does nothing when historyLoading is true', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      useAgentsStore.setState({ historyLoading: true, historyHasMore: true })
      await useAgentsStore.getState().loadMoreHistory()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('appends items to existing history', async () => {
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: null,
      })
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: 'h2' }], total: 2, has_more: false }))
      )
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
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
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
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
      await useAgentsStore.getState().deleteAnalysis('h1')
      expect(useAgentsStore.getState().selectedHistoryId).toBeNull()
      expect(useAgentsStore.getState().lastAnalysis).toBeNull()
    })

    it('returns false on failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
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
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, session_id: 'sess-1' }))
      )
      const result = await useAgentsStore.getState().executeAnalysis('analysis-1')
      expect(result).toBe('sess-1')
      expect(useAgentsStore.getState().executionSessionId).toBe('sess-1')
    })

    it('returns null when success=false', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'Execution failed' }))
      )
      const result = await useAgentsStore.getState().executeAnalysis('analysis-1')
      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Execution failed')
    })

    it('returns null on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
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
      vi.spyOn(global, 'fetch').mockRejectedValue('string error')

      await useAgentsStore.getState().fetchAgents()

      expect(useAgentsStore.getState().error).toBe('Failed to fetch agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('fetches without query params when no filters provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      await useAgentsStore.getState().fetchAgents()

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8000/api/agents')
    })

    it('combines category and availableOnly params', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      await useAgentsStore.getState().fetchAgents('research', true)

      const url = fetchSpy.mock.calls[0][0] as string
      expect(url).toContain('category=research')
      expect(url).toContain('available_only=true')
    })
  })

  describe('fetchStats - additional branches', () => {
    it('handles HTTP error response', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Internal Server Error' })
      )

      await useAgentsStore.getState().fetchStats()

      expect(consoleSpy).toHaveBeenCalled()
      // Stats should remain unchanged (null) on error
      expect(useAgentsStore.getState().stats).toBeNull()
    })
  })

  describe('searchAgents - additional branches', () => {
    it('handles HTTP error response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 400, statusText: 'Bad Request' })
      )

      await useAgentsStore.getState().searchAgents('test query')

      expect(useAgentsStore.getState().error).toContain('Failed to search agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('handles non-Error thrown objects in catch', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue('some string error')

      await useAgentsStore.getState().searchAgents('test query')

      expect(useAgentsStore.getState().error).toBe('Failed to search agents')
      expect(useAgentsStore.getState().isLoading).toBe(false)
    })

    it('includes category in search body when provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]))
      )

      await useAgentsStore.getState().searchAgents('query', 'quality')

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
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
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
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
      const images = [new File(['imgdata'], 'test.png', { type: 'image/png' })]

      await useAgentsStore.getState().analyzeTask('Test task', undefined, images)

      const callUrl = fetchSpy.mock.calls[0][0] as string
      expect(callUrl).toContain('analyze-with-images')
    })

    it('includes context in FormData when images present and context provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      const images = [new File(['imgdata'], 'test.png', { type: 'image/png' })]

      await useAgentsStore.getState().analyzeTask('Test', { project_id: 'p1' }, images)

      const formData = fetchSpy.mock.calls[0][1]?.body as FormData
      expect(formData.get('task')).toBe('Test')
      expect(formData.get('context')).toBe(JSON.stringify({ project_id: 'p1' }))
    })

    it('handles HTTP error response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

      const result = await useAgentsStore.getState().analyzeTask('Test task')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().error).toContain('Failed to analyze task')
    })

    it('handles non-Error thrown objects in catch', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue('unknown error')

      const result = await useAgentsStore.getState().analyzeTask('Test task')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().error).toBe('Failed to analyze task')
      expect(useAgentsStore.getState().lastAnalysis).toMatchObject({
        success: false,
        error: 'Failed to analyze task',
      })
    })

    it('clears attachedImages and ocrStatuses on success', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )
      useAgentsStore.setState({
        attachedImages: [new File(['a'], 'a.png')],
        ocrStatuses: { 'a.png_1_0': 'done' },
      })

      await useAgentsStore.getState().analyzeTask('Test task')

      expect(useAgentsStore.getState().attachedImages).toHaveLength(0)
      expect(useAgentsStore.getState().ocrStatuses).toEqual({})
    })

    it('refreshes history with project_id from context after success', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockAnalysisResult))
      )

      await useAgentsStore.getState().analyzeTask('Test', { project_id: 'proj-99' })

      // First call is the analyze endpoint, second call is fetchAnalysisHistory
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
      const historyUrl = fetchSpy.mock.calls[1][0] as string
      expect(historyUrl).toContain('project_id=proj-99')
    })
  })

  // ── extractTextFromImage ──────────────────────────────

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
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ success: true, session_id: 'sess-1' }))), 50)
        )
      )

      const promise = useAgentsStore.getState().executeAnalysis('a-1')
      expect(useAgentsStore.getState().executingAnalysisId).toBe('a-1')
      await promise
    })

    it('handles HTTP error response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

      const result = await useAgentsStore.getState().executeAnalysis('a-1')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toContain('Failed to execute analysis')
      expect(useAgentsStore.getState().executingAnalysisId).toBeNull()
    })

    it('passes projectId in request body', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, session_id: 'sess-1' }))
      )

      await useAgentsStore.getState().executeAnalysis('a-1', 'proj-5')

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.project_id).toBe('proj-5')
    })

    it('sends null project_id when not provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, session_id: 'sess-1' }))
      )

      await useAgentsStore.getState().executeAnalysis('a-1')

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.project_id).toBeNull()
    })

    it('handles non-Error thrown objects in catch', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue('string error')

      const result = await useAgentsStore.getState().executeAnalysis('a-1')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Failed to execute analysis')
    })

    it('uses fallback error message when success is false without error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: false }))
      )

      const result = await useAgentsStore.getState().executeAnalysis('a-1')

      expect(result).toBeNull()
      expect(useAgentsStore.getState().executionError).toBe('Execution failed')
    })
  })

  // ── executeWithWarp ───────────────────────────────────

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData))) // analysis fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }))) // warp open

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(true)
      expect(useAgentsStore.getState().executingAnalysisId).toBeNull()
    })

    it('sets executingAnalysisId at start', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify(mockAnalysisData))), 50)
        )
      )

      const promise = useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(useAgentsStore.getState().executingAnalysisId).toBe('a-1')
      // Clean up
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })))
      await promise.catch(() => {})
    })

    it('returns false when analysis fetch fails', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 404, statusText: 'Not Found' })
      )

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('404')
    })

    it('returns false when no project id available', async () => {
      const dataWithoutProject = { ...mockAnalysisData, project_id: null }
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(dataWithoutProject))
      )

      const result = await useAgentsStore.getState().executeWithWarp('a-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('프로젝트')
    })

    it('uses analysis project_id when projectId argument is not provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      await useAgentsStore.getState().executeWithWarp('a-1')

      const warpBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string)
      expect(warpBody.project_id).toBe('proj-1')
    })

    it('returns false when warp response is not ok', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Warp not found' }), { status: 500 }))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('Warp not found')
    })

    it('handles warp error response that is not JSON', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response('not json', { status: 500, statusText: 'Error' }))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBeTruthy()
    })

    it('returns false when warp result.success is false', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'Warp error' })))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Warp error')
    })

    it('handles network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Network error')
    })

    it('handles non-Error thrown objects in catch', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue('string error')

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Warp 실행에 실패했습니다')
    })

    it('sends correct warp request body with image_paths', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      const warpBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string)
      expect(warpBody.image_paths).toEqual(['/tmp/img.png'])
      expect(warpBody.use_claude_cli).toBe(true)
      expect(warpBody.new_window).toBe(false)
    })

    it('sends null image_paths when not present in analysis', async () => {
      const dataNoImages = { ...mockAnalysisData, image_paths: null }
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoImages)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      const warpBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string)
      expect(warpBody.image_paths).toBeNull()
    })

    it('uses warp error field when detail is not present', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Custom error' }), { status: 500 }))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toBe('Custom error')
    })

    it('falls back to warp statusText when no detail or error in response', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 502, statusText: 'Bad Gateway' }))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')

      expect(result).toBe(false)
      expect(useAgentsStore.getState().executionError).toContain('502')
    })

    it('uses default error when warp result success is false without error field', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockAnalysisData)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: false })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoGroups)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataSingleGroup)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataEdgeCases)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataMissing)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoExecPlan)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('handles analysis with null analysis field', async () => {
      const dataNoAnalysis = {
        ...mockAnalysisData,
        analysis: null,
      }
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoAnalysis)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

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
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoDepsProp)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)
    })

    it('uses fallback title when task_input is null', async () => {
      const dataNoTaskInput = {
        ...mockAnalysisData,
        task_input: null,
      }
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(dataNoTaskInput)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      const result = await useAgentsStore.getState().executeWithWarp('a-1', 'proj-1')
      expect(result).toBe(true)

      const warpBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string)
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
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockHistoryData))
      )

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
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockHistoryData))
      )

      await useAgentsStore.getState().fetchAnalysisHistory('proj-1')

      // The fetch still returns its data but the key is that no reset happened before the fetch
      expect(useAgentsStore.getState().historyProjectFilter).toBe('proj-1')
    })

    it('handles HTTP error response', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

      await useAgentsStore.getState().fetchAnalysisHistory()

      expect(useAgentsStore.getState().historyLoading).toBe(false)
    })

    it('sets historyProjectFilter to null when projectId is undefined', async () => {
      useAgentsStore.setState({ historyProjectFilter: 'some-proj' })
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockHistoryData))
      )

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
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 1, has_more: false }))
      )

      await useAgentsStore.getState().loadMoreHistory()

      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('project_id=proj-filter'))
    })

    it('sets correct offset based on existing history length', async () => {
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [{ id: 'h1' } as unknown as TaskAnalysisHistory, { id: 'h2' } as unknown as TaskAnalysisHistory, { id: 'h3' } as unknown as TaskAnalysisHistory],
        historyProjectFilter: null,
      })
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 3, has_more: false }))
      )

      await useAgentsStore.getState().loadMoreHistory()

      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('offset=3'))
    })

    it('handles HTTP error response gracefully', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      useAgentsStore.setState({
        historyHasMore: true,
        historyLoading: false,
        analysisHistory: [],
        historyProjectFilter: null,
      })
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

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
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'))

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
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

      await useAgentsStore.getState().deleteAnalysis('h1')

      expect(useAgentsStore.getState().selectedHistoryId).toBe('h2')
      expect(useAgentsStore.getState().lastAnalysis).toMatchObject({ success: true })
    })

    it('handles HTTP error response', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, { status: 500, statusText: 'Server Error' })
      )

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
