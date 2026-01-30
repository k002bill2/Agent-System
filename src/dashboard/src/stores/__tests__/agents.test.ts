import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAgentsStore, Agent, AgentRegistryStats } from '../agents'

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
})
