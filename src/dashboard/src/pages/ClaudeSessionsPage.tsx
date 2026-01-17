import { useEffect } from 'react'
import { SessionList, SessionDetails } from '../components/claude-sessions'
import { useClaudeSessionsStore } from '../stores/claudeSessions'

export function ClaudeSessionsPage() {
  const { stopStreaming, clearError, error } = useClaudeSessionsStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming()
    }
  }, [stopStreaming])

  return (
    <div className="flex h-full w-full">
      {/* Error banner */}
      {error && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-700 dark:text-red-300">
              {error}
            </span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Left panel - Session list */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <SessionList />
      </div>

      {/* Right panel - Session details */}
      <div className="flex-1 bg-white dark:bg-gray-800 overflow-hidden">
        <SessionDetails />
      </div>
    </div>
  )
}
