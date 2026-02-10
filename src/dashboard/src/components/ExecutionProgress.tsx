/**
 * ExecutionProgress Component
 *
 * 분석 결과 실행 시 인라인으로 표시되는 진행 상태 컴포넌트.
 * orchestration store의 WebSocket tasks 상태를 구독하여 실시간 업데이트.
 */

import { useEffect, useMemo } from 'react'
import { cn } from '../lib/utils'
import { useOrchestrationStore, Task } from '../stores/orchestration'
import { useAgentsStore } from '../stores/agents'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Play,
  StopCircle,
  Zap,
} from 'lucide-react'

// Task status → visual config
const statusConfig: Record<string, { icon: typeof Circle; color: string; bgColor: string; label: string }> = {
  pending: {
    icon: Circle,
    color: 'text-gray-400 dark:text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900',
    label: 'Pending',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Running',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Failed',
  },
  cancelled: {
    icon: StopCircle,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'Cancelled',
  },
}

interface ExecutionProgressProps {
  sessionId: string
}

export function ExecutionProgress({ sessionId }: ExecutionProgressProps) {
  const {
    tasks,
    rootTaskId,
    connected,
    connectionStatus,
    reconnect,
    isProcessing,
  } = useOrchestrationStore()
  const { clearExecution } = useAgentsStore()

  // WebSocket 연결 (세션이 설정되면 자동 연결)
  useEffect(() => {
    if (sessionId && !connected && connectionStatus !== 'connecting') {
      // orchestration store에 sessionId를 설정하고 reconnect
      useOrchestrationStore.setState({ sessionId })
      reconnect()
    }
  }, [sessionId, connected, connectionStatus, reconnect])

  // 서브태스크 목록 (root 제외)
  const subtasks = useMemo(() => {
    if (!rootTaskId) return []

    const rootTask = tasks[rootTaskId]
    if (!rootTask) return []

    return rootTask.children
      .map((childId) => tasks[childId])
      .filter((task): task is Task => !!task)
  }, [tasks, rootTaskId])

  // 진행률 계산
  const progress = useMemo(() => {
    if (subtasks.length === 0) return { completed: 0, total: 0, percentage: 0 }

    const completed = subtasks.filter(
      (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
    ).length
    const total = subtasks.length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { completed, total, percentage }
  }, [subtasks])

  // 전체 완료 여부
  const isAllDone = progress.completed === progress.total && progress.total > 0
  const hasFailed = subtasks.some((t) => t.status === 'failed')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-green-500" />
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Execution Progress
          </h4>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                connected ? 'bg-green-500' : connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
              )}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {connected ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>

          {isAllDone && (
            <button
              onClick={clearExecution}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {progress.completed}/{progress.total} subtasks
          </span>
          <span>{progress.percentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              hasFailed ? 'bg-red-500' : isAllDone ? 'bg-green-500' : 'bg-blue-500'
            )}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Subtask Cards */}
      {subtasks.length > 0 ? (
        <div className="space-y-2">
          {subtasks.map((task) => {
            const config = statusConfig[task.status] || statusConfig.pending
            const Icon = config.icon

            return (
              <div
                key={task.id}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  config.bgColor,
                  task.status === 'in_progress'
                    ? 'border-blue-300 dark:border-blue-700'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0',
                      config.color,
                      task.status === 'in_progress' && 'animate-spin'
                    )}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 truncate">
                    {task.title}
                  </span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', config.color)}>
                    {config.label}
                  </span>
                </div>

                {task.error && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 pl-6">
                    {task.error}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : isProcessing || !connected ? (
        <div className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">
            {!connected ? 'Connecting to session...' : 'Initializing execution...'}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400">
          <Play className="w-5 h-5 mr-2 opacity-50" />
          <span className="text-sm">Waiting for tasks to appear...</span>
        </div>
      )}

      {/* Completion Banner */}
      {isAllDone && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm font-medium text-center',
            hasFailed
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          )}
        >
          {hasFailed
            ? `Execution completed with errors (${subtasks.filter((t) => t.status === 'failed').length} failed)`
            : 'All subtasks completed successfully!'}
        </div>
      )}
    </div>
  )
}
