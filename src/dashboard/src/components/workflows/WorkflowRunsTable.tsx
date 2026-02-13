import type { WorkflowRun } from '../../types/workflow'
import { useWorkflowStore } from '../../stores/workflows'
import { cn } from '../../lib/utils'
import { CheckCircle, XCircle, Clock, Loader2, Ban } from 'lucide-react'

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  completed: { icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-500' },
  failed: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-500' },
  running: { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: 'text-blue-500' },
  queued: { icon: <Clock className="w-4 h-4" />, color: 'text-yellow-500' },
  cancelled: { icon: <Ban className="w-4 h-4" />, color: 'text-gray-500' },
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function WorkflowRunsTable({ runs }: { runs: WorkflowRun[] }) {
  const { setActiveRun, streamRunLogs } = useWorkflowStore()

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        아직 실행 이력이 없습니다
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Trigger</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Started</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Duration</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Cost</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => {
            const cfg = statusConfig[run.status] || statusConfig.queued
            return (
              <tr
                key={run.id}
                onClick={() => {
                  setActiveRun(run)
                  if (run.status === 'running' || run.status === 'queued') {
                    streamRunLogs(run.id)
                  }
                }}
                className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className={cn('flex items-center gap-2', cfg.color)}>
                    {cfg.icon}
                    <span className="capitalize">{run.status}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{run.trigger_type}</td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                  {new Date(run.started_at).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                  {formatDuration(run.duration_seconds)}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">
                  ${run.total_cost.toFixed(4)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
