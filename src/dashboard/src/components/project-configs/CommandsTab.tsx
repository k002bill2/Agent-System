import { cn } from '../../lib/utils'
import { Terminal, ChevronRight, Plus, Pencil, Trash2, Copy, Wrench, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useProjectConfigsStore, CommandConfig } from '../../stores/projectConfigs'
import { CommandEditModal } from './CommandEditModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { CopyToProjectModal, CopyItemType } from './CopyToProjectModal'

export function CommandsTab() {
  const {
    selectedProject,
    isLoadingProject,
    fetchCommandContent,
    commandContent,
    isLoadingContent,
    openCommandModal,
    deleteCommand,
    deletingCommands,
    copyCommand,
  } = useProjectConfigsStore()
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CommandConfig | null>(null)
  const [copyTarget, setCopyTarget] = useState<CommandConfig | null>(null)

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view commands
      </div>
    )
  }

  const { commands } = selectedProject

  const handleExpand = async (command: CommandConfig) => {
    if (expandedCommand === command.command_id) {
      setExpandedCommand(null)
    } else {
      setExpandedCommand(command.command_id)
      await fetchCommandContent(command.project_id, command.command_id)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !selectedProject) return
    await deleteCommand(selectedProject.project.project_id, deleteTarget.command_id)
    setDeleteTarget(null)
  }

  const handleCopy = async (targetProjectId: string) => {
    if (!copyTarget || !selectedProject) return false
    const success = await copyCommand(selectedProject.project.project_id, copyTarget.command_id, targetProjectId)
    if (success) {
      setCopyTarget(null)
    }
    return success
  }

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-teal-500" />
            Commands ({commands.length})
          </h3>
          <button
            onClick={() => openCommandModal('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            Create Command
          </button>
        </div>

        {commands.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No commands found in this project</p>
            <p className="text-sm mt-1">Click "Create Command" to add one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {commands.map((command) => (
              <CommandCard
                key={command.command_id}
                command={command}
                isExpanded={expandedCommand === command.command_id}
                isLoadingContent={isLoadingContent && expandedCommand === command.command_id}
                isDeleting={deletingCommands.has(`${command.project_id}:${command.command_id}`)}
                content={expandedCommand === command.command_id ? commandContent : null}
                onToggle={() => handleExpand(command)}
                onEdit={() => openCommandModal('edit', command)}
                onDelete={() => setDeleteTarget(command)}
                onCopy={() => setCopyTarget(command)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CommandEditModal />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete Command"
        message="Are you sure you want to delete this command? This will remove the command file and cannot be undone."
        itemName={deleteTarget?.command_id || ''}
        isDeleting={deleteTarget ? deletingCommands.has(`${selectedProject?.project.project_id}:${deleteTarget.command_id}`) : false}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <CopyToProjectModal
        isOpen={copyTarget !== null}
        items={copyTarget ? [{
          type: 'command' as CopyItemType,
          id: copyTarget.command_id,
          name: copyTarget.name,
          sourceProjectId: copyTarget.project_id,
        }] : []}
        onClose={() => setCopyTarget(null)}
        onCopy={handleCopy}
      />
    </>
  )
}

interface CommandCardProps {
  command: CommandConfig
  isExpanded: boolean
  isLoadingContent: boolean
  isDeleting: boolean
  content: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

function CommandCard({ command, isExpanded, isLoadingContent, isDeleting, content, onToggle, onEdit, onDelete, onCopy }: CommandCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={onToggle}
          className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
        >
          <Terminal className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white">
              /{command.command_id}
            </h4>
          </div>
          {command.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {command.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {command.allowed_tools && (
              <span className="flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {command.allowed_tools}
              </span>
            )}
            {command.argument_hint && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {command.argument_hint}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            title="Copy to another project"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
            title="Edit command"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className={cn(
              'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
              isDeleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete command"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <button onClick={onToggle} className="p-2">
            <ChevronRight
              className={cn(
                'w-5 h-5 text-gray-400 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {isLoadingContent ? (
            <div className="p-4 text-center text-gray-500">Loading content...</div>
          ) : content ? (
            <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {content}
            </pre>
          ) : (
            <div className="p-4 text-center text-gray-500">No content available</div>
          )}
        </div>
      )}
    </div>
  )
}
