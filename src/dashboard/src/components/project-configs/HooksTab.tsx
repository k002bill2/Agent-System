import { Webhook, Zap, Filter, Code } from 'lucide-react'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

export function HooksTab() {
  const { selectedProject, isLoadingProject } = useProjectConfigsStore()

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view hooks
      </div>
    )
  }

  const { hooks } = selectedProject

  // Group hooks by event
  const hooksByEvent = hooks.reduce((acc, hook) => {
    if (!acc[hook.event]) {
      acc[hook.event] = []
    }
    acc[hook.event].push(hook)
    return acc
  }, {} as Record<string, typeof hooks>)

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Webhook className="w-5 h-5 text-orange-500" />
          Hooks ({hooks.length})
        </h3>
      </div>

      {hooks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Webhook className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hooks configured</p>
          <p className="text-sm mt-1">Add hooks in .claude/hooks.json</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(hooksByEvent).map(([event, eventHooks]) => (
            <div key={event}>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                {event}
                <span className="text-xs text-gray-500">({eventHooks.length})</span>
              </h4>
              <div className="space-y-2">
                {eventHooks.map((hook) => (
                  <div
                    key={hook.hook_id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded">
                        <Filter className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            Matcher:
                          </span>
                          <code className="text-sm px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                            {hook.matcher}
                          </code>
                        </div>
                        {hook.command && (
                          <div className="mt-2 flex items-start gap-2">
                            <Code className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <code className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                              {hook.command}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
