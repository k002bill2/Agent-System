import { memo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Brain, ChevronRight, ChevronDown, Plus, Pencil, Trash2, FileText, Clock, Save, Loader2 } from 'lucide-react'
import { useProjectConfigsStore, MemoryConfig } from '@/stores/projectConfigs'
import { MemoryEditModal } from './MemoryEditModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'

const MEMORY_TYPE_COLORS: Record<string, string> = {
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  feedback: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  project: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reference: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export const MemoryTab: React.FC = memo(() => {
  const {
    selectedProject,
    isLoadingProject,
    openMemoryModal,
    deleteMemory,
    deletingMemories,
    memoryContent,
    memoryIndex,
    isLoadingContent,
    fetchMemoryContent,
    fetchMemoryIndex,
    updateMemoryIndex,
    savingMemory,
  } = useProjectConfigsStore()
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MemoryConfig | null>(null)
  const [indexExpanded, setIndexExpanded] = useState(false)
  const [editingIndex, setEditingIndex] = useState(false)
  const [indexContent, setIndexContent] = useState('')

  useEffect(() => {
    if (selectedProject && indexExpanded && memoryIndex === null) {
      fetchMemoryIndex(selectedProject.project.project_id)
    }
  }, [selectedProject, indexExpanded, memoryIndex, fetchMemoryIndex])

  useEffect(() => {
    if (memoryIndex !== null) {
      setIndexContent(memoryIndex)
    }
  }, [memoryIndex])

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
        Select a project to view memory
      </div>
    )
  }

  const { memories } = selectedProject

  const handleExpand = async (memory: MemoryConfig) => {
    if (expandedMemory === memory.memory_id) {
      setExpandedMemory(null)
    } else {
      setExpandedMemory(memory.memory_id)
      await fetchMemoryContent(memory.project_id, memory.memory_id)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !selectedProject) return
    await deleteMemory(selectedProject.project.project_id, deleteTarget.memory_id)
    setDeleteTarget(null)
  }

  const handleSaveIndex = async () => {
    if (!selectedProject) return
    const success = await updateMemoryIndex(selectedProject.project.project_id, indexContent)
    if (success) {
      setEditingIndex(false)
    }
  }

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-rose-500" />
            Memory ({memories.length})
          </h3>
          <button
            onClick={() => openMemoryModal('create')}
            aria-label="Create new memory"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700"
          >
            <Plus className="w-4 h-4" />
            Create Memory
          </button>
        </div>

        {/* Memory Index Section */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setIndexExpanded(!indexExpanded)}
            aria-label="Toggle MEMORY.md index"
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
              <FileText className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1 text-left">
              <h4 className="font-medium text-gray-900 dark:text-white">MEMORY.md</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Auto-memory index file</p>
            </div>
            {indexExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {indexExpanded && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {isLoadingContent && memoryIndex === null ? (
                <div className="p-4 text-center text-gray-500">Loading index...</div>
              ) : editingIndex ? (
                <div className="p-4 space-y-3">
                  <textarea
                    value={indexContent}
                    onChange={(e) => setIndexContent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-h-[200px] resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingIndex(false)
                        setIndexContent(memoryIndex ?? '')
                      }}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveIndex}
                      disabled={savingMemory}
                      aria-label="Save memory index"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50"
                    >
                      {savingMemory ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  {memoryIndex ? (
                    <div className="relative group">
                      <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                        {memoryIndex}
                      </pre>
                      <button
                        onClick={() => setEditingIndex(true)}
                        aria-label="Edit memory index"
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No MEMORY.md index found</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Memory Cards */}
        {memories.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No memory entries found in this project</p>
            <p className="text-sm mt-1">Click &quot;Create Memory&quot; to add one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {memories.map((memory) => (
              <MemoryCard
                key={memory.memory_id}
                memory={memory}
                isExpanded={expandedMemory === memory.memory_id}
                isLoadingContent={isLoadingContent && expandedMemory === memory.memory_id}
                isDeleting={deletingMemories.has(`${memory.project_id}:${memory.memory_id}`)}
                content={expandedMemory === memory.memory_id ? memoryContent : null}
                onToggle={() => handleExpand(memory)}
                onEdit={() => openMemoryModal('edit', memory)}
                onDelete={() => setDeleteTarget(memory)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <MemoryEditModal />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete Memory"
        message="Are you sure you want to delete this memory entry? This action cannot be undone."
        itemName={deleteTarget?.memory_id || ''}
        isDeleting={deleteTarget ? deletingMemories.has(`${selectedProject?.project.project_id}:${deleteTarget.memory_id}`) : false}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
})

MemoryTab.displayName = 'MemoryTab'

// ---------- Sub-component ----------

interface MemoryCardProps {
  memory: MemoryConfig
  isExpanded: boolean
  isLoadingContent: boolean
  isDeleting: boolean
  content: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

const MemoryCard: React.FC<MemoryCardProps> = memo(({
  memory, isExpanded, isLoadingContent, isDeleting, content, onToggle, onEdit, onDelete,
}) => {
  const typeColor = MEMORY_TYPE_COLORS[memory.memory_type] || MEMORY_TYPE_COLORS.user

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={onToggle}
          aria-label={`Toggle memory ${memory.name}`}
          className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
        >
          <Brain className="w-5 h-5 text-rose-600 dark:text-rose-400" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 dark:text-white">{memory.name}</h4>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', typeColor)}>
              {memory.memory_type}
            </span>
          </div>
          {memory.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {memory.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {memory.file_path && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {memory.file_path.split('/').pop()}
              </span>
            )}
            {memory.modified_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(memory.modified_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Edit memory"
            className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
            title="Edit memory"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="Delete memory"
            className={cn(
              'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
              isDeleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete memory"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <button onClick={onToggle} aria-label="Expand memory details" className="p-2">
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
})

MemoryCard.displayName = 'MemoryCard'
