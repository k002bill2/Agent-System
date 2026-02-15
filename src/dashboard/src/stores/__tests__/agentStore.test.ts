import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useAgentStore,
  AgentInfo,
  AgentRegistryStats,
  selectAvailableAgents,
  selectAgentById,
  selectAgentsByCategory,
  selectSelectedAgent,
  selectAgentCount,
} from '../agentStore'

const mockAgent1: AgentInfo = {
  id: 'agent-1',
  name: 'React Developer',
  description: 'Frontend specialist',
  category: 'development',
  status: 'available',
  capabilities: [
    { name: 'React', description: 'React development', keywords: ['react', 'component'], priority: 1 },
  ],
  specializations: ['React', 'TypeScript'],
  estimated_cost_per_task: 0.01,
  avg_execution_time_ms: 1000,
  total_tasks_completed: 50,
  success_rate: 0.95,
  is_available: true,
}

const mockAgent2: AgentInfo = {
  id: 'agent-2',
  name: 'Backend Developer',
  description: 'Backend specialist',
  category: 'development',
  status: 'busy',
  capabilities: [
    { name: 'API', description: 'API development', keywords: ['api', 'backend'], priority: 1 },
  ],
  specializations: ['Python', 'FastAPI'],
  estimated_cost_per_task: 0.02,
  avg_execution_time_ms: 2000,
  total_tasks_completed: 30,
  success_rate: 0.92,
  is_available: false,
}

const mockAgent3: AgentInfo = {
  id: 'agent-3',
  name: 'Quality Validator',
  description: 'Testing specialist',
  category: 'quality',
  status: 'available',
  capabilities: [
    { name: 'Testing', description: 'Test automation', keywords: ['test', 'quality'], priority: 1 },
  ],
  specializations: ['Vitest', 'E2E'],
  estimated_cost_per_task: 0.015,
  avg_execution_time_ms: 1500,
  total_tasks_completed: 40,
  success_rate: 0.98,
  is_available: true,
}

const mockStats: AgentRegistryStats = {
  total_agents: 10,
  available_agents: 6,
  busy_agents: 4,
  by_category: { development: 5, orchestration: 2, quality: 2, research: 1 },
  total_tasks_completed: 250,
  avg_success_rate: 0.94,
}

