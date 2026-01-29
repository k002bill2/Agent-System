/**
 * RAG Query Panel Component
 * Provides semantic search interface for project codebase
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Database,
  FileCode,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  FileText,
  Hash,
  Filter,
  Info,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || ''

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RAGDocument {
  content: string
  source: string
  chunk_index?: number
  priority?: string
  score?: number
}

interface QueryResult {
  query: string
  documents: RAGDocument[]
  total_found: number
}

interface RAGStats {
  project_id: string
  collection_name: string
  document_count: number
  indexed: boolean
  error: string | null
}

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

async function queryRAG(
  projectId: string,
  query: string,
  k: number = 5,
  filterPriority?: string
): Promise<QueryResult> {
  const res = await fetch(`${API_BASE}/api/rag/projects/${projectId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      k,
      filter_priority: filterPriority || null,
    }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Query failed')
  }
  return res.json()
}

async function getRAGStats(projectId: string): Promise<RAGStats> {
  const res = await fetch(`${API_BASE}/api/rag/projects/${projectId}/stats`)
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to get stats')
  }
  return res.json()
}

async function deleteRAGIndex(projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rag/projects/${projectId}/index`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to delete index')
  }
}

async function reindexProject(projectId: string, forceReindex: boolean = true): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rag/projects/${projectId}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force_reindex: forceReindex }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to index project')
  }
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

interface RAGQueryPanelProps {
  projectId: string
  projectName: string
  className?: string
  onClose?: () => void
}

export function RAGQueryPanel({ projectId, projectName, className, onClose }: RAGQueryPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QueryResult | null>(null)
  const [stats, setStats] = useState<RAGStats | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isIndexing, setIsIndexing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search options
  const [resultCount, setResultCount] = useState(5)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)

  // Expanded results
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set())

  // Load stats on mount
  useEffect(() => {
    loadStats()
  }, [projectId])

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true)
    setError(null)
    try {
      const data = await getRAGStats(projectId)
      setStats(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingStats(false)
    }
  }, [projectId])

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)
    try {
      const data = await queryRAG(projectId, query, resultCount, priorityFilter || undefined)
      setResults(data)
      setExpandedResults(new Set())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSearching(false)
    }
  }, [projectId, query, resultCount, priorityFilter])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleReindex = async () => {
    if (!confirm('이 프로젝트를 다시 인덱싱하시겠습니까? 기존 인덱스가 교체됩니다.')) return

    setIsIndexing(true)
    setError(null)
    try {
      await reindexProject(projectId, true)
      await loadStats()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsIndexing(false)
    }
  }

  const handleDeleteIndex = async () => {
    if (!confirm('정말로 이 프로젝트의 인덱스를 삭제하시겠습니까? 검색 기능이 작동하지 않게 됩니다.')) return

    setIsLoadingStats(true)
    setError(null)
    try {
      await deleteRAGIndex(projectId)
      setStats(null)
      setResults(null)
      await loadStats()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingStats(false)
    }
  }

  const toggleResultExpanded = (index: number) => {
    setExpandedResults(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const getFileIcon = (source: string) => {
    const ext = source.split('.').pop()?.toLowerCase()
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-blue-500" />
    }
    if (['md', 'txt', 'rst'].includes(ext || '')) {
      return <FileText className="w-4 h-4 text-green-500" />
    }
    return <FileText className="w-4 h-4 text-gray-400" />
  }

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null
    const isHigh = priority === 'high'
    return (
      <span
        className={cn(
          'px-1.5 py-0.5 text-xs rounded font-medium',
          isHigh
            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        )}
      >
        {isHigh ? 'High Priority' : 'Normal'}
      </span>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            RAG 검색
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            - {projectName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm">
              {stats.indexed ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  {stats.document_count} 청크
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="w-4 h-4" />
                  인덱스 없음
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <button
            onClick={handleReindex}
            disabled={isIndexing || isLoadingStats}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="재인덱싱"
          >
            <RefreshCw className={cn('w-4 h-4', isIndexing && 'animate-spin')} />
          </button>

          <button
            onClick={handleDeleteIndex}
            disabled={isLoadingStats || !stats?.indexed}
            className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
            title="인덱스 삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="코드베이스에서 검색... (예: authentication logic, error handling)"
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isLoadingStats || !stats?.indexed}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          <button
            onClick={handleSearch}
            disabled={isSearching || !query.trim() || !stats?.indexed}
            className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSearching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            검색
          </button>
        </div>

        {/* Search Options Toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <Filter className="w-3.5 h-3.5" />
          검색 옵션
          {showOptions ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Search Options */}
        {showOptions && (
          <div className="flex flex-wrap gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">결과 수:</label>
              <select
                value={resultCount}
                onChange={(e) => setResultCount(Number(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {[3, 5, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">우선순위:</label>
              <select
                value={priorityFilter || ''}
                onChange={(e) => setPriorityFilter(e.target.value || null)}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">전체</option>
                <option value="high">High (CLAUDE.md, README 등)</option>
                <option value="normal">Normal</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Not Indexed Message */}
      {stats && !stats.indexed && (
        <div className="mt-6 text-center py-8">
          <Database className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            이 프로젝트는 아직 인덱싱되지 않았습니다.
          </p>
          <button
            onClick={handleReindex}
            disabled={isIndexing}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2 mx-auto"
          >
            {isIndexing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                인덱싱 중...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                지금 인덱싱
              </>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Hash className="w-4 h-4" />
              검색 결과 ({results.total_found}개)
            </h4>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              "{results.query}"
            </span>
          </div>

          {results.documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>검색 결과가 없습니다.</p>
              <p className="text-sm mt-1">다른 검색어로 시도해보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.documents.map((doc, index) => {
                const isExpanded = expandedResults.has(index)
                const source = doc.source || 'Unknown'
                const shortSource = source.split('/').slice(-2).join('/')

                return (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
                  >
                    {/* Result Header */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      onClick={() => toggleResultExpanded(index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(source)}
                        <span className="font-mono text-sm text-gray-700 dark:text-gray-300 truncate" title={source}>
                          {shortSource}
                        </span>
                        {getPriorityBadge(doc.priority)}
                        {doc.chunk_index !== undefined && (
                          <span className="text-xs text-gray-400">
                            청크 {doc.chunk_index + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.score !== undefined && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            유사도: {(doc.score * 100).toFixed(1)}%
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Result Content */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                        {/* File Path */}
                        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                          {source}
                        </div>

                        {/* Content Preview */}
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900/50 p-3 rounded overflow-x-auto max-h-80">
                          {doc.content}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      {!results && stats?.indexed && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">RAG 검색 사용 방법</p>
              <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
                <li>자연어로 코드베이스를 검색할 수 있습니다</li>
                <li>예: "인증 로직", "에러 처리 패턴", "API 엔드포인트"</li>
                <li>CLAUDE.md, README 등 중요 파일은 "High" 우선순위로 표시됩니다</li>
                <li>결과는 의미론적 유사도 순으로 정렬됩니다</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RAGQueryPanel
