import { useEffect, useRef, useState, useCallback } from 'react'
import { useClaudeSessionsStore, SortField } from '../../stores/claudeSessions'
import { SessionCard } from './SessionCard'
import { RefreshCw, Circle, CircleDot, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Search, FolderOpen, X, Check, Users, Loader2, Sparkles } from 'lucide-react'
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
    filteredCount,
    activeCount,
    isLoading,
    hasMore,
    isLoadingMore,
    selectedSessionId,
    autoRefresh,
    refreshInterval,
    sortBy,
    sortOrder,
    projectFilter,
    sourceUserFilter,
    sourceUsers,
    currentUser,
    searchQuery,
    fetchSessions,
    loadMoreSessions,
    refreshSessions,
    fetchSourceUsers,
    selectSession,
    setAutoRefresh,
    setSortBy,
    setSortOrder,
    setProjectFilter,
    setSourceUserFilter,
    setSearchQuery,
    getFilteredSessions,
    getUniqueProjects,
    deleteEmptySessions,
    deleteGhostSessions,
    getEmptySessionsCount,
    getGhostSessionsCount,
    // Batch summary
    isBatchGenerating,
    batchProgress,
    pendingSummaryCount,
    fetchPendingSummaryCount,
    generateBatchSummaries,
  } = useClaudeSessionsStore()

  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isDeletingEmpty, setIsDeletingEmpty] = useState(false)
  const [isDeletingGhost, setIsDeletingGhost] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const emptyCount = getEmptySessionsCount()
  const ghostCount = getGhostSessionsCount()
  const deletableCount = emptyCount + ghostCount
  const uniqueProjects = getUniqueProjects()
  const filteredSessions = getFilteredSessions()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Initial fetch
  useEffect(() => {
    fetchSessions(statusFilter, true)
    fetchSourceUsers()
    fetchPendingSummaryCount()
  }, [fetchSessions, fetchSourceUsers, fetchPendingSummaryCount, statusFilter])

  // Infinite scroll with IntersectionObserver
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      loadMoreSessions(statusFilter)
    }
  }, [isLoadingMore, hasMore, loadMoreSessions, statusFilter])

  useEffect(() => {
    const currentRef = loadMoreRef.current
    const scrollContainer = scrollContainerRef.current
    if (!currentRef || !scrollContainer || !hasMore || isLoadingMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          handleLoadMore()
        }
      },
      {
        root: scrollContainer,  // Use scroll container as root
        threshold: 0.1,
        rootMargin: '100px'
      }
    )

    observer.observe(currentRef)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, handleLoadMore])

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

  // Close project menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false)
      }
    }

    if (showProjectMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProjectMenu])

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

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

  // Auto-refresh polling (uses soft refresh to preserve loaded sessions)
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        refreshSessions(statusFilter)
      }, refreshInterval * 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, refreshSessions, statusFilter])

  const handleRefresh = () => {
    fetchSessions(statusFilter, true)  // Full refresh resets to first page
  }

  const handleDeleteDeletable = async () => {
    if (deletableCount === 0) return

    const message = []
    if (emptyCount > 0) message.push(`빈 세션 ${emptyCount}개`)
    if (ghostCount > 0) message.push(`유령 세션 ${ghostCount}개`)
    if (!confirm(`${message.join(' + ')}를 삭제하시겠습니까?\n\n유령 세션: 메시지 카운터만 있고 실제 대화가 없는 세션`)) return

    let totalDeleted = 0

    if (emptyCount > 0) {
      setIsDeletingEmpty(true)
      try {
        const result = await deleteEmptySessions()
        totalDeleted += result.deletedCount
      } finally {
        setIsDeletingEmpty(false)
      }
    }

    if (ghostCount > 0) {
      setIsDeletingGhost(true)
      try {
        const result = await deleteGhostSessions()
        totalDeleted += result.deletedCount
      } finally {
        setIsDeletingGhost(false)
      }
    }

    if (totalDeleted > 0) {
      alert(`총 ${totalDeleted}개의 세션이 삭제되었습니다.`)
    }
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
            {activeCount} active / {sessions.length} loaded / {filteredCount} total
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Batch generate summaries button */}
          {pendingSummaryCount > 0 && (
            <button
              onClick={() => generateBatchSummaries(50)}
              disabled={isBatchGenerating}
              className={cn(
                'p-2 rounded-lg transition-colors flex items-center gap-1',
                'bg-amber-100 text-amber-600 hover:bg-amber-200',
                'dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40',
                'disabled:opacity-50'
              )}
              title={isBatchGenerating
                ? `요약 생성 중: ${batchProgress.processed}/${batchProgress.total}`
                : `미요약 세션 ${pendingSummaryCount}개 일괄 요약 생성`
              }
            >
              {isBatchGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="text-xs font-medium">
                {isBatchGenerating ? `${batchProgress.processed}/${batchProgress.total}` : pendingSummaryCount}
              </span>
            </button>
          )}

          {/* Delete empty/ghost sessions button */}
          {deletableCount > 0 && (
            <button
              onClick={handleDeleteDeletable}
              disabled={isDeletingEmpty || isDeletingGhost}
              className={cn(
                'p-2 rounded-lg transition-colors flex items-center gap-1',
                'bg-red-100 text-red-600 hover:bg-red-200',
                'dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40',
                'disabled:opacity-50'
              )}
              title={`삭제 가능: 빈 ${emptyCount}개 + 유령 ${ghostCount}개`}
            >
              <Trash2 className={cn('w-4 h-4', (isDeletingEmpty || isDeletingGhost) && 'animate-pulse')} />
              <span className="text-xs font-medium">{deletableCount}</span>
            </button>
          )}

          {/* Source user filter dropdown */}
          {sourceUsers.length > 1 && (
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  sourceUserFilter
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                )}
                title={sourceUserFilter ? `사용자: ${sourceUserFilter}` : '사용자 필터'}
              >
                <Users className="w-4 h-4" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSourceUserFilter(null)
                      setShowUserMenu(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm',
                      'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                      !sourceUserFilter
                        ? 'text-purple-600 dark:text-purple-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <span>전체 사용자</span>
                    {!sourceUserFilter && <Check className="w-4 h-4" />}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  {sourceUsers.map((user) => (
                    <button
                      key={user}
                      onClick={() => {
                        setSourceUserFilter(user)
                        setShowUserMenu(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm',
                        'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                        sourceUserFilter === user
                          ? 'text-purple-600 dark:text-purple-400 font-medium'
                          : 'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="truncate flex items-center gap-1">
                        {user}
                        {user === currentUser && (
                          <span className="text-xs text-gray-400">(나)</span>
                        )}
                      </span>
                      {sourceUserFilter === user && <Check className="w-4 h-4 flex-shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project filter dropdown */}
          {uniqueProjects.length > 0 && (
            <div ref={projectMenuRef} className="relative">
              <button
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  projectFilter
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                )}
                title={projectFilter ? `프로젝트: ${projectFilter}` : '프로젝트 필터'}
              >
                <FolderOpen className="w-4 h-4" />
              </button>

              {showProjectMenu && (
                <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      setProjectFilter(null)
                      setShowProjectMenu(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm',
                      'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                      !projectFilter
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <span>전체</span>
                    {!projectFilter && <Check className="w-4 h-4" />}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  {uniqueProjects.map((project) => (
                    <button
                      key={project}
                      onClick={() => {
                        setProjectFilter(project)
                        setShowProjectMenu(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm',
                        'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                        projectFilter === project
                          ? 'text-blue-600 dark:text-blue-400 font-medium'
                          : 'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="truncate">{project}</span>
                      {projectFilter === project && <Check className="w-4 h-4 flex-shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

      {/* Search Bar */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="세션 검색..."
            className={cn(
              'w-full pl-9 pr-8 py-2 text-sm rounded-lg',
              'bg-gray-100 dark:bg-gray-700',
              'text-gray-900 dark:text-white',
              'placeholder-gray-500 dark:placeholder-gray-400',
              'border border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
              'outline-none transition-colors'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Session List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
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
        ) : filteredSessions.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
            {sessions.length === 0 ? (
              <>
                <p className="text-sm">No sessions found</p>
                <p className="text-xs mt-1">
                  Start a Claude Code session in another terminal
                </p>
              </>
            ) : (
              <>
                <p className="text-sm">검색 결과 없음</p>
                <p className="text-xs mt-1">
                  다른 검색어를 시도해보세요
                </p>
              </>
            )}
          </div>
        ) : (
          // Session cards
          <>
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.session_id}
                session={session}
                isSelected={selectedSessionId === session.session_id}
                onClick={() => selectSession(session.session_id)}
              />
            ))}

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-4"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                ) : (
                  <button
                    onClick={handleLoadMore}
                    className={cn(
                      'px-4 py-2 text-sm rounded-lg transition-colors',
                      'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      'dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    )}
                  >
                    Load More ({filteredCount - sessions.length} remaining)
                  </button>
                )}
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && sessions.length > 0 && (
              <div className="text-center py-3 text-xs text-gray-400 dark:text-gray-500">
                {sessions.length} sessions loaded
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
