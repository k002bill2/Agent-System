import { useState } from 'react'
import { Webhook, Zap, Filter, Code, Plus, Trash2 } from 'lucide-react'
import { useProjectConfigsStore, HookConfig } from '../../stores/projectConfigs'
import { HookEditModal } from './HookEditModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'

export function HooksTab() {
  const { selectedProject, isLoadingProject, addHookEntry, deleteHook } = useProjectConfigsStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ event: string; index: number; command: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  // Group hooks by event with index tracking
  const hooksByEvent: Record<string, { hook: HookConfig; eventIndex: number }[]> = {}
  const eventIndexCounters: Record<string, number> = {}

  hooks.forEach((hook) => {
    if (!hooksByEvent[hook.event]) {
      hooksByEvent[hook.event] = []
      eventIndexCounters[hook.event] = 0
    }
    // Extract the index from hook_id (format: event_i_j)
    const parts = hook.hook_id.split('_')
    const entryIndex = parseInt(parts[1] || '0', 10)
    hooksByEvent[hook.event].push({ hook, eventIndex: entryIndex })
  })

  const handleAddHook = async (event: string, matcher: string, hookList: { type: string; command: string }[]) => {
    if (!selectedProject) return false
    return await addHookEntry(selectedProject.project.project_id, event, matcher, hookList)
  }

  const handleDeleteHook = async () => {
    if (!deleteTarget || !selectedProject) return
    setDeleting(true)
    await deleteHook(selectedProject.project.project_id, deleteTarget.event, deleteTarget.index)
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Webhook className="w-5 h-5 text-orange-500" />
            Hooks ({hooks.length})
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700"
          >
            <Plus className="w-4 h-4" />
            Add Hook
          </button>
        </div>

        {hooks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Webhook className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hooks configured</p>
            <p className="text-sm mt-1">Click "Add Hook" to create one</p>
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
                  {eventHooks.map(({ hook, eventIndex }) => (
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
                        <button
                          onClick={() => setDeleteTarget({ event, index: eventIndex, command: hook.command })}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          title="Delete hook"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <HookEditModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddHook}
      />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete Hook"
        message="Are you sure you want to delete this hook? This action cannot be undone."
        itemName={deleteTarget?.command || ''}
        isDeleting={deleting}
        onConfirm={handleDeleteHook}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
