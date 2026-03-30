import { useState, useEffect } from 'react'
import { X, Loader2, Server, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

export function MCPServerModal() {
  const {
    mcpModalMode,
    editingMCPServer,
    selectedProject,
    savingMCP,
    error,
    closeMCPModal,
    createMCPServer,
    updateMCPServer,
    clearError,
  } = useProjectConfigsStore()

  // Form state
  const [serverId, setServerId] = useState('')
  const [command, setCommand] = useState('npx')
  const [args, setArgs] = useState<string[]>([])
  const [argInput, setArgInput] = useState('')
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([])
  const [disabled, setDisabled] = useState(false)
  const [note, setNote] = useState('')

  // Reset form when modal opens/closes
  useEffect(() => {
    if (mcpModalMode === 'edit' && editingMCPServer) {
      setServerId(editingMCPServer.server_id)
      setCommand(editingMCPServer.command)
      setArgs(editingMCPServer.args)
      setEnvPairs(
        Object.entries(editingMCPServer.env).map(([key, value]) => ({ key, value }))
      )
      setDisabled(editingMCPServer.disabled)
      setNote(editingMCPServer.note)
    } else if (mcpModalMode === 'create') {
      setServerId('')
      setCommand('npx')
      setArgs([])
      setArgInput('')
      setEnvPairs([])
      setDisabled(false)
      setNote('')
    }
    clearError()
  }, [mcpModalMode, editingMCPServer, clearError])

  const handleAddArg = () => {
    if (argInput.trim()) {
      setArgs([...args, argInput.trim()])
      setArgInput('')
    }
  }

  const handleRemoveArg = (index: number) => {
    setArgs(args.filter((_, i) => i !== index))
  }

  const handleAddEnvPair = () => {
    setEnvPairs([...envPairs, { key: '', value: '' }])
  }

  const handleRemoveEnvPair = (index: number) => {
    setEnvPairs(envPairs.filter((_, i) => i !== index))
  }

  const handleEnvChange = (index: number, field: 'key' | 'value', value: string) => {
    setEnvPairs(
      envPairs.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    const env: Record<string, string> = {}
    envPairs.forEach((pair) => {
      if (pair.key.trim()) {
        env[pair.key.trim()] = pair.value
      }
    })

    if (mcpModalMode === 'create') {
      await createMCPServer(selectedProject.project.project_id, {
        server_id: serverId.trim(),
        command,
        args,
        env,
        disabled,
        note,
      })
    } else if (mcpModalMode === 'edit' && editingMCPServer) {
      await updateMCPServer(selectedProject.project.project_id, editingMCPServer.server_id, {
        command,
        args,
        env,
        disabled,
        note,
      })
    }
  }

  if (!mcpModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeMCPModal} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Server className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {mcpModalMode === 'create' ? 'Add MCP Server' : 'Edit MCP Server'}
            </h3>
          </div>
          <button
            onClick={closeMCPModal}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Server ID (create only) */}
          {mcpModalMode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Server ID *
              </label>
              <input
                type="text"
                value={serverId}
                onChange={(e) => setServerId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                placeholder="my-server"
                required
                pattern="[a-z0-9-_]+"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Lowercase letters, numbers, hyphens, and underscores only
              </p>
            </div>
          )}

          {/* Command */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Command *
            </label>
            <select
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="npx">npx</option>
              <option value="uvx">uvx</option>
              <option value="node">node</option>
              <option value="python">python</option>
            </select>
          </div>

          {/* Arguments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arguments
            </label>
            <div className="space-y-2">
              {args.map((arg, index) => (
                <div key={`arg-${arg}-${index}`} className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300">
                    {arg}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleRemoveArg(index)}
                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={argInput}
                  onChange={(e) => setArgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddArg()
                    }
                  }}
                  placeholder="Add argument..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddArg}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Environment Variables */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Environment Variables
            </label>
            <div className="space-y-2">
              {envPairs.map((pair, index) => (
                <div key={`env-${pair.key}-${index}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) => handleEnvChange(index, 'key', e.target.value)}
                    placeholder="KEY"
                    className="w-1/3 px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                  <span className="text-gray-500">=</span>
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) => handleEnvChange(index, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveEnvPair(index)}
                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddEnvPair}
                className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <Plus className="w-3 h-3" />
                Add environment variable
              </button>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about this server..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            />
          </div>

          {/* Disabled */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="disabled"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <label htmlFor="disabled" className="text-sm text-gray-700 dark:text-gray-300">
              Start disabled
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeMCPModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingMCP}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingMCP && <Loader2 className="w-4 h-4 animate-spin" />}
              {mcpModalMode === 'create' ? 'Create Server' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
