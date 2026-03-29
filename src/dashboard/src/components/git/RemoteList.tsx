import { useState } from 'react'
import {
  Cloud,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Download,
  Upload,
  ExternalLink,
  X,
  Check,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { GitRemote } from '../../stores/git'

interface RemoteListProps {
  remotes: GitRemote[]
  isLoading: boolean
  onAddRemote: (name: string, url: string) => Promise<boolean>
  onRemoveRemote: (name: string) => Promise<boolean>
  onUpdateRemote: (name: string, updates: { new_name?: string; url?: string }) => Promise<boolean>
  onFetch: (remote?: string) => Promise<boolean>
  onPull: (branch?: string, remote?: string) => Promise<boolean>
  onPush: (branch?: string, remote?: string) => Promise<boolean>
  onRefresh: () => void
}

export function RemoteList({
  remotes,
  isLoading,
  onAddRemote,
  onRemoveRemote,
  onUpdateRemote,
  onFetch,
  onPull,
  onPush,
  onRefresh,
}: RemoteListProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingRemote, setEditingRemote] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return
    setAdding(true)
    const success = await onAddRemote(newName.trim(), newUrl.trim())
    if (success) {
      setShowAddModal(false)
      setNewName('')
      setNewUrl('')
    }
    setAdding(false)
  }

  const handleRemove = async (name: string) => {
    if (confirm(`Remote '${name}'을(를) 삭제하시겠습니까?`)) {
      await onRemoveRemote(name)
    }
  }

  const handleStartEdit = (remote: GitRemote) => {
    setEditingRemote(remote.name)
    setEditUrl(remote.url)
  }

  const handleSaveEdit = async (name: string) => {
    if (!editUrl.trim()) return
    const success = await onUpdateRemote(name, { url: editUrl.trim() })
    if (success) {
      setEditingRemote(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingRemote(null)
    setEditUrl('')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Remotes
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({remotes.length})
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Remote
          </button>
        </div>
      </div>

      {/* Remote List */}
      {remotes.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Cloud className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>등록된 remote가 없습니다</p>
          <p className="text-sm mt-1">Add Remote 버튼으로 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {remotes.map((remote) => (
            <div
              key={remote.name}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {remote.name}
                    </span>
                    {remote.name === 'origin' && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                        default
                      </span>
                    )}
                  </div>

                  {editingRemote === remote.name ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(remote.name)
                          if (e.key === 'Escape') handleCancelEdit()
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(remote.name)}
                        className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                      {remote.url}
                    </p>
                  )}

                  {remote.fetch_url && remote.push_url && remote.fetch_url !== remote.push_url && (
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                      <div>fetch: {remote.fetch_url}</div>
                      <div>push: {remote.push_url}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                  <button
                    onClick={() => onFetch(remote.name)}
                    disabled={isLoading}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title={`Fetch from ${remote.name}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPull(undefined, remote.name)}
                    disabled={isLoading}
                    className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title={`Pull from ${remote.name}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPush(undefined, remote.name)}
                    disabled={isLoading}
                    className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title={`Push to ${remote.name}`}
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  {editingRemote !== remote.name && (
                    <button
                      onClick={() => handleStartEdit(remote)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Edit URL"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {remote.name !== 'origin' && (
                    <button
                      onClick={() => handleRemove(remote.name)}
                      disabled={isLoading}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title={`Remove ${remote.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {remote.url.startsWith('http') && (
                    <a
                      href={remote.url.replace(/\.git$/, '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Open in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Remote Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Add Remote
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="upstream"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL *
                </label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewName('')
                  setNewUrl('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim() || !newUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {adding ? 'Adding...' : 'Add Remote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
