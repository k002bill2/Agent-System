import { useEffect, useState } from 'react'
import { SessionList, SessionDetails, ProcessCleanupPanel } from '../components/claude-sessions'
import { useClaudeSessionsStore } from '../stores/claudeSessions'

export function ClaudeSessionsPage() {
  const stopStreaming = useClaudeSessionsStore(s => s.stopStreaming)
  const clearError = useClaudeSessionsStore(s => s.clearError)
  const error = useClaudeSessionsStore(s => s.error)
  const [showProcessPanel, setShowProcessPanel] = useState(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming()
    }
  }, [stopStreaming])

  return (
    <div className="flex h-full w-full relative">
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
      <div className="w-[420px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <SessionList />
      </div>

      {/* Right panel - Session details or Process panel */}
      <div className="flex-1 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
        {/* Tab header */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
          <button
            onClick={() => setShowProcessPanel(false)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              !showProcessPanel
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Session Details
          </button>
          <button
            onClick={() => setShowProcessPanel(true)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              showProcessPanel
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            Process Manager
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {showProcessPanel ? (
            <div className="p-4">
              <ProcessCleanupPanel />
            </div>
          ) : (
            <SessionDetails />
          )}
        </div>
      </div>
    </div>
  )
}
