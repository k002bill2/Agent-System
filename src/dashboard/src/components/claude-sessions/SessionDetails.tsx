import { useState } from 'react'
import { useClaudeSessionsStore } from '../../stores/claudeSessions'
import { cn } from '../../lib/utils'
import {
  MessageSquare,
  User,
  Bot,
  Wrench,
  Clock,
  GitBranch,
  Folder,
  Hash,
  Zap,
  FileText,
  LayoutList,
  Code2,
  CheckCircle,
} from 'lucide-react'
import { SessionMessage, MessageType, SessionStatus, ClaudeSessionDetail } from '../../types/claudeSession'
import { TranscriptViewer } from './TranscriptViewer'

type TabType = 'overview' | 'transcript'

const statusColors: Record<SessionStatus, string> = {
  active: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20',
  idle: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20',
  completed: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700',
  unknown: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-700',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function MessageIcon({ type }: { type: MessageType }) {
  switch (type) {
    case 'user':
      return <User className="w-4 h-4 text-blue-500" />
    case 'assistant':
      return <Bot className="w-4 h-4 text-purple-500" />
    case 'tool_use':
      return <Wrench className="w-4 h-4 text-orange-500" />
    case 'tool_result':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'progress':
      return <Zap className="w-4 h-4 text-green-500" />
    default:
      return <MessageSquare className="w-4 h-4 text-gray-500" />
  }
}

function formatToolInput(input: Record<string, unknown>): string {
  // Extract key values for display
  if (input.file_path) return String(input.file_path).split('/').slice(-2).join('/')
  if (input.pattern) return `"${input.pattern}"`
  if (input.command) return String(input.command).slice(0, 50) + (String(input.command).length > 50 ? '...' : '')
  if (input.query) return String(input.query).slice(0, 40) + (String(input.query).length > 40 ? '...' : '')
  if (input.content) return `${String(input.content).slice(0, 30)}...`
  if (input.url) return String(input.url).slice(0, 40)
  // Fallback: show first key-value
  const keys = Object.keys(input)
  if (keys.length > 0) {
    const firstKey = keys[0]
    const value = String(input[firstKey]).slice(0, 30)
    return `${firstKey}: ${value}${String(input[firstKey]).length > 30 ? '...' : ''}`
  }
  return ''
}

function MessageItem({ message }: { message: SessionMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString()
  const toolInputSummary = message.tool_input ? formatToolInput(message.tool_input) : null

  return (
    <div className="flex gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <div className="flex-shrink-0 mt-0.5">
        <MessageIcon type={message.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium capitalize">{message.type.replace('_', ' ')}</span>
          {message.tool_name && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded">
              {message.tool_name}
            </span>
          )}
          <span>{time}</span>
          {message.usage && (
            <span className="text-gray-400">
              {formatTokens(message.usage.input_tokens + message.usage.output_tokens)} tokens
            </span>
          )}
        </div>
        {/* Tool input summary */}
        {toolInputSummary && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
            {toolInputSummary}
          </p>
        )}
        {message.content && (
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}
      </div>
    </div>
  )
}

function OverviewContent({ session }: { session: ClaudeSessionDetail }) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {session.summary || session.slug || 'Session Details'}
          </h2>
          <span
            className={cn(
              'px-2 py-1 rounded-full text-xs font-medium capitalize',
              statusColors[session.status]
            )}
          >
            {session.status}
          </span>
        </div>

        {session.current_task && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-3">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              Current Task
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 line-clamp-2">
              {session.current_task}
            </p>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* Project */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Folder className="w-4 h-4" />
            <span className="truncate" title={session.cwd}>
              {session.project_name}
            </span>
          </div>

          {/* Git Branch */}
          {session.git_branch && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <GitBranch className="w-4 h-4" />
              <span className="truncate">{session.git_branch}</span>
            </div>
          )}

          {/* Model */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Bot className="w-4 h-4" />
            <span className="truncate text-xs">{session.model}</span>
          </div>

          {/* Version */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Hash className="w-4 h-4" />
            <span>v{session.version}</span>
          </div>

          {/* Created */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs">{formatDate(session.created_at)}</span>
          </div>

          {/* File Size */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <FileText className="w-4 h-4" />
            <span>{formatBytes(session.file_size)}</span>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-around p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {session.message_count}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Messages</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {session.tool_call_count}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Tool Calls</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatTokens(session.total_input_tokens + session.total_output_tokens)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Tokens</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            {formatCost(session.estimated_cost)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Cost</p>
        </div>
      </div>

      {/* Recent Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Recent Activity
          </h3>
          {session.recent_messages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No recent messages
            </p>
          ) : (
            <div className="space-y-1">
              {session.recent_messages.map((message, index) => (
                <MessageItem key={`msg-${message.type ?? 'unknown'}-${index}`} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function SessionDetails() {
  const { selectedSession, isLoadingDetails } = useClaudeSessionsStore()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  if (isLoadingDetails) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!selectedSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
        <p>Select a session to view details</p>
      </div>
    )
  }

  const session = selectedSession

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'overview'
              ? 'text-primary-600 border-b-2 border-primary-600 -mb-px'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <LayoutList className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'transcript'
              ? 'text-primary-600 border-b-2 border-primary-600 -mb-px'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <Code2 className="w-4 h-4" />
          Raw Transcript
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <OverviewContent session={session} />
      ) : (
        <TranscriptViewer />
      )}
    </div>
  )
}
