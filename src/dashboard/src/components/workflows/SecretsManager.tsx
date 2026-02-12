import { useState, useEffect } from 'react'
import { Plus, Trash2, Lock, X, Shield } from 'lucide-react'

interface Secret {
  id: string
  name: string
  scope: string
  scope_id?: string
  created_by?: string
  created_at: string
  updated_at: string
}

interface SecretsManagerProps {
  onClose?: () => void
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function SecretsManager({ onClose }: SecretsManagerProps) {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newScope, setNewScope] = useState('workflow')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSecrets()
  }, [])

  const fetchSecrets = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/secrets`)
      if (res.ok) {
        const data = await res.json()
        setSecrets(data.secrets || [])
      }
    } catch (e) {
      console.error('Failed to fetch secrets:', e)
    }
    setIsLoading(false)
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newValue.trim()) return
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, value: newValue, scope: newScope }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to create secret')
      }
      const secret = await res.json()
      setSecrets(prev => [secret, ...prev])
      setNewName('')
      setNewValue('')
      setShowAdd(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/secrets/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSecrets(prev => prev.filter(s => s.id !== id))
      }
    } catch (e) {
      console.error('Failed to delete secret:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[500px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Secrets</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <Plus className="w-4 h-4 text-gray-500" />
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Secret name"
                className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
              <select
                value={newScope}
                onChange={e => setNewScope(e.target.value)}
                className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              >
                <option value="workflow">Workflow</option>
                <option value="project">Project</option>
                <option value="global">Global</option>
              </select>
            </div>
            <input
              type="password"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder="Secret value"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Secret list */}
        <div className="flex-1 overflow-auto p-3">
          {isLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
          ) : secrets.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No secrets configured</p>
              <p className="text-xs mt-1">Click + to add a secret</p>
            </div>
          ) : (
            <div className="space-y-1">
              {secrets.map(secret => (
                <div
                  key={secret.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                >
                  <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-700 dark:text-gray-300">{secret.name}</p>
                    <p className="text-xs text-gray-400">
                      {secret.scope} · {new Date(secret.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-gray-400">••••••</span>
                  <button
                    onClick={() => handleDelete(secret.id)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
