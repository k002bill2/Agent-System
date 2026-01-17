import { cn } from '../../lib/utils'
import { ClaudeSessionInfo, SessionStatus } from '../../types/claudeSession'
import { Clock, MessageSquare, Wrench, DollarSign, GitBranch } from 'lucide-react'

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
      {/* Header: Slug & Status */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900 dark:text-white truncate flex-1 mr-2">
          {session.slug || session.session_id.slice(0, 8)}
        </h3>
        <div className="flex items-center gap-2">
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

      {/* Project Name */}
      <div className="text-sm text-gray-600 dark:text-gray-300 mb-3 truncate">
        {session.project_name || session.project_path}
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