describe('agentStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAgentStore.setState({
      agents: [],
      selectedAgentId: null,
      stats: null,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('has empty agents array', () => {
      expect(useAgentStore.getState().agents).toEqual([])
    })

    it('has null selectedAgentId', () => {
      expect(useAgentStore.getState().selectedAgentId).toBeNull()
    })

    it('has null stats', () => {
      expect(useAgentStore.getState().stats).toBeNull()
    })

    it('has isLoading set to false', () => {
      expect(useAgentStore.getState().isLoading).toBe(false)
    })

    it('has null error', () => {
      expect(useAgentStore.getState().error).toBeNull()
    })
  })

  describe('setAgents', () => {
    it('sets agents array', () => {
      const { setAgents } = useAgentStore.getState()

      setAgents([mockAgent1, mockAgent2])

      expect(useAgentStore.getState().agents).toHaveLength(2)
      expect(useAgentStore.getState().agents[0].id).toBe('agent-1')
      expect(useAgentStore.getState().agents[1].id).toBe('agent-2')
    })

    it('clears error when setting agents', () => {
      useAgentStore.setState({ error: 'Previous error' })

      const { setAgents } = useAgentStore.getState()
      setAgents([mockAgent1])

      expect(useAgentStore.getState().error).toBeNull()
    })

    it('replaces existing agents', () => {
      useAgentStore.setState({ agents: [mockAgent1] })

      const { setAgents } = useAgentStore.getState()
      setAgents([mockAgent2, mockAgent3])

      expect(useAgentStore.getState().agents).toHaveLength(2)
      expect(useAgentStore.getState().agents[0].id).toBe('agent-2')
      expect(useAgentStore.getState().agents[1].id).toBe('agent-3')
    })

    it('accepts empty array', () => {
      useAgentStore.setState({ agents: [mockAgent1] })

      const { setAgents } = useAgentStore.getState()
      setAgents([])

      expect(useAgentStore.getState().agents).toEqual([])
    })
  })

  describe('addAgent', () => {
    it('appends agent to empty array', () => {
      const { addAgent } = useAgentStore.getState()

      addAgent(mockAgent1)

      expect(useAgentStore.getState().agents).toHaveLength(1)
      expect(useAgentStore.getState().agents[0].id).toBe('agent-1')
    })

    it('appends agent to existing array', () => {
      useAgentStore.setState({ agents: [mockAgent1] })

      const { addAgent } = useAgentStore.getState()
      addAgent(mockAgent2)

      expect(useAgentStore.getState().agents).toHaveLength(2)
      expect(useAgentStore.getState().agents[1].id).toBe('agent-2')
    })

    it('preserves existing agents', () => {
      useAgentStore.setState({ agents: [mockAgent1] })

      const { addAgent } = useAgentStore.getState()
      addAgent(mockAgent2)

      expect(useAgentStore.getState().agents[0]).toEqual(mockAgent1)
    })
  })

  describe('updateAgent', () => {
    beforeEach(() => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })
    })

    it('updates matching agent by id', () => {
      const { updateAgent } = useAgentStore.getState()

      updateAgent('agent-2', { name: 'Updated Backend Dev', success_rate: 0.99 })

      const updated = useAgentStore.getState().agents.find((a) => a.id === 'agent-2')
      expect(updated?.name).toBe('Updated Backend Dev')
      expect(updated?.success_rate).toBe(0.99)
    })

    it('leaves other agents unchanged', () => {
      const { updateAgent } = useAgentStore.getState()

      updateAgent('agent-2', { name: 'Changed' })

      const agent1 = useAgentStore.getState().agents.find((a) => a.id === 'agent-1')
      const agent3 = useAgentStore.getState().agents.find((a) => a.id === 'agent-3')
      expect(agent1).toEqual(mockAgent1)
      expect(agent3).toEqual(mockAgent3)
    })

    it('does nothing if agent not found', () => {
      const { updateAgent } = useAgentStore.getState()

      updateAgent('nonexistent', { name: 'Ghost' })

      expect(useAgentStore.getState().agents).toHaveLength(3)
      expect(useAgentStore.getState().agents.find((a) => a.id === 'nonexistent')).toBeUndefined()
    })

    it('partially updates agent properties', () => {
      const { updateAgent } = useAgentStore.getState()

      updateAgent('agent-1', { status: 'busy', is_available: false })

      const updated = useAgentStore.getState().agents.find((a) => a.id === 'agent-1')
      expect(updated?.status).toBe('busy')
      expect(updated?.is_available).toBe(false)
      expect(updated?.name).toBe('React Developer') // other fields unchanged
    })
  })

  describe('removeAgent', () => {
    beforeEach(() => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })
    })

    it('removes agent by id', () => {
      const { removeAgent } = useAgentStore.getState()

      removeAgent('agent-2')

      expect(useAgentStore.getState().agents).toHaveLength(2)
      expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-2')).toBeUndefined()
    })

    it('preserves other agents', () => {
      const { removeAgent } = useAgentStore.getState()

      removeAgent('agent-2')

      expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-1')).toEqual(mockAgent1)
      expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-3')).toEqual(mockAgent3)
    })

    it('clears selectedAgentId if removed agent was selected', () => {
      useAgentStore.setState({ selectedAgentId: 'agent-2' })

      const { removeAgent } = useAgentStore.getState()
      removeAgent('agent-2')

      expect(useAgentStore.getState().selectedAgentId).toBeNull()
    })

    it('preserves selectedAgentId if different agent was removed', () => {
      useAgentStore.setState({ selectedAgentId: 'agent-1' })

      const { removeAgent } = useAgentStore.getState()
      removeAgent('agent-2')

      expect(useAgentStore.getState().selectedAgentId).toBe('agent-1')
    })

    it('does nothing if agent not found', () => {
      const { removeAgent } = useAgentStore.getState()

      removeAgent('nonexistent')

      expect(useAgentStore.getState().agents).toHaveLength(3)
    })
  })

  describe('selectAgent', () => {
    it('sets selectedAgentId with string', () => {
      const { selectAgent } = useAgentStore.getState()

      selectAgent('agent-1')

      expect(useAgentStore.getState().selectedAgentId).toBe('agent-1')
    })

    it('clears selectedAgentId with null', () => {
      useAgentStore.setState({ selectedAgentId: 'agent-1' })

      const { selectAgent } = useAgentStore.getState()
      selectAgent(null)

      expect(useAgentStore.getState().selectedAgentId).toBeNull()
    })

    it('changes selectedAgentId', () => {
      useAgentStore.setState({ selectedAgentId: 'agent-1' })

      const { selectAgent } = useAgentStore.getState()
      selectAgent('agent-2')

      expect(useAgentStore.getState().selectedAgentId).toBe('agent-2')
    })
  })

  describe('setStats', () => {
    it('sets stats', () => {
      const { setStats } = useAgentStore.getState()

      setStats(mockStats)

      expect(useAgentStore.getState().stats).toEqual(mockStats)
    })

    it('replaces existing stats', () => {
      useAgentStore.setState({ stats: mockStats })

      const newStats: AgentRegistryStats = {
        ...mockStats,
        total_agents: 20,
        available_agents: 15,
      }

      const { setStats } = useAgentStore.getState()
      setStats(newStats)

      expect(useAgentStore.getState().stats?.total_agents).toBe(20)
      expect(useAgentStore.getState().stats?.available_agents).toBe(15)
    })
  })

  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      const { setLoading } = useAgentStore.getState()

      setLoading(true)

      expect(useAgentStore.getState().isLoading).toBe(true)
    })

    it('sets isLoading to false', () => {
      useAgentStore.setState({ isLoading: true })

      const { setLoading } = useAgentStore.getState()
      setLoading(false)

      expect(useAgentStore.getState().isLoading).toBe(false)
    })
  })

  describe('setError', () => {
    it('sets error message', () => {
      const { setError } = useAgentStore.getState()

      setError('Something went wrong')

      expect(useAgentStore.getState().error).toBe('Something went wrong')
    })

    it('sets isLoading to false when setting error', () => {
      useAgentStore.setState({ isLoading: true })

      const { setError } = useAgentStore.getState()
      setError('Error occurred')

      expect(useAgentStore.getState().isLoading).toBe(false)
      expect(useAgentStore.getState().error).toBe('Error occurred')
    })

    it('clears error with null', () => {
      useAgentStore.setState({ error: 'Previous error' })

      const { setError } = useAgentStore.getState()
      setError(null)

      expect(useAgentStore.getState().error).toBeNull()
    })
  })

  describe('reset', () => {
    it('restores initial state', () => {
      useAgentStore.setState({
        agents: [mockAgent1, mockAgent2],
        selectedAgentId: 'agent-1',
        stats: mockStats,
        isLoading: true,
        error: 'Some error',
      })

      const { reset } = useAgentStore.getState()
      reset()

      const state = useAgentStore.getState()
      expect(state.agents).toEqual([])
      expect(state.selectedAgentId).toBeNull()
      expect(state.stats).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('selectAvailableAgents', () => {
    it('returns only available agents', () => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })

      const available = selectAvailableAgents(useAgentStore.getState())

      expect(available).toHaveLength(2)
      expect(available.map((a) => a.id)).toEqual(['agent-1', 'agent-3'])
    })

    it('returns empty array when no agents available', () => {
      useAgentStore.setState({ agents: [mockAgent2] })

      const available = selectAvailableAgents(useAgentStore.getState())

      expect(available).toEqual([])
    })

    it('returns empty array when agents is empty', () => {
      const available = selectAvailableAgents(useAgentStore.getState())

      expect(available).toEqual([])
    })
  })

  describe('selectAgentById', () => {
    beforeEach(() => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })
    })

    it('returns agent matching id', () => {
      const agent = selectAgentById(useAgentStore.getState(), 'agent-2')

      expect(agent).toEqual(mockAgent2)
    })

    it('returns undefined when id not found', () => {
      const agent = selectAgentById(useAgentStore.getState(), 'nonexistent')

      expect(agent).toBeUndefined()
    })

    it('returns undefined when agents is empty', () => {
      useAgentStore.setState({ agents: [] })

      const agent = selectAgentById(useAgentStore.getState(), 'agent-1')

      expect(agent).toBeUndefined()
    })
  })

  describe('selectAgentsByCategory', () => {
    beforeEach(() => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })
    })

    it('returns agents in development category', () => {
      const devAgents = selectAgentsByCategory(useAgentStore.getState(), 'development')

      expect(devAgents).toHaveLength(2)
      expect(devAgents.map((a) => a.id)).toEqual(['agent-1', 'agent-2'])
    })

    it('returns agents in quality category', () => {
      const qualityAgents = selectAgentsByCategory(useAgentStore.getState(), 'quality')

      expect(qualityAgents).toHaveLength(1)
      expect(qualityAgents[0].id).toBe('agent-3')
    })

    it('returns empty array for category with no agents', () => {
      const researchAgents = selectAgentsByCategory(useAgentStore.getState(), 'research')

      expect(researchAgents).toEqual([])
    })

    it('returns empty array when agents is empty', () => {
      useAgentStore.setState({ agents: [] })

      const devAgents = selectAgentsByCategory(useAgentStore.getState(), 'development')

      expect(devAgents).toEqual([])
    })
  })

  describe('selectSelectedAgent', () => {
    beforeEach(() => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })
    })

    it('returns selected agent when selectedAgentId is set', () => {
      useAgentStore.setState({ selectedAgentId: 'agent-2' })

      const selected = selectSelectedAgent(useAgentStore.getState())

      expect(selected).toEqual(mockAgent2)
    })

    it('returns undefined when selectedAgentId is null', () => {
      const selected = selectSelectedAgent(useAgentStore.getState())

      expect(selected).toBeUndefined()
    })

    it('returns undefined when selectedAgentId does not match any agent', () => {
      useAgentStore.setState({ selectedAgentId: 'nonexistent' })

      const selected = selectSelectedAgent(useAgentStore.getState())

      expect(selected).toBeUndefined()
    })

    it('returns undefined when agents is empty', () => {
      useAgentStore.setState({ agents: [], selectedAgentId: 'agent-1' })

      const selected = selectSelectedAgent(useAgentStore.getState())

      expect(selected).toBeUndefined()
    })
  })

  describe('selectAgentCount', () => {
    it('returns 0 for empty agents array', () => {
      const count = selectAgentCount(useAgentStore.getState())

      expect(count).toBe(0)
    })

    it('returns correct count for agents array', () => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2, mockAgent3] })

      const count = selectAgentCount(useAgentStore.getState())

      expect(count).toBe(3)
    })

    it('updates count after adding agent', () => {
      useAgentStore.setState({ agents: [mockAgent1] })

      const { addAgent } = useAgentStore.getState()
      addAgent(mockAgent2)

      const count = selectAgentCount(useAgentStore.getState())
      expect(count).toBe(2)
    })

    it('updates count after removing agent', () => {
      useAgentStore.setState({ agents: [mockAgent1, mockAgent2] })

      const { removeAgent } = useAgentStore.getState()
      removeAgent('agent-1')

      const count = selectAgentCount(useAgentStore.getState())
      expect(count).toBe(1)
    })
  })
})
