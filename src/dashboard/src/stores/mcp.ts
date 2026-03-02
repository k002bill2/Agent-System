/**
 * MCP Manager Store
 *
 * MCP 서버 및 도구 상태 관리
 */

import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

// Types
export type MCPServerType = 'filesystem' | 'github' | 'playwright' | 'sqlite' | 'custom'
export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error'


export interface MCPToolSchema {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface MCPServer {
  id: string
  name: string
  type: MCPServerType
  description: string
  status: MCPServerStatus
  tool_count: number
  tools: MCPToolSchema[]
  pid?: number
  started_at?: string
  last_error?: string
}

export interface MCPManagerStats {
  total_servers: number
  running_servers: number
  total_tools: number
  servers_by_type: Record<string, number>
}

export interface MCPToolCallResult {
  success: boolean
  result?: unknown
  error?: string
  execution_time_ms: number
}

// 배치 호출을 위한 타입
export interface MCPToolSelection {
  serverId: string
  serverName: string
  toolName: string
  toolDescription: string
  arguments: Record<string, unknown>
}

export interface MCPBatchToolCallResult {
  results: Array<{
    success: boolean
    content?: unknown[]
    error?: string
    execution_time_ms: number
  }>
  total_execution_time_ms: number
  success_count: number
  failure_count: number
}

interface MCPState {
  // Data
  servers: MCPServer[]
  stats: MCPManagerStats | null
  lastToolResult: MCPToolCallResult | null

  // Batch call state
  selectedTools: MCPToolSelection[]
  lastBatchResult: MCPBatchToolCallResult | null
  isCallingBatch: boolean

  // UI State
  isLoading: boolean
  error: string | null
  selectedServerId: string | null
  statusFilter: MCPServerStatus | null
  isCallingTool: boolean

  // Actions
  fetchServers: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchServerTools: (serverId: string) => Promise<MCPToolSchema[]>
  startServer: (serverId: string) => Promise<boolean>
  stopServer: (serverId: string) => Promise<boolean>
  restartServer: (serverId: string) => Promise<boolean>
  callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<MCPToolCallResult | null>
  setSelectedServer: (serverId: string | null) => void
  setStatusFilter: (status: MCPServerStatus | null) => void
  clearError: () => void
  clearToolResult: () => void

