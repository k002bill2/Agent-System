import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { agentService } from '../agentService'
import { ApiError, ApiErrorCode } from '../errors'
import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentSearchResult,
  AgentRegistryStats,
} from '../agentService'

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

function mockFetchJson(data: unknown, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function mockFetchError(status: number, message: string) {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ message }), {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function _mockFetchNetworkError() {
  return vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockAgent: Agent = {
  id: 'agent-123',
  name: 'Test Agent',
  description: 'A test agent',
  category: 'development',
  status: 'available',
  specializations: ['coding', 'testing'],
  capabilities: [
    {
      name: 'code_review',
      description: 'Reviews code',
      keywords: ['review', 'code'],
      priority: 1,
    },
  ],
  total_tasks_completed: 42,
  success_rate: 0.95,
  estimated_cost_per_task: 0.05,
  avg_execution_time_ms: 1500,
  is_available: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
}

/**
 * `GET /api/agents` is declared `response_model=list[AgentResponse]`
 * (`src/backend/api/agents/core.py:99`) — a BARE ARRAY, never a pagination
 * envelope. The previous fixture here mocked `{ items, total, page, ... }` and
 * asserted the mock back, so it passed for ANY response shape. Assertions below
 * check the array shape itself, so re-wrapping the service fails right here
 * instead of surfacing as `undefined` at runtime.
 */
const mockAgentList: Agent[] = [mockAgent]

const mockSearchResult: AgentSearchResult = {
  agent: mockAgent,
  score: 0.92,
}

const mockStats: AgentRegistryStats = {
  total_agents: 10,
  available_agents: 7,
  busy_agents: 3,
  by_category: {
    development: 5,
    analysis: 3,
    automation: 2,
  },
  total_tasks_completed: 150,
  avg_success_rate: 0.88,
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('agentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  // ── getAgents ──────────────────────────────────────────────

  describe('getAgents', () => {
    it('fetches agents with no params and no query string', async () => {
      const fetchSpy = mockFetchJson(mockAgentList)

      const result = await agentService.getAgents()

      // Shape contract, asserted structurally (not by echoing the mock back).
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(mockAgent)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents')
      expect(url).not.toContain('?')
    })

    it('returns a bare array, never a pagination envelope', async () => {
      mockFetchJson(mockAgentList)

      const result = await agentService.getAgents()

      // If `getAgents` is ever re-declared as `PaginatedResponse<Agent>`, or the
      // backend starts wrapping the list, every one of these fails.
      expect(Array.isArray(result)).toBe(true)
      expect(result).not.toHaveProperty('items')
      expect(result).not.toHaveProperty('total_pages')
      expect(result.map((agent) => agent.id)).toEqual(['agent-123'])
    })

    it('fetches agents filtered by category', async () => {
      const fetchSpy = mockFetchJson(mockAgentList)

      await agentService.getAgents({ category: 'development' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents?')
      expect(url).toContain('category=development')
    })

    it('serializes the boolean available_only as a lowercase string', async () => {
      const fetchSpy = mockFetchJson(mockAgentList)

      await agentService.getAgents({ available_only: true })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      // FastAPI parses `true`/`false`. `String(v)` must not emit `True` or `1`.
      expect(url).toContain('available_only=true')
    })

    it('sends both params the backend actually accepts', async () => {
      const fetchSpy = mockFetchJson(mockAgentList)

      await agentService.getAgents({ category: 'analysis', available_only: false })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('category=analysis')
      expect(url).toContain('available_only=false')
    })

    it('skips undefined values in query string', async () => {
      const fetchSpy = mockFetchJson(mockAgentList)

      await agentService.getAgents({ category: 'development', available_only: undefined })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('category=development')
      expect(url).not.toContain('available_only')
    })
  })

  // ── getAgent ───────────────────────────────────────────────

  describe('getAgent', () => {
    it('fetches a single agent by ID', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      const result = await agentService.getAgent('agent-123')

      expect(result).toEqual(mockAgent)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent-123')
    })

    it('encodes special characters in agent ID', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      await agentService.getAgent('agent/with/slashes')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent%2Fwith%2Fslashes')
    })

    it('encodes spaces in agent ID', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      await agentService.getAgent('agent with spaces')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent%20with%20spaces')
    })
  })

  // ── createAgent ────────────────────────────────────────────

  describe('createAgent', () => {
    it('creates a new agent with POST request', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      const input: CreateAgentInput = {
        name: 'New Agent',
        description: 'A new agent',
        category: 'automation',
        specializations: ['task1', 'task2'],
        capabilities: [
          {
            name: 'automation',
            description: 'Automates tasks',
            keywords: ['auto', 'task'],
          },
        ],
      }

      const result = await agentService.createAgent(input)

      expect(result).toEqual(mockAgent)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [url, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents')
      expect(init.method).toBe('POST')
      expect(init.body).toBeDefined()
      expect(JSON.parse(init.body as string)).toEqual(input)
    })

    it('creates agent with minimal required fields', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      const input: CreateAgentInput = {
        name: 'Minimal Agent',
        description: 'Description',
        category: 'test',
      }

      await agentService.createAgent(input)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(JSON.parse(init.body as string)).toEqual(input)
    })
  })

  // ── updateAgent ────────────────────────────────────────────

  describe('updateAgent', () => {
    it('updates an agent with PATCH request', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      const update: UpdateAgentInput = {
        name: 'Updated Name',
        status: 'busy',
      }

      const result = await agentService.updateAgent('agent-123', update)

      expect(result).toEqual(mockAgent)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [url, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent-123')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual(update)
    })

    it('encodes special characters in agent ID when updating', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      await agentService.updateAgent('agent/special#id', { name: 'Updated' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent%2Fspecial%23id')
    })

    it('updates agent with all fields', async () => {
      const fetchSpy = mockFetchJson(mockAgent)

      const update: UpdateAgentInput = {
        name: 'Fully Updated',
        description: 'New description',
        category: 'new-category',
        status: 'offline',
        specializations: ['new-spec'],
        capabilities: [
          {
            name: 'new-cap',
            description: 'New capability',
            keywords: ['new'],
          },
        ],
      }

      await agentService.updateAgent('agent-123', update)

      const [, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(JSON.parse(init.body as string)).toEqual(update)
    })
  })

  // ── deleteAgent ────────────────────────────────────────────

  describe('deleteAgent', () => {
    it('deletes an agent with DELETE request', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status: 204 }))

      await agentService.deleteAgent('agent-123')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent-123')
      expect(init.method).toBe('DELETE')
    })

    it('encodes special characters in agent ID when deleting', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status: 204 }))

      await agentService.deleteAgent('agent@special')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/agent%40special')
    })
  })

  // ── searchAgents ───────────────────────────────────────────

  describe('searchAgents', () => {
    it('searches agents with default options', async () => {
      const fetchSpy = mockFetchJson([mockSearchResult])

      const result = await agentService.searchAgents('test query')

      expect(result).toEqual([mockSearchResult])
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [url, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/search')
      expect(init.method).toBe('POST')

      const body = JSON.parse(init.body as string)
      expect(body.query).toBe('test query')
      expect(body.category).toBeNull()
      expect(body.limit).toBe(10)
    })

    it('searches agents with custom category', async () => {
      const fetchSpy = mockFetchJson([mockSearchResult])

      await agentService.searchAgents('automation', { category: 'development' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])

      const body = JSON.parse(init.body as string)
      expect(body.query).toBe('automation')
      expect(body.category).toBe('development')
      expect(body.limit).toBe(10)
    })

    it('searches agents with custom limit', async () => {
      const fetchSpy = mockFetchJson([mockSearchResult])

      await agentService.searchAgents('test', { limit: 25 })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])

      const body = JSON.parse(init.body as string)
      expect(body.query).toBe('test')
      expect(body.category).toBeNull()
      expect(body.limit).toBe(25)
    })

    it('searches agents with both category and limit', async () => {
      const fetchSpy = mockFetchJson([mockSearchResult])

      await agentService.searchAgents('code review', { category: 'development', limit: 5 })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])

      const body = JSON.parse(init.body as string)
      expect(body.query).toBe('code review')
      expect(body.category).toBe('development')
      expect(body.limit).toBe(5)
    })
  })

  // ── getStats ───────────────────────────────────────────────

  describe('getStats', () => {
    it('fetches agent registry stats', async () => {
      const fetchSpy = mockFetchJson(mockStats)

      const result = await agentService.getStats()

      expect(result).toEqual(mockStats)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [url, init] = (fetchSpy.mock.calls[0] as [string, RequestInit])
      expect(url).toContain('/api/agents/stats')
      expect(init.method).toBe('GET')
    })
  })

  // ── Error Handling ─────────────────────────────────────────

  describe('error handling', () => {
    it('throws ApiError when server returns 500', async () => {
      mockFetchError(500, 'Internal Server Error')

      await expect(agentService.getAgents()).rejects.toThrow(ApiError)

      try {
        await agentService.getAgents()
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        const apiErr = err as ApiError
        expect(apiErr.code).toBe(ApiErrorCode.INTERNAL_SERVER_ERROR)
      }
    })

    it('throws ApiError when server returns 404', async () => {
      mockFetchError(404, 'Not Found')

      await expect(agentService.getAgent('nonexistent')).rejects.toThrow(ApiError)

      try {
        await agentService.getAgent('nonexistent')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        const apiErr = err as ApiError
        expect(apiErr.code).toBe(ApiErrorCode.NOT_FOUND)
      }
    })

    it('throws ApiError on network error', async () => {
      // Use non-retryable error to avoid apiClient retry delays
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'))

      await expect(agentService.getAgents()).rejects.toThrow()
    })

    it('throws ApiError when createAgent fails with 400', async () => {
      mockFetchError(400, 'Bad Request')

      const input: CreateAgentInput = {
        name: 'Bad Agent',
        description: 'Invalid data',
        category: 'test',
      }

      await expect(agentService.createAgent(input)).rejects.toThrow(ApiError)

      try {
        await agentService.createAgent(input)
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        const apiErr = err as ApiError
        expect(apiErr.code).toBe(ApiErrorCode.BAD_REQUEST)
      }
    })

    it('throws ApiError when updateAgent fails', async () => {
      mockFetchError(500, 'Update Failed')

      await expect(agentService.updateAgent('agent-123', { name: 'New' })).rejects.toThrow(
        ApiError,
      )
    })

    it('throws ApiError when deleteAgent fails', async () => {
      mockFetchError(500, 'Delete Failed')

      await expect(agentService.deleteAgent('agent-123')).rejects.toThrow(ApiError)
    })

    it('throws ApiError when searchAgents fails', async () => {
      mockFetchError(500, 'Search Failed')

      await expect(agentService.searchAgents('test')).rejects.toThrow(ApiError)
    })

    it('throws ApiError when getStats fails', async () => {
      mockFetchError(500, 'Stats Failed')

      await expect(agentService.getStats()).rejects.toThrow(ApiError)
    })
  })
})
