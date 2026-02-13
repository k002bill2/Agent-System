import { useWorkflowStore } from '../../stores/workflows'
import { useProjectsStore } from '../../stores/projects'
import type { Workflow } from '../../types/workflow'
import {
  GitBranch, CheckCircle, XCircle, Clock, Pause,
  Code, Rocket, Zap, Activity, Database,
  GitPullRequest, Box, Shield, Tag, Trash2,
  Gauge, Monitor, Hexagon, FolderKanban, type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  running: <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  queued: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  cancelled: <Pause className="w-3.5 h-3.5 text-gray-500" />,
}

/** Keyword-based icon + color mapping for workflow names */
const WORKFLOW_ICON_RULES: { keywords: string[]; icon: LucideIcon; color: string }[] = [
  { keywords: ['health', 'health check'],   icon: Activity,       color: 'text-emerald-500' },
  { keywords: ['database', 'backup', 'db'], icon: Database,       color: 'text-amber-500' },
  { keywords: ['pr ', 'pull request', 'pr validation'], icon: GitPullRequest, color: 'text-blue-500' },
  { keywords: ['docker', 'container', 'image'], icon: Box,        color: 'text-cyan-500' },
  { keywords: ['security', 'scan', 'audit'],icon: Shield,         color: 'text-red-400' },
  { keywords: ['release', 'version'],       icon: Tag,            color: 'text-violet-500' },
  { keywords: ['cleanup', 'clean', 'log cleanup'], icon: Trash2,  color: 'text-gray-400' },
  { keywords: ['benchmark', 'performance', 'perf'], icon: Gauge,  color: 'text-orange-500' },
  { keywords: ['branch', 'git branch'],     icon: GitBranch,      color: 'text-pink-500' },
  { keywords: ['dashboard', 'react', 'frontend', 'dev server'], icon: Monitor, color: 'text-indigo-500' },
  { keywords: ['deploy', 'ship'],           icon: Rocket,         color: 'text-green-500' },
  { keywords: ['test', 'spec'],             icon: CheckCircle,    color: 'text-purple-500' },
  { keywords: ['node', 'npm'],              icon: Hexagon,        color: 'text-green-600' },
  { keywords: ['python', 'ci'],             icon: Code,           color: 'text-blue-400' },
]

function getWorkflowIcon(name: string): { Icon: LucideIcon; color: string } {
  const lower = name.toLowerCase()
  for (const rule of WORKFLOW_ICON_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { Icon: rule.icon, color: rule.color }
    }
  }
  return { Icon: Zap, color: 'text-gray-400' }
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
  const { projects } = useProjectsStore()

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
        workflows.map(w => {
          const { Icon: WfIcon, color: iconColor } = getWorkflowIcon(w.name)
          return (
          <button
            key={w.id}
            onClick={() => handleSelect(w)}
            className={cn(
              'w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
              selectedWorkflowId === w.id && 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500'
            )}
          >
            <div className="flex items-center gap-2">
              <WfIcon className={cn('w-4 h-4 flex-shrink-0', iconColor)} />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {w.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 ml-6 flex-wrap">
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
              {w.project_id && (() => {
                const project = projects.find(p => p.id === w.project_id)
                return project ? (
                  <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <FolderKanban className="w-3 h-3" />
                    {project.name}
                  </span>
                ) : null
              })()}
            </div>
          </button>
          )
        })
      )}
    </div>
  )
}
