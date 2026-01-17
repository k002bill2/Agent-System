import { useState, useEffect } from 'react'
import { X, Loader2, FolderPlus, Link, Pencil, FolderOpen } from 'lucide-react'
import { cn } from '../lib/utils'
import { useProjectsStore } from '../stores/projects'

export function ProjectFormModal() {
  const {
    modalMode,
    editingProject,
    templates,
    isLoading,
    error,
    closeModal,
    createProject,
    linkProject,
    updateProject,
  } = useProjectsStore()

  // Form state
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [editPath, setEditPath] = useState('')  // edit 모드에서 경로 수정용
  const [template, setTemplate] = useState('default')

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (modalMode === 'edit' && editingProject) {
      setId(editingProject.id)
      setName(editingProject.name)
      setDescription(editingProject.description)
      setEditPath(editingProject.path)
    } else if (modalMode === 'create' || modalMode === 'link') {
      setId('')
      setName('')
      setDescription('')
      setSourcePath('')
      setEditPath('')
      setTemplate('default')
    }
  }, [modalMode, editingProject])

  // Auto-generate ID from name
  const handleNameChange = (value: string) => {
    setName(value)
    if (modalMode !== 'edit') {
      const generatedId = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      setId(generatedId)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    switch (modalMode) {
      case 'create':
        await createProject(id, name, description, template)
        break
      case 'link':
        await linkProject(id, sourcePath)
        break
      case 'edit':
        // 경로가 변경되었는지 확인하고 전달
        const pathChanged = editPath !== editingProject?.path ? editPath : undefined
        await updateProject(editingProject!.id, name, description, pathChanged)
        break
    }
  }

  if (!modalMode) return null

  const titles = {
    create: 'Create New Project',
    link: 'Link Existing Project',
    edit: 'Edit Project',
  }

  const icons = {
    create: FolderPlus,
    link: Link,
    edit: Pencil,
  }

  const Icon = icons[modalMode]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {titles[modalMode]}
            </h3>
          </div>
          <button
            onClick={closeModal}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Template Selection (Create mode only) */}
          {modalMode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template
              </label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {templates.find((t) => t.id === template)?.description}
              </p>
            </div>
          )}

          {/* Source Path (Link mode only) */}
          {modalMode === 'link' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source Path *
              </label>
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="/absolute/path/to/project"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Absolute path to the project directory
              </p>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Project"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Project ID (not editable in edit mode) */}
          {modalMode !== 'edit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project ID *
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-project"
                required
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>
          )}

          {/* Project Path (edit mode only) */}
          {modalMode === 'edit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Project Path
                </div>
              </label>
              <input
                type="text"
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
                placeholder="/absolute/path/to/project"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Absolute path to the project directory. Changing this will update the symlink.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the project..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {modalMode === 'create' && 'Create Project'}
              {modalMode === 'link' && 'Link Project'}
              {modalMode === 'edit' && 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
