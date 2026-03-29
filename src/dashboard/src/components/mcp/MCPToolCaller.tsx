/**
 * MCP Tool Caller Component
 *
 * MCP 도구를 호출하고 결과를 표시하는 인터페이스
 * - 단일 도구 호출
 * - 다중 도구 선택 및 병렬 호출 (배치 모드)
 */

import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import {
  MCPServer,
  MCPToolSelection,
  useMCPStore,
} from '../../stores/mcp'
import {
  Wrench,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  X,
  Plus,
  Layers,
  Trash2,
} from 'lucide-react'

interface MCPToolCallerProps {
  servers: MCPServer[]
}

type CallerMode = 'single' | 'batch'

export function MCPToolCaller({ servers }: MCPToolCallerProps) {
  const {
    lastToolResult,
    isCallingTool,
    callTool,
    clearToolResult,
    // Batch
    selectedTools,
    lastBatchResult,
    isCallingBatch,
    addToolToSelection,
    removeToolFromSelection,
    updateToolArguments,
    clearSelectedTools,
    callToolsBatch,
    clearBatchResult,
  } = useMCPStore()

  const [mode, setMode] = useState<CallerMode>('single')
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [selectedToolName, setSelectedToolName] = useState<string>('')
  const [argsInput, setArgsInput] = useState<string>('{}')
  const [argsError, setArgsError] = useState<string | null>(null)
  const [maxConcurrent, setMaxConcurrent] = useState<number>(3)

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

  // 배치 모드: 도구 추가
  const handleAddTool = () => {
    if (!selectedServerId || !selectedToolName) return

    const args = validateAndParseArgs()
    if (args === null) return

    addToolToSelection({
      serverId: selectedServerId,
      serverName: selectedServer?.name || selectedServerId,
      toolName: selectedToolName,
      toolDescription: selectedTool?.description || '',
      arguments: args,
    })

    // 초기화
    setSelectedToolName('')
    setArgsInput('{}')
    setArgsError(null)
  }

  // 배치 모드: 도구 실행
  const handleCallBatch = async () => {
    if (selectedTools.length === 0) return
    await callToolsBatch(maxConcurrent)
  }

  // 모드 전환 시 결과 초기화
  const handleModeChange = (newMode: CallerMode) => {
    setMode(newMode)
    clearToolResult()
    clearBatchResult()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Wrench className="w-5 h-5 text-blue-500" />
          Tool Caller
        </h3>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            onClick={() => handleModeChange('single')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              mode === 'single'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            )}
          >
            Single
          </button>
          <button
            onClick={() => handleModeChange('batch')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1',
              mode === 'batch'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            )}
          >
            <Layers className="w-3 h-3" />
            Batch
          </button>
        </div>
      </div>

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
                'flex-1 min-h-[80px] px-3 py-2 bg-gray-50 dark:bg-gray-900 border rounded-lg font-mono text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500',
                argsError ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
              )}
            />
            {argsError && <p className="mt-1 text-xs text-red-500">{argsError}</p>}
          </div>

          {/* Action Buttons */}
          {mode === 'single' ? (
            // Single Mode: Call Tool Button
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
          ) : (
            // Batch Mode: Add Tool Button
            <button
              onClick={handleAddTool}
              disabled={!selectedServerId || !selectedToolName}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                selectedServerId && selectedToolName
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              )}
            >
              <Plus className="w-4 h-4" />
              Add to Batch
            </button>
          )}

          {/* Batch Mode: Selected Tools Chips */}
          {mode === 'batch' && selectedTools.length > 0 && (
            <SelectedToolsChips
              tools={selectedTools}
              onRemove={(serverId, toolName) => removeToolFromSelection(serverId, toolName)}
              onUpdateArgs={(serverId, toolName, args) => updateToolArguments(serverId, toolName, args)}
            />
          )}

          {/* Batch Mode: Concurrent Settings & Call Button */}
          {mode === 'batch' && selectedTools.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Max Concurrent:</label>
                <select
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCallBatch}
                disabled={isCallingBatch}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  !isCallingBatch
                    ? 'bg-primary-500 hover:bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                )}
              >
                {isCallingBatch ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    Calling {selectedTools.length} tools...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Call {selectedTools.length} Tools
                  </>
                )}
              </button>

              <button
                onClick={clearSelectedTools}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Single Mode: Result Display */}
          {mode === 'single' && lastToolResult && (
            <SingleResultDisplay result={lastToolResult} onClose={clearToolResult} />
          )}

          {/* Batch Mode: Result Display */}
          {mode === 'batch' && lastBatchResult && (
            <BatchResultDisplay
              result={lastBatchResult}
              tools={selectedTools}
              onClose={clearBatchResult}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub Components
// ─────────────────────────────────────────────────────────────

interface SelectedToolsChipsProps {
  tools: MCPToolSelection[]
  onRemove: (serverId: string, toolName: string) => void
  onUpdateArgs: (serverId: string, toolName: string, args: Record<string, unknown>) => void
}

function SelectedToolsChips({ tools, onRemove }: SelectedToolsChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="text-xs text-gray-500 dark:text-gray-400 self-center">Selected:</span>
      {tools.map((tool, idx) => (
        <div
          key={`${tool.serverId}-${tool.toolName}-${idx}`}
          className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs"
        >
          <span className="font-medium">{tool.serverName}</span>
          <span className="text-blue-400">/</span>
          <span>{tool.toolName}</span>
          <button
            onClick={() => onRemove(tool.serverId, tool.toolName)}
            className="ml-1 p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

interface SingleResultDisplayProps {
  result: {
    success: boolean
    result?: unknown
    error?: string
    execution_time_ms: number
  }
  onClose: () => void
}

function SingleResultDisplay({ result, onClose }: SingleResultDisplayProps) {
  const formatResult = (r: unknown): string => {
    try {
      return JSON.stringify(r, null, 2)
    } catch {
      return String(r)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        result.success
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span
            className={cn(
              'text-sm font-medium',
              result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {result.success ? 'Success' : 'Error'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({result.execution_time_ms}ms)
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="bg-gray-900 rounded p-2 max-h-40 overflow-auto">
        <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
          {result.success
            ? formatResult(result.result)
            : result.error || 'Unknown error'}
        </pre>
      </div>
    </div>
  )
}

interface BatchResultDisplayProps {
  result: {
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
  tools: MCPToolSelection[]
  onClose: () => void
}

function BatchResultDisplay({ result, tools, onClose }: BatchResultDisplayProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const formatContent = (content: unknown): string => {
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Summary Header */}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Batch Result
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
              {result.success_count} success
            </span>
            {result.failure_count > 0 && (
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                {result.failure_count} failed
              </span>
            )}
            <span className="text-gray-500 dark:text-gray-400">
              {result.total_execution_time_ms}ms total
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Individual Results */}
      <div className="max-h-60 overflow-auto">
        {result.results.map((r, idx) => {
          const tool = tools[idx]
          const isExpanded = expandedIdx === idx

          return (
            <div
              key={idx}
              className={cn(
                'border-b border-gray-100 dark:border-gray-700 last:border-b-0',
                r.success ? 'bg-white dark:bg-gray-800' : 'bg-red-50/50 dark:bg-red-900/10'
              )}
            >
              {/* Result Header */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {r.success ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className="text-xs font-medium text-gray-900 dark:text-white">
                    {tool?.serverName || 'Unknown'}/{tool?.toolName || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {r.execution_time_ms}ms
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 text-gray-400 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-2 pb-2">
                  <div className="bg-gray-900 rounded p-2 max-h-32 overflow-auto">
                    <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
                      {r.success
                        ? formatContent(r.content)
                        : r.error || 'Unknown error'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
