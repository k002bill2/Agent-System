import { useEffect, useRef, useState } from 'react'
import { useClaudeSessionsStore, SortField } from '../../stores/claudeSessions'
import { SessionCard } from './SessionCard'
import { RefreshCw, Circle, CircleDot, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SessionStatus } from '../../types/claudeSession'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'last_activity', label: '마지막 활동' },
  { value: 'created_at', label: '생성일' },
  { value: 'message_count', label: '메시지 수' },
  { value: 'estimated_cost', label: '비용' },
  { value: 'project_name', label: '프로젝트명' },
]

interface SessionListProps {
  statusFilter?: SessionStatus
}

export function SessionList({ statusFilter }: SessionListProps) {
  const {
    sessions,
    totalCount,
    activeCount,
    isLoading,
    selectedSessionId,
    autoRefresh,
    refreshInterval,
    sortBy,
    sortOrder,
    fetchSessions,
    selectSession,
    setAutoRefresh,
    setSortBy,
    setSortOrder,
  } = useClaudeSessionsStore()

  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial fetch
  useEffect(() => {
    fetchSessions(statusFilter)
  }, [fetchSessions, statusFilter])

  // Close sort menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false)
      }
    }

    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSortMenu])

  const handleSortFieldChange = (field: SortField) => {
    if (field === sortBy) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
    }
    setShowSortMenu(false)
  }

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || '정렬'

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchSessions(statusFilter)
      }, refreshInterval * 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, fetchSessions, statusFilter])

  const handleRefresh = () => {
    fetchSessions(statusFilter)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Sessions
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {activeCount} active / {totalCount} total
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div ref={sortMenuRef} className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className={cn(
                'p-2 rounded-lg',
                'bg-gray-100 text-gray-600 hover:bg-gray-200',
                'dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600',
                'transition-colors'
              )}
              title={`정렬: ${currentSortLabel} (${sortOrder === 'desc' ? '내림차순' : '오름차순'})`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSortFieldChange(option.value)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm',
                      'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                      sortBy === option.value
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <span>{option.label}</span>
                    {sortBy === option.value && (
                      sortOrder === 'desc' ? (
                        <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUp className="w-3.5 h-3.5" />
                      )
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              autoRefresh
                ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            )}
            title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          >
            {autoRefresh ? (
              <CircleDot className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          {/* Manual refresh */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200',
              'dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600',
              'transition-colors disabled:opacity-50'
            )}
            title="Refresh"
          >
            <RefreshCw
              className={cn('w-4 h-4', isLoading && 'animate-spin')}
            />
          </button>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && sessions.length === 0 ? (
          // Loading skeleton
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
            <p className="text-sm">No sessions found</p>
            <p className="text-xs mt-1">
              Start a Claude Code session in another terminal
            </p>
          </div>
        ) : (
          // Session cards
          sessions.map((session) => (
            <SessionCard
              key={session.session_id}
              session={session}
              isSelected={selectedSessionId === session.session_id}
              onClick={() => selectSession(session.session_id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