  // Batch call actions
  addToolToSelection: (selection: MCPToolSelection) => void
  removeToolFromSelection: (serverId: string, toolName: string) => void
  updateToolArguments: (serverId: string, toolName: string, args: Record<string, unknown>) => void
  clearSelectedTools: () => void
  callToolsBatch: (maxConcurrent?: number) => Promise<MCPBatchToolCallResult | null>
  clearBatchResult: () => void
}

export const useMCPStore = create<MCPState>((set, get) => ({
  // Initial state
  servers: [],
  stats: null,
  lastToolResult: null,

  // Batch call initial state
  selectedTools: [],
  lastBatchResult: null,
  isCallingBatch: false,

  isLoading: false,
  error: null,
  selectedServerId: null,
  statusFilter: null,
  isCallingTool: false,

  // Actions
  fetchServers: async () => {
    set({ isLoading: true, error: null })

    try {
      const servers = await apiClient.get<MCPServer[]>('/api/agents/mcp/servers')
      set({ servers, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch MCP servers',
        isLoading: false,
      })
    }
  },

  fetchStats: async () => {
    try {
      const stats = await apiClient.get<MCPManagerStats>('/api/agents/mcp/stats')
      set({ stats })
    } catch (error) {
      console.error('Failed to fetch MCP stats:', error)
    }
  },

  fetchServerTools: async (serverId: string) => {
    try {
      const tools = await apiClient.get<MCPToolSchema[]>(`/api/agents/mcp/servers/${serverId}/tools`)

      // 해당 서버의 tools 업데이트
      const servers = get().servers.map((server) =>
        server.id === serverId ? { ...server, tools } : server
      )
      set({ servers })

      return tools
    } catch (error) {
      console.error('Failed to fetch server tools:', error)
      return []
    }
  },

  startServer: async (serverId: string) => {
    // 서버 상태를 starting으로 업데이트
    const servers = get().servers.map((server) =>
      server.id === serverId ? { ...server, status: 'starting' as MCPServerStatus } : server
    )
    set({ servers })

    try {
      const result = await apiClient.post<{ success?: boolean }>(`/api/agents/mcp/servers/${serverId}/start`)

      // 서버 목록 새로고침
      await get().fetchServers()
      await get().fetchStats()

      return result.success ?? true
    } catch (error) {
      // 에러 시 stopped로 복구
      const servers = get().servers.map((server) =>
        server.id === serverId
          ? { ...server, status: 'error' as MCPServerStatus, last_error: error instanceof Error ? error.message : 'Unknown error' }
          : server
      )
      set({ servers, error: error instanceof Error ? error.message : 'Failed to start server' })
      return false
    }
  },

  stopServer: async (serverId: string) => {
    try {
      await apiClient.post(`/api/agents/mcp/servers/${serverId}/stop`)

      // 서버 목록 새로고침
      await get().fetchServers()
      await get().fetchStats()

      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to stop server' })
      return false
    }
  },

  restartServer: async (serverId: string) => {
    await get().stopServer(serverId)
    // 잠시 대기 후 시작
    await new Promise((resolve) => setTimeout(resolve, 500))
    return get().startServer(serverId)
  },

  callTool: async (serverId: string, toolName: string, args: Record<string, unknown>) => {
    set({ isCallingTool: true, error: null, lastToolResult: null })

    const startTime = Date.now()

    try {
      const result = await apiClient.post<{ success?: boolean; result?: unknown; error?: string }>('/api/agents/mcp/tools/call', {
        server_id: serverId,
        tool_name: toolName,
        arguments: args,
      })
      const executionTime = Date.now() - startTime

      const toolResult: MCPToolCallResult = {
        success: result.success ?? true,
        result: result.result,
        error: result.error,
        execution_time_ms: executionTime,
      }

      set({ lastToolResult: toolResult, isCallingTool: false })
      return toolResult
    } catch (error) {
      const executionTime = Date.now() - startTime
      const toolResult: MCPToolCallResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call tool',
        execution_time_ms: executionTime,
      }

      set({ lastToolResult: toolResult, isCallingTool: false })
      return toolResult
    }
  },

  setSelectedServer: (serverId: string | null) => {
    set({ selectedServerId: serverId })
  },

  setStatusFilter: (status: MCPServerStatus | null) => {
    set({ statusFilter: status })
  },

  clearError: () => {
    set({ error: null })
  },

  clearToolResult: () => {
    set({ lastToolResult: null })
  },

  // Batch call actions
  addToolToSelection: (selection: MCPToolSelection) => {
    const { selectedTools } = get()

    // 중복 방지: 같은 서버+도구 조합이 이미 있으면 추가하지 않음
    const exists = selectedTools.some(
      (t) => t.serverId === selection.serverId && t.toolName === selection.toolName
    )

    if (!exists) {
      set({ selectedTools: [...selectedTools, selection] })
    }
  },

  removeToolFromSelection: (serverId: string, toolName: string) => {
    const { selectedTools } = get()
    set({
      selectedTools: selectedTools.filter(
        (t) => !(t.serverId === serverId && t.toolName === toolName)
      ),
    })
  },

  updateToolArguments: (serverId: string, toolName: string, args: Record<string, unknown>) => {
    const { selectedTools } = get()
    set({
      selectedTools: selectedTools.map((t) =>
        t.serverId === serverId && t.toolName === toolName ? { ...t, arguments: args } : t
      ),
    })
  },

  clearSelectedTools: () => {
    set({ selectedTools: [] })
  },

  callToolsBatch: async (maxConcurrent = 3) => {
    const { selectedTools } = get()

    if (selectedTools.length === 0) return null

    set({ isCallingBatch: true, error: null, lastBatchResult: null })

    try {
      const result = await apiClient.post<MCPBatchToolCallResult>('/api/agents/mcp/tools/batch-call', {
        calls: selectedTools.map((t) => ({
          server_id: t.serverId,
          tool_name: t.toolName,
          arguments: t.arguments,
        })),
        max_concurrent: maxConcurrent,
      })
      set({ lastBatchResult: result, isCallingBatch: false })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to call tools batch'
      set({ error: errorMessage, isCallingBatch: false })
      return null
    }
  },

  clearBatchResult: () => {
    set({ lastBatchResult: null })
  },
}))
