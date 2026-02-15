/**
 * Agent Store (슬라이스 패턴)
 *
 * 에이전트 레지스트리 관련 상태를 관리하는 도메인 스토어.
 * 기존 agents.ts에서 분리된 슬라이스 래퍼.
 */

import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentCategory = 'development' | 'orchestration' | 'quality' | 'research'
export type AgentStatus = 'available' | 'busy' | 'unavailable' | 'error'

export interface AgentCapability {
  name: string
  description: string
  keywords: string[]
  priority: number
}

export interface AgentInfo {
  id: string
  name: string
  description: string
  category: AgentCategory
  status: AgentStatus
  capabilities: AgentCapability[]
  specializations: string[]
  estimated_cost_per_task: number
  avg_execution_time_ms: number
  total_tasks_completed: number
  success_rate: number
  is_available: boolean
}

export interface AgentRegistryStats {
  total_agents: number
  available_agents: number
  busy_agents: number
  by_category: Record<string, number>
  total_tasks_completed: number
  avg_success_rate: number
}

interface AgentState {
  // State
  agents: AgentInfo[]
  selectedAgentId: string | null
  stats: AgentRegistryStats | null
  isLoading: boolean
  error: string | null

  // Actions
  setAgents: (agents: AgentInfo[]) => void
  addAgent: (agent: AgentInfo) => void
  updateAgent: (id: string, updates: Partial<AgentInfo>) => void
  removeAgent: (id: string) => void
  selectAgent: (id: string | null) => void
  setStats: (stats: AgentRegistryStats) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────

const initialState = {
  agents: [],
  selectedAgentId: null,
  stats: null,
  isLoading: false,
  error: null,
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

/** 에이전트 레지스트리 상태 관리 스토어 (슬라이스 래퍼). */
export const useAgentStore = create<AgentState>()((set) => ({
  ...initialState,

  setAgents: (agents) => set({ agents, error: null }),

  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent],
    })),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
    })),

  selectAgent: (id) => set({ selectedAgentId: id }),

  setStats: (stats) => set({ stats }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () => set({ ...initialState }),
}))

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

/** 사용 가능한 에이전트만 필터링하는 셀렉터. */
export const selectAvailableAgents = (state: AgentState): AgentInfo[] =>
  state.agents.filter((a) => a.is_available)

/** ID로 에이전트를 조회하는 셀렉터. */
export const selectAgentById = (state: AgentState, id: string): AgentInfo | undefined =>
  state.agents.find((a) => a.id === id)

/** 카테고리별 에이전트를 필터링하는 셀렉터. */
export const selectAgentsByCategory = (state: AgentState, category: AgentCategory): AgentInfo[] =>
  state.agents.filter((a) => a.category === category)

/** 현재 선택된 에이전트를 반환하는 셀렉터. */
export const selectSelectedAgent = (state: AgentState): AgentInfo | undefined =>
  state.selectedAgentId ? state.agents.find((a) => a.id === state.selectedAgentId) : undefined

/** 전체 에이전트 수를 반환하는 셀렉터. */
export const selectAgentCount = (state: AgentState): number => state.agents.length
