import { AlertCircle, Loader2, RefreshCw, Terminal } from 'lucide-react'

export function LLMAccessCardHeader({
  loading,
  onRefresh,
}: {
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 min-w-0">
        <Terminal className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          LLM Access
        </h3>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh LLM access usage"
        className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}

export function LLMAccessError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function LLMAccessLoading() {
  return (
    <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">Loading internal usage...</span>
    </div>
  )
}
