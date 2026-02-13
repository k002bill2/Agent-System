/**
 * Agent service layer.
 *
 * All agent-related API calls go through the shared apiClient.
 * Raw `fetch` must NOT be used here.
 */

import { apiClient } from './apiClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Agent {
  id: string
  name: string
  description: string
  category: string
  status: string
  specializations: string[]
  capabilities: AgentCapability[]
  total_tasks_completed: number
  success_rate: number
  estimated_cost_per_task: number
  avg_execution_time_ms: number
  is_available: boolean
  created_at?: string
  updated_at?: string
}

export interface AgentCapability {
  name: string
  description: string
  keywords: string[]
  priority: number
}

export interface AgentQueryParams {
  category?: string
  status?: string
  page?: number
  page_size?: number
  search?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface CreateAgentInput {
  name: string
  description: string
  category: string
  specializations?: string[]
  capabilities?: Omit<AgentCapability, 'priority'>[]
}

export interface UpdateAgentInput {
  name?: string
  description?: string
  category?: string
  status?: string
  specializations?: string[]
  capabilities?: Omit<AgentCapability, 'priority'>[]
}

// ---------------------------------------------------------------------------
// Query-string builder
// ---------------------------------------------------------------------------

function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(
    (pair): pair is [string, string | number] => pair[1] !== undefined,
  )
  if (entries.length === 0) return ''
  const search = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  )
  return `?${search.toString()}`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const agentService = {
  /** List agents with optional filters and pagination. */
  getAgents(params?: AgentQueryParams): Promise<PaginatedResponse<Agent>> {
    const qs = toQueryString(params as Record<string, string | number | undefined>)
    return apiClient.get<PaginatedResponse<Agent>>(`/api/agents${qs}`)
  },

  /** Get a single agent by ID. */
  getAgent(id: string): Promise<Agent> {
    return apiClient.get<Agent>(`/api/agents/${encodeURIComponent(id)}`)
  },

  /** Create a new agent. */
  createAgent(data: CreateAgentInput): Promise<Agent> {
    return apiClient.post<Agent>('/api/agents', data)
  },

  /** Update an existing agent. */
  updateAgent(id: string, data: UpdateAgentInput): Promise<Agent> {
    return apiClient.patch<Agent>(`/api/agents/${encodeURIComponent(id)}`, data)
  },

  /** Delete an agent. */
  deleteAgent(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/agents/${encodeURIComponent(id)}`)
  },
} as const

export type AgentService = typeof agentService
