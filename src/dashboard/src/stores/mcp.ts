/**
 * MCP Manager Store
 *
 * MCP 서버 및 도구 상태 관리
 */

import { create } from 'zustand'

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

interface MCPState {
  // Data
  servers: MCPServer[]
  stats: MCPManagerStats | null
  lastToolResult: MCPToolCallResult | null

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
}

const API_BASE = 'http://localhost:8000/api'

export const useMCPStore = create<MCPState>((set, get) => ({
  // Initial state
  servers: [],
  stats: null,
  lastToolResult: null,
  isLoading: false,
  error: null,
  selectedServerId: null,
  statusFilter: null,
  isCallingTool: false,

  // Actions
  fetchServers: async () => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/agents/mcp/servers`)

      if (!response.ok) {
        throw new Error(`Failed to fetch MCP servers: ${response.statusText}`)
      }

      const servers: MCPServer[] = await response.json()
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
      const response = await fetch(`${API_BASE}/agents/mcp/stats`)

      if (!response.ok) {
        throw new Error(`Failed to fetch MCP stats: ${response.statusText}`)
      }

      const stats: MCPManagerStats = await response.json()
      set({ stats })
    } catch (error) {
      console.error('Failed to fetch MCP stats:', error)
    }
  },

  fetchServerTools: async (serverId: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/mcp/servers/${serverId}/tools`)

      if (!response.ok) {
        throw new Error(`Failed to fetch server tools: ${response.statusText}`)
      }

      const tools: MCPToolSchema[] = await response.json()

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
      const response = await fetch(`${API_BASE}/agents/mcp/servers/${serverId}/start`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to start server: ${response.statusText}`)
      }

      const result = await response.json()

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
      const response = await fetch(`${API_BASE}/agents/mcp/servers/${serverId}/stop`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to stop server: ${response.statusText}`)
      }

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
      const response = await fetch(`${API_BASE}/agents/mcp/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          tool_name: toolName,
          arguments: args,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to call tool: ${response.statusText}`)
      }

      const result = await response.json()
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
}))
