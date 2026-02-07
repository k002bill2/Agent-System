/**
 * Playground Page
 * Interactive environment for testing agents
 */

import { useEffect, useState, useRef } from 'react'
import {
  Settings,
  Trash2,
  Plus,
  Send,
  RefreshCw,
  Terminal,
  Wrench,
  Zap,
  Clock,
  DollarSign,
  Bot,
  User,
  Copy,
  Check,
  Loader2,
  FolderOpen,
  X,
  Database,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { TaskEvaluationCard } from '../components/feedback/TaskEvaluationCard'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RAGSource {
  content: string
  source: string
  chunk_index?: number
  priority?: string
  score?: number
}

interface PlaygroundMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
  tokens?: number
  latency_ms?: number
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>
  tool_results?: Array<{ tool: string; result: unknown }>
  rag_sources?: RAGSource[]
}

interface PlaygroundSession {
  id: string
  name: string
  description: string
  project_id: string | null
  working_directory: string | null
  agent_id: string | null
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string | null
  rag_enabled: boolean
  available_tools: string[]
  enabled_tools: string[]
  messages: PlaygroundMessage[]
  total_executions: number
  total_tokens: number
  total_cost: number
  created_at: string
  updated_at: string
}

interface PlaygroundTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

interface Model {
  id: string
  display_name: string
  provider: string
  context_window: number
  pricing: { input: number; output: number }
  available: boolean
}

