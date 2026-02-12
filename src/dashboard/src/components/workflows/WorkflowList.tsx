import { useWorkflowStore } from '../../stores/workflows'
import type { Workflow } from '../../types/workflow'
import { GitBranch, CheckCircle, XCircle, Clock, Pause } from 'lucide-react'
import { cn } from '../../lib/utils'

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  running: <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  queued: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  cancelled: <Pause className="w-3.5 h-3.5 text-gray-500" />,
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function WorkflowList() {
  const { workflows, selectedWorkflowId, selectWorkflow, fetchRuns } = useWorkflowStore()

  const handleSelect = (workflow: Workflow) => {
    selectWorkflow(workflow.id)
    fetchRuns(workflow.id)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {workflows.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
          워크플로우가 없습니다
        </div>
      ) : (
        workflows.map(w => (
          <button
            key={w.id}
            onClick={() => handleSelect(w)}
            className={cn(
              'w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
              selectedWorkflowId === w.id && 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500'
            )}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {w.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 ml-6">
              {w.last_run_status && statusIcon[w.last_run_status]}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatTimeAgo(w.last_run_at)}
              </span>
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                w.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                w.status === 'inactive' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              )}>
                {w.status}
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  )
}
