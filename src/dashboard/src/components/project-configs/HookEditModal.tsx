import { useState } from 'react'
import { X, Loader2, Webhook, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface HookEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (event: string, matcher: string, hooks: { type: string; command: string }[]) => Promise<boolean>
}

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
]

export function HookEditModal({ isOpen, onClose, onSave }: HookEditModalProps) {
  const [event, setEvent] = useState('PreToolUse')
  const [matcher, setMatcher] = useState('*')
  const [hooks, setHooks] = useState<{ type: string; command: string }[]>([
    { type: 'command', command: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddHook = () => {
    setHooks([...hooks, { type: 'command', command: '' }])
  }

  const handleRemoveHook = (index: number) => {
    if (hooks.length > 1) {
      setHooks(hooks.filter((_, i) => i !== index))
    }
  }

  const handleHookChange = (index: number, field: 'type' | 'command', value: string) => {
    setHooks(
      hooks.map((hook, i) => (i === index ? { ...hook, [field]: value } : hook))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    // Validate hooks
    const validHooks = hooks.filter((h) => h.command.trim())
    if (validHooks.length === 0) {
      setError('At least one hook command is required')
      setSaving(false)
      return
    }

    const success = await onSave(event, matcher, validHooks)
    if (success) {
      // Reset form
      setEvent('PreToolUse')
      setMatcher('*')
      setHooks([{ type: 'command', command: '' }])
      onClose()
    } else {
      setError('Failed to add hook')
    }
    setSaving(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Webhook className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add Hook
            </h3>
          </div>
          <button
            onClick={onClose}
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

          {/* Event */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Event *
            </label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {HOOK_EVENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              When the hook should trigger
            </p>
          </div>

          {/* Matcher */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Matcher Pattern
            </label>
            <input
              type="text"
              value={matcher}
              onChange={(e) => setMatcher(e.target.value)}
              placeholder="* (all) or specific tool name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use * for all tools, or specify tool names like "Bash", "Write", etc.
            </p>
          </div>

          {/* Hooks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Commands
            </label>
            <div className="space-y-2">
              {hooks.map((hook, index) => (
                <div key={`hook-${hook.type}-${index}`} className="flex items-start gap-2">
                  <select
                    value={hook.type}
                    onChange={(e) => handleHookChange(index, 'type', e.target.value)}
                    className="w-28 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  >
                    <option value="command">command</option>
                  </select>
                  <input
                    type="text"
                    value={hook.command}
                    onChange={(e) => handleHookChange(index, 'command', e.target.value)}
                    placeholder="Shell command to execute..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                  />
                  {hooks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveHook(index)}
                      className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddHook}
                className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <Plus className="w-3 h-3" />
                Add another command
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Hook
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
