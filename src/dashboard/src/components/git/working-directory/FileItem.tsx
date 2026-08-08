/**
 * 파일 한 줄 — diff 미리보기 · stage/unstage 버튼 · 민감 파일 배지.
 *
 * index.ts 는 재노출하지 않는다 (claude-sessions/TranscriptViewer 선례).
 */

import { Plus, Minus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GitStatusFile } from '@/stores/git'
import { checkSensitiveFile } from '@/utils/gitSafetyPatterns'
import { statusIcons, statusColors, statusLabels, sensitivityIcons, sensitivityColors } from './constants'

export function FileItem({
  file,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onToggleDiff,
  showDiff,
  diffContent,
  isLoadingDiff,
}: {
  file: GitStatusFile
  selected: boolean
  onSelect: (path: string) => void
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onToggleDiff: (path: string) => void
  showDiff: boolean
  diffContent?: string
  isLoadingDiff: boolean
}) {
  const Icon = statusIcons[file.status]
  const sensitivity = checkSensitiveFile(file.path)
  const SafetyIcon = sensitivityIcons[sensitivity.level]

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer group',
          selected && 'bg-primary-50 dark:bg-primary-900/20'
        )}
        onClick={() => onToggleDiff(file.path)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(file.path)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          onClick={(e) => e.stopPropagation()}
        />
        <Icon className={cn('w-4 h-4', statusColors[file.status])} />
        <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-300">
          {file.path}
        </span>
        {SafetyIcon && (
          <span title={sensitivity.reason}>
            <SafetyIcon className={cn('w-4 h-4', sensitivityColors[sensitivity.level])} />
          </span>
        )}
        <span
          className={cn(
            'text-xs font-bold px-1.5 py-0.5 rounded',
            statusColors[file.status]
          )}
        >
          {statusLabels[file.status]}
        </span>
        {/* Stage button for unstaged files */}
        {onStage && !file.staged && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStage(file.path)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
            title="Stage this file"
          >
            <Plus className="w-4 h-4 text-green-500" />
          </button>
        )}
        {/* Unstage button for staged files */}
        {onUnstage && file.staged && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnstage(file.path)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
            title="Unstage this file"
          >
            <Minus className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
      {/* Inline diff preview */}
      {showDiff && (
        <div className="ml-6 mr-3 mb-2 bg-gray-900 rounded-lg overflow-hidden text-xs max-h-60 overflow-y-auto">
          {isLoadingDiff ? (
            <div className="flex items-center gap-2 p-3 text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading diff...
            </div>
          ) : diffContent ? (
            <div>
              {diffContent.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-3 py-0.5',
                    line.startsWith('+') && !line.startsWith('+++') && 'bg-green-900/30 text-green-400',
                    line.startsWith('-') && !line.startsWith('---') && 'bg-red-900/30 text-red-400',
                    line.startsWith('@@') && 'bg-blue-900/30 text-blue-400',
                    !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && 'text-gray-500'
                  )}
                >
                  {line || ' '}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-gray-500">No diff available</div>
          )}
        </div>
      )}
    </div>
  )
}
