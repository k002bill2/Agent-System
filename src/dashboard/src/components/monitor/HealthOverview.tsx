import { CheckCard } from './CheckCard'
import { WorkflowCheckCard } from './WorkflowCheckCard'
import { ProjectHealth, ALL_CHECK_TYPES } from '../../types/monitoring'
import { useMonitoringStore } from '../../stores/monitoring'
import { Workflow } from 'lucide-react'

interface HealthOverviewProps {
  health: ProjectHealth
  projectId: string
}

export function HealthOverview({ health, projectId }: HealthOverviewProps) {
  const {
    getRunningChecks,
    getCheckLabel,
    runCheck,
    activeLogView,
    setActiveLogView,
    workflowChecks,
    runningWorkflowIds,
    runWorkflowCheck,
  } = useMonitoringStore()
  const runningChecks = getRunningChecks(projectId)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
        Health Overview
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ALL_CHECK_TYPES.map((checkType) => {
          const check = health.checks[checkType]
          const isRunning = runningChecks.has(checkType)

          return (
            <CheckCard
              key={checkType}
              checkType={checkType}
              label={getCheckLabel(projectId, checkType)}
              status={check?.status || 'idle'}
              exitCode={check?.exit_code ?? null}
              durationMs={check?.duration_ms ?? null}
              isRunning={isRunning}
              onRun={() => runCheck(projectId, checkType)}
              onClick={() => setActiveLogView(checkType)}
              isSelected={activeLogView === checkType}
            />
          )
        })}
      </div>

      {/* Workflow Checks Section */}
      {workflowChecks.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Workflow className="w-3.5 h-3.5 text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Workflow Checks
            </h3>
            <span className="text-xs text-gray-400">({workflowChecks.length})</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {workflowChecks.map((wc) => (
              <WorkflowCheckCard
                key={wc.id}
                workflow={wc}
                isRunning={runningWorkflowIds.has(wc.id)}
                onRun={() => runWorkflowCheck(wc.id)}
                onClick={() => setActiveLogView(wc.id)}
                isSelected={activeLogView === wc.id}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-center py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700">
          No workflows configured for this project
        </div>
      )}
    </div>
  )
}