interface Project {
  id: string
  name: string
  path: string
  description: string
  has_claude_md: boolean
  vector_store_initialized?: boolean
  indexed_at?: string | null
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api'

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

async function fetchSessions(): Promise<PlaygroundSession[]> {
  const res = await fetch(`${API_BASE}/playground/sessions`)
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

async function createSession(
  name: string,
  model?: string,
  projectId?: string,
  workingDirectory?: string
): Promise<PlaygroundSession> {
  const res = await fetch(`${API_BASE}/playground/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      ...(model && { model }),
      ...(projectId && { project_id: projectId }),
      ...(workingDirectory && { working_directory: workingDirectory }),
    }),
  })
  if (!res.ok) throw new Error('Failed to create session')
  return res.json()
}

async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/playground/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete session')
}

async function executePrompt(
  sessionId: string,
  prompt: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/playground/sessions/${sessionId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options }),
  })
  if (!res.ok) throw new Error('Failed to execute prompt')
  return res.json()
}

async function updateSettings(
  sessionId: string,
  settings: Partial<{
    model: string
    temperature: number
    max_tokens: number
    system_prompt: string
    enabled_tools: string[]
    rag_enabled: boolean
  }>
): Promise<PlaygroundSession> {
  const res = await fetch(`${API_BASE}/playground/sessions/${sessionId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Failed to update settings')
  return res.json()
}

async function clearHistory(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/playground/sessions/${sessionId}/clear`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to clear history')
}

async function fetchTools(): Promise<PlaygroundTool[]> {
  const res = await fetch(`${API_BASE}/playground/tools`)
  if (!res.ok) throw new Error('Failed to fetch tools')
  const data = await res.json()
  return data.tools
}

async function fetchModels(): Promise<Model[]> {
  const res = await fetch(`${API_BASE}/playground/models`)
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.models
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function PlaygroundPage() {
  const [sessions, setSessions] = useState<PlaygroundSession[]>([])
  const [currentSession, setCurrentSession] = useState<PlaygroundSession | null>(null)
  const [tools, setTools] = useState<PlaygroundTool[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // New Session Dialog state
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionProjectId, setNewSessionProjectId] = useState<string | null>(null)
  const [newSessionModel, setNewSessionModel] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  const loadData = async () => {
    try {
      setLoading(true)
      const [sessionsData, toolsData, modelsData, projectsData] = await Promise.all([
        fetchSessions(),
        fetchTools(),
        fetchModels(),
        fetchProjects(),
      ])
      setSessions(sessionsData)
      setTools(toolsData)
      setModels(modelsData)
      setProjects(projectsData)
      if (sessionsData.length > 0) {
        setCurrentSession(sessionsData[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenNewSessionDialog = () => {
    const availableModels = models.filter(m => m.available)
    setNewSessionName(`Session ${sessions.length + 1}`)
    setNewSessionProjectId(null)
    setNewSessionModel(availableModels.length > 0 ? availableModels[0].id : null)
    setShowNewSessionDialog(true)
  }

  const handleCreateSession = async () => {
    try {
      const selectedProject = projects.find(p => p.id === newSessionProjectId)
      const session = await createSession(
        newSessionName || `Session ${sessions.length + 1}`,
        newSessionModel || undefined,
        newSessionProjectId || undefined,
        selectedProject?.path || undefined
      )
      setSessions((prev) => [session, ...prev])
      setCurrentSession(session)
      setShowNewSessionDialog(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (currentSession?.id === sessionId) {
        setCurrentSession(sessions.find((s) => s.id !== sessionId) || null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleExecute = async () => {
    if (!currentSession || !prompt.trim()) return

    try {
      setExecuting(true)
      await executePrompt(currentSession.id, prompt)
      // Refresh session to get updated messages
      const updatedSessions = await fetchSessions()
      setSessions(updatedSessions)
      const updated = updatedSessions.find((s) => s.id === currentSession.id)
      if (updated) setCurrentSession(updated)
      setPrompt('')
    } catch (e) {
      console.error(e)
    } finally {
      setExecuting(false)
    }
  }

  const handleUpdateSettings = async (settings: Parameters<typeof updateSettings>[1]) => {
    if (!currentSession) return
    try {
      const updated = await updateSettings(currentSession.id, settings)
      setCurrentSession(updated)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch (e) {
      console.error(e)
    }
  }

  const handleClearHistory = async () => {
    if (!currentSession) return
    try {
      await clearHistory(currentSession.id)
      setCurrentSession({ ...currentSession, messages: [], total_tokens: 0, total_cost: 0 })
    } catch (e) {
      console.error(e)
    }
  }

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar - Sessions */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleOpenNewSessionDialog}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setCurrentSession(session)}
              className={cn(
                'p-3 rounded-lg cursor-pointer group',
                currentSession?.id === session.id
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {session.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSession(session.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {session.project_id && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1">
                  <FolderOpen className="w-3 h-3" />
                  <span className="truncate">
                    {projects.find(p => p.id === session.project_id)?.name || session.project_id}
                  </span>
                </div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                {session.total_executions} executions • ${session.total_cost.toFixed(4)}
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No sessions yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      {currentSession ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {currentSession.name}
              </h2>
              {currentSession.project_id && (
                <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                  <FolderOpen className="w-3 h-3" />
                  {projects.find(p => p.id === currentSession.project_id)?.name || currentSession.project_id}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Zap className="w-4 h-4" />
                {currentSession.total_tokens.toLocaleString()} tokens
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarSign className="w-4 h-4" />
                ${currentSession.total_cost.toFixed(4)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearHistory}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title="Clear history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'p-2 rounded-lg',
                  showSettings
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Messages */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {currentSession.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <Bot className="w-16 h-16 mb-4 opacity-30" />
                    <p className="text-lg">Start a conversation</p>
                    <p className="text-sm">Enter a prompt below to test the agent</p>
                  </div>
                ) : (
                  currentSession.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onCopy={(content) => handleCopy(content, msg.id)}
                      copied={copiedId === msg.id}
                      sessionId={currentSession.id}
                    />
                  ))
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex gap-2">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleExecute()
                      }
                    }}
                    placeholder="Enter your prompt..."
                    rows={3}
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={executing}
                  />
                  <button
                    onClick={handleExecute}
                    disabled={executing || !prompt.trim()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {executing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                <div className="p-4 space-y-6">
                  {/* Model Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Model
                    </label>
                    <select
                      value={currentSession.model}
                      onChange={(e) => handleUpdateSettings({ model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {models.filter(m => m.available).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name} ({m.provider})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {models.filter(m => m.available).length} of {models.length} models available
                    </p>
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Temperature: {currentSession.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={currentSession.temperature}
                      onChange={(e) =>
                        handleUpdateSettings({ temperature: parseFloat(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      value={currentSession.max_tokens}
                      onChange={(e) =>
                        handleUpdateSettings({ max_tokens: parseInt(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {/* System Prompt */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      System Prompt
                    </label>
                    <textarea
                      value={currentSession.system_prompt || ''}
                      onChange={(e) => handleUpdateSettings({ system_prompt: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                      placeholder="Optional system prompt..."
                    />
                  </div>

                  {/* RAG Context */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentSession.rag_enabled}
                        disabled={!currentSession.project_id}
                        onChange={(e) => handleUpdateSettings({ rag_enabled: e.target.checked })}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      <Database className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        RAG Context
                      </span>
                    </label>
                    {!currentSession.project_id && (
                      <p className="text-xs text-gray-400 mt-1 ml-6">
                        프로젝트를 선택해야 RAG를 사용할 수 있습니다
                      </p>
                    )}
                    {currentSession.project_id && (() => {
                      const proj = projects.find(p => p.id === currentSession.project_id)
                      if (!proj) return null
                      return proj.vector_store_initialized ? (
                        <div className="mt-1.5 ml-6 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-xs text-green-600 dark:text-green-400">인덱스 활성화</span>
                          {proj.indexed_at && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              {new Date(proj.indexed_at).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1.5 ml-6 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            인덱싱 필요 — 프로젝트 설정에서 인덱싱을 실행하세요
                          </span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Tools */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Tools
                    </label>
                    <div className="space-y-2">
                      {tools.map((tool) => (
                        <label
                          key={tool.name}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={currentSession.enabled_tools.includes(tool.name)}
                            onChange={(e) => {
                              const enabled = e.target.checked
                                ? [...currentSession.enabled_tools, tool.name]
                                : currentSession.enabled_tools.filter((t) => t !== tool.name)
                              handleUpdateSettings({ enabled_tools: enabled })
                            }}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {tool.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Terminal className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No session selected</p>
            <p className="text-sm">Create a new session to get started</p>
          </div>
        </div>
      )}

      {/* New Session Dialog */}
      {showNewSessionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                New Session
              </h3>
              <button
                onClick={() => setShowNewSessionDialog(false)}
                className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Session Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Enter session name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Project Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <FolderOpen className="w-4 h-4 inline mr-1" />
                  Project (Optional)
                </label>
                <select
                  value={newSessionProjectId || ''}
                  onChange={(e) => setNewSessionProjectId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {newSessionProjectId && (
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {projects.find(p => p.id === newSessionProjectId)?.path}
                  </p>
                )}
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model
                </label>
                <select
                  value={newSessionModel || ''}
                  onChange={(e) => setNewSessionModel(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {models.filter(m => m.available).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.display_name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowNewSessionDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: PlaygroundMessage
  onCopy: (content: string) => void
  copied: boolean
  sessionId?: string
}

function MessageBubble({ message, onCopy, copied, sessionId }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  const [showSources, setShowSources] = useState(false)

  // Tool call message - special styling
  if (isTool) {
    return (
      <div className="flex gap-3 justify-center">
        <div className="max-w-[90%] rounded-lg px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Wrench className="w-4 h-4" />
            <span className="text-sm font-medium">Tool Call</span>
          </div>
          <div className="mt-1 text-sm text-amber-600 dark:text-amber-300 font-mono">
            {message.content}
          </div>
          {message.tool_results && message.tool_results.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-amber-500 cursor-pointer hover:text-amber-600">
                View Result
              </summary>
              <pre className="mt-1 text-xs bg-amber-100 dark:bg-amber-900/30 p-2 rounded overflow-x-auto max-h-32">
                {JSON.stringify(message.tool_results[0]?.result, null, 2)?.slice(0, 500)}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : 'bg-gray-100 dark:bg-gray-700'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <Bot className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        )}
      </div>
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-4 py-3',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
        )}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        {/* RAG Sources collapsible section */}
        {!isUser && message.rag_sources && message.rag_sources.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <Database className="w-3 h-3" />
              <span>참조된 문서 ({message.rag_sources.length})</span>
              {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showSources && (
              <div className="mt-2 space-y-2">
                {message.rag_sources.map((src, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                        {src.source}
                      </span>
                      {src.priority && src.priority !== 'normal' && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {src.priority}
                        </span>
                      )}
                      {src.score !== undefined && (
                        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                          {Math.round(src.score * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
                      {src.content.slice(0, 300)}
                      {src.content.length > 300 && '...'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!isUser && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {message.tokens !== undefined && message.tokens > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {message.tokens}
                </span>
              )}
              {message.latency_ms !== undefined && message.latency_ms > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {message.latency_ms}ms
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {sessionId && (
                <TaskEvaluationCard
                  sessionId={sessionId}
                  taskId={message.id}
                />
              )}
              <button
                onClick={() => onCopy(message.content)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5"
              >
                {copied ? (
                  <Check className="w-[18px] h-[18px] text-green-500" />
                ) : (
                  <Copy className="w-[18px] h-[18px]" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlaygroundPage
