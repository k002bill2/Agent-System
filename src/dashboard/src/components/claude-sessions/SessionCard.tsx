import { useState } from 'react'
import { cn } from '../../lib/utils'
import { ClaudeSessionInfo, SessionStatus } from '../../types/claudeSession'
import { useClaudeSessionsStore } from '../../stores/claudeSessions'
import { Clock, MessageSquare, Wrench, DollarSign, GitBranch, Sparkles, Loader2, Trash2, User } from 'lucide-react'

interface SessionCardProps {
  session: ClaudeSessionInfo
  isSelected: boolean
  onClick: () => void
}

const statusColors: Record<SessionStatus, string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  completed: 'bg-gray-400',
  unknown: 'bg-gray-300',
}

const statusLabels: Record<SessionStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  completed: 'Completed',
  unknown: 'Unknown',
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

export function SessionCard({ session, isSelected, onClick }: SessionCardProps) {
  const { generateSummary, generatingSummaryFor, deleteSession, isGhostSession, isExternalSession } = useClaudeSessionsStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const isGenerating = generatingSummaryFor === session.session_id
  const isEmpty = session.message_count === 0
  const isGhost = isGhostSession(session)
  const isDeletable = isEmpty || isGhost
  const isExternal = isExternalSession(session)

  const handleGenerateSummary = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    generateSummary(session.session_id)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    if (!confirm('이 세션을 삭제하시겠습니까?')) return

    setIsDeleting(true)
    try {
      await deleteSession(session.session_id)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-lg border transition-all duration-200',
        isSelected
          ? 'bg-primary-50 border-primary-300 dark:bg-primary-900/20 dark:border-primary-600'
          : 'bg-white border-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600'
      )}
    >
      {/* Header: Title & Status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
          <h3 className="font-medium text-gray-900 dark:text-white truncate">
            {session.summary || session.slug || session.session_id.slice(0, 8)}
          </h3>
          {!session.summary && (
            <button
              onClick={handleGenerateSummary}
              disabled={isGenerating}
              className={cn(
                'flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                isGenerating && 'cursor-not-allowed opacity-50'
              )}
              title="AI 요약 생성"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Delete button for empty/ghost sessions */}
          {isDeletable && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={cn(
                'p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
                isDeleting && 'cursor-not-allowed opacity-50'
              )}
              title={isEmpty ? '빈 세션 삭제' : '유령 세션 삭제 (실제 대화 없음)'}
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              )}
            </button>
          )}
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              statusColors[session.status]
            )}
            title={statusLabels[session.status]}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {statusLabels[session.status]}
          </span>
        </div>
      </div>

      {/* Project Name & Slug */}
      <div className="text-sm text-gray-600 dark:text-gray-300 mb-3 truncate flex items-center gap-2">
        <span className="truncate">
          {session.project_name || session.project_path}
          {session.summary && session.slug && (
            <span className="text-gray-400 dark:text-gray-500 ml-2">
              · {session.slug}
            </span>
          )}
        </span>
        {isExternal && session.source_user && (
          <span
            className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            title={`External session from ${session.source_user}`}
          >
            <User className="w-3 h-3" />
            {session.source_user}
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
        {/* Messages */}
        <div className="flex items-center gap-1" title="Messages">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{session.message_count}</span>
        </div>

        {/* Tool Calls */}
        <div className="flex items-center gap-1" title="Tool Calls">
          <Wrench className="w-3.5 h-3.5" />
          <span>{session.tool_call_count}</span>
        </div>

        {/* Cost */}
        <div className="flex items-center gap-1" title="Estimated Cost">
          <DollarSign className="w-3.5 h-3.5" />
          <span>{formatCost(session.estimated_cost)}</span>
        </div>

        {/* Git Branch */}
        {session.git_branch && (
          <div className="flex items-center gap-1" title="Git Branch">
            <GitBranch className="w-3.5 h-3.5" />
            <span className="truncate max-w-[80px]">{session.git_branch}</span>
          </div>
        )}
      </div>

      {/* Last Activity */}
      <div className="flex items-center gap-1 mt-2 text-xs text-gray-400 dark:text-gray-500">
        <Clock className="w-3 h-3" />
        <span>{formatTimeAgo(session.last_activity)}</span>
      </div>
    </button>
  )
}
