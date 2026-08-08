/**
 * Staged 변경 전체 diff 리뷰 패널 — WorkingDirectory 내부 전용.
 */

import { useState, useMemo } from 'react'
import { Eye, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calcDiffStats } from '@/utils/diffParser'

export function StagedDiffReviewPanel({
  stagedDiff,
  isLoading,
  onFetch,
}: {
  stagedDiff: string | null
  isLoading: boolean
  onFetch: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const stats = useMemo(() => stagedDiff ? calcDiffStats(stagedDiff) : null, [stagedDiff])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
      <button
        onClick={() => {
          if (!isExpanded && !stagedDiff) onFetch()
          setIsExpanded(!isExpanded)
        }}
        className="w-full px-4 py-3 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-700 dark:text-blue-400 text-sm">
            Review Staged Changes
          </span>
          {stats && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({stats.files} file{stats.files !== 1 ? 's' : ''}, +{stats.additions} -{stats.deletions})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        )}
      </button>
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto bg-gray-900 text-xs">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading staged diff...
            </div>
          ) : stagedDiff ? (
            stagedDiff.split('\n').map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-4 py-0.5',
                  line.startsWith('+') && !line.startsWith('+++') && 'bg-green-900/30 text-green-400',
                  line.startsWith('-') && !line.startsWith('---') && 'bg-red-900/30 text-red-400',
                  line.startsWith('@@') && 'bg-blue-900/30 text-blue-400',
                  line.startsWith('diff --git') && 'bg-gray-800 text-gray-300 font-bold mt-2',
                  !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && !line.startsWith('diff') && 'text-gray-500'
                )}
              >
                {line || ' '}
              </div>
            ))
          ) : (
            <div className="p-4 text-gray-500">No staged changes</div>
          )}
        </div>
      )}
    </div>
  )
}
