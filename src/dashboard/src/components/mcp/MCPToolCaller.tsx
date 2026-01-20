/**
 * MCP Tool Caller Component
 *
 * MCP 도구를 호출하고 결과를 표시하는 인터페이스
 */

import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { MCPServer, useMCPStore } from '../../stores/mcp'
import { Wrench, Play, Clock, CheckCircle, AlertCircle, ChevronDown, X } from 'lucide-react'

interface MCPToolCallerProps {
  servers: MCPServer[]
}

export function MCPToolCaller({ servers }: MCPToolCallerProps) {
  const { lastToolResult, isCallingTool, callTool, clearToolResult } = useMCPStore()

  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [selectedToolName, setSelectedToolName] = useState<string>('')
  const [argsInput, setArgsInput] = useState<string>('{}')
  const [argsError, setArgsError] = useState<string | null>(null)

  // 실행 중인 서버만 필터링
  const runningServers = useMemo(() => servers.filter((s) => s.status === 'running'), [servers])

  // 선택된 서버
  const selectedServer = useMemo(
    () => runningServers.find((s) => s.id === selectedServerId),
    [runningServers, selectedServerId]
  )

  // 선택된 서버의 도구 목록
  const availableTools = useMemo(() => {
    const tools = selectedServer?.tools
    return Array.isArray(tools) ? tools : []
  }, [selectedServer])

  // 선택된 도구
  const selectedTool = useMemo(
    () => availableTools.find((t) => t.name === selectedToolName),
    [availableTools, selectedToolName]
  )

  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId)
    setSelectedToolName('')
    setArgsInput('{}')
    setArgsError(null)
    clearToolResult()
  }

  const handleToolChange = (toolName: string) => {
    setSelectedToolName(toolName)
    setArgsInput('{}')
    setArgsError(null)
    clearToolResult()
  }

  const handleArgsChange = (value: string) => {
    setArgsInput(value)
    setArgsError(null)
  }

  const validateAndParseArgs = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(argsInput)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setArgsError('Arguments must be a JSON object')
        return null
      }
      return parsed
    } catch {
      setArgsError('Invalid JSON format')
      return null
    }
  }

  const handleCallTool = async () => {
    if (!selectedServerId || !selectedToolName) return

    const args = validateAndParseArgs()
    if (args === null) return

    await callTool(selectedServerId, selectedToolName, args)
  }

  const formatResult = (result: unknown): string => {
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Wrench className="w-5 h-5 text-blue-500" />
        Tool Caller
      </h3>

      {runningServers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No running servers</p>
            <p className="text-xs mt-1">Start a server to call its tools</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Server Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Server
            </label>
            <div className="relative">
              <select
                value={selectedServerId}
                onChange={(e) => handleServerChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a server...</option>
                {runningServers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.tools?.length || 0} tools)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Tool Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tool
            </label>
            <div className="relative">
              <select
                value={selectedToolName}
                onChange={(e) => handleToolChange(e.target.value)}
                disabled={!selectedServerId || availableTools.length === 0}
                className={cn(
                  'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500',
                  (!selectedServerId || availableTools.length === 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <option value="">Select a tool...</option>
                {availableTools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {selectedTool && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{selectedTool.description}</p>
            )}
          </div>

          {/* Arguments Input */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Arguments (JSON)
            </label>
            <textarea
              value={argsInput}
              onChange={(e) => handleArgsChange(e.target.value)}
              placeholder='{"key": "value"}'
              className={cn(
                'flex-1 min-h-[80px] px-3 py-2 bg-gray-50 dark:bg-gray-900 border rounded-lg text-sm font-mono text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500',
                argsError ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
              )}
            />
            {argsError && <p className="mt-1 text-xs text-red-500">{argsError}</p>}
          </div>

          {/* Call Button */}
          <button
            onClick={handleCallTool}
            disabled={!selectedServerId || !selectedToolName || isCallingTool}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
              selectedServerId && selectedToolName && !isCallingTool
                ? 'bg-primary-500 hover:bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            )}
          >
            {isCallingTool ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                Calling...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Call Tool
              </>
            )}
          </button>

          {/* Result Display */}
          {lastToolResult && (
            <div
              className={cn(
                'rounded-lg border p-3',
                lastToolResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {lastToolResult.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      lastToolResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {lastToolResult.success ? 'Success' : 'Error'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({lastToolResult.execution_time_ms}ms)
                  </span>
                </div>
                <button
                  onClick={clearToolResult}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="bg-gray-900 rounded p-2 max-h-40 overflow-auto">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                  {lastToolResult.success
                    ? formatResult(lastToolResult.result)
                    : lastToolResult.error || 'Unknown error'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
