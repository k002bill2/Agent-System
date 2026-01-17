import { CheckCard } from './CheckCard'
import { ProjectHealth, ALL_CHECK_TYPES } from '../../types/monitoring'
import { useMonitoringStore } from '../../stores/monitoring'

interface HealthOverviewProps {
  health: ProjectHealth
  projectId: string
}

export function HealthOverview({ health, projectId }: HealthOverviewProps) {
  const { runningChecks, runCheck, activeLogView, setActiveLogView } = useMonitoringStore()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Health Overview
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ALL_CHECK_TYPES.map((checkType) => {
          const check = health.checks[checkType]
          const isRunning = runningChecks.has(checkType)

          return (
            <CheckCard
              key={checkType}
              checkType={checkType}
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
    </div>
  )
}
