import { useEffect, useState, useMemo } from 'react'
import { useClaudeSessionsStore } from '../../stores/claudeSessions'
import { cn } from '../../lib/utils'
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  User,
  Bot,
  Wrench,
  CheckCircle,
  Search,
  Filter,
  Loader2,
  Brain,
} from 'lucide-react'
import { TranscriptEntry } from '../../types/claudeSession'

type FilterType = 'all' | 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking'

const filterOptions: { value: FilterType; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: null },
  { value: 'user', label: 'User', icon: <User className="w-3 h-3" /> },
  { value: 'assistant', label: 'Assistant', icon: <Bot className="w-3 h-3" /> },
  { value: 'tool_use', label: 'Tool Use', icon: <Wrench className="w-3 h-3" /> },
  { value: 'tool_result', label: 'Tool Result', icon: <CheckCircle className="w-3 h-3" /> },
  { value: 'thinking', label: 'Thinking', icon: <Brain className="w-3 h-3" /> },
]

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}

function getEntryTypeLabel(entry: TranscriptEntry): { type: string; detail?: string } {
  const msgType = entry.type

  if (msgType === 'user') {
    // Check if it's a tool_result
    const content = entry.message?.content
    if (Array.isArray(content)) {
      const hasToolResult = content.some(
        (c: unknown) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'tool_result'
      )
      if (hasToolResult) return { type: 'tool_result', detail: 'Tool Result' }
    }
    return { type: 'user', detail: 'User Message' }
  }

  if (msgType === 'assistant') {
    const content = entry.message?.content
    if (Array.isArray(content)) {
      // Thinking 감지
      const hasThinking = content.some(
        (c: unknown) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'thinking'
      )
      if (hasThinking) return { type: 'thinking', detail: 'Thinking' }

      // Tool Use 감지
      const toolUse = content.find(
        (c: unknown) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'tool_use'
      ) as { name?: string } | undefined
      if (toolUse) {
        return { type: 'tool_use', detail: toolUse.name || 'Tool' }
      }
    }
    return { type: 'assistant', detail: 'Text' }
  }

  return { type: msgType, detail: msgType }
}

function getEntryIcon(type: string) {
  switch (type) {
    case 'user':
      return <User className="w-4 h-4 text-blue-500" />
    case 'assistant':
      return <Bot className="w-4 h-4 text-purple-500" />
    case 'tool_use':
      return <Wrench className="w-4 h-4 text-orange-500" />
    case 'tool_result':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'thinking':
      return <Brain className="w-4 h-4 text-pink-500" />
    default:
      return <Bot className="w-4 h-4 text-gray-500" />
  }
}

interface JsonTreeProps {
  data: unknown
  depth?: number
  maxDepth?: number
}

function JsonTree({ data, depth = 0, maxDepth = 6 }: JsonTreeProps) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (depth >= maxDepth) {
    return <span className="text-gray-500 italic">...</span>
  }

  if (data === null) {
    return <span className="text-red-500 dark:text-red-400">null</span>
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-600 dark:text-purple-400">{data.toString()}</span>
  }

  if (typeof data === 'number') {
    return <span className="text-blue-600 dark:text-blue-400">{data}</span>
  }

  if (typeof data === 'string') {
    // Truncate long strings
    const displayStr = data.length > 500 ? data.slice(0, 500) + '...' : data
    return (
      <span className="text-green-600 dark:text-green-400 break-all whitespace-pre-wrap">
        "{displayStr}"
      </span>
    )
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>

    return (
      <div className="inline">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="ml-1">Array({data.length})</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-gray-300 dark:border-gray-600 pl-2">
            {data.map((item, index) => (
              <div key={`arr-${depth}-${index}`} className="my-1">
                <span className="text-gray-500">{index}: </span>
                <JsonTree data={item} depth={depth + 1} maxDepth={maxDepth} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>)
    if (keys.length === 0) return <span className="text-gray-500">{'{}'}</span>

    return (
      <div className="inline">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="ml-1">Object({keys.length})</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-gray-300 dark:border-gray-600 pl-2">
            {keys.map((key) => (
              <div key={key} className="my-1">
                <span className="text-amber-600 dark:text-yellow-400">"{key}"</span>
                <span className="text-gray-500">: </span>
                <JsonTree
                  data={(data as Record<string, unknown>)[key]}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return <span className="text-gray-500">{String(data)}</span>
}

interface TranscriptEntryItemProps {
  entry: TranscriptEntry
  index: number
}

function TranscriptEntryItem({ entry, index }: TranscriptEntryItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { type, detail } = getEntryTypeLabel(entry)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          'hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors',
          expanded && 'bg-gray-100 dark:bg-gray-700/30'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className="text-gray-500 text-sm w-8">#{index + 1}</span>
        {getEntryIcon(type)}
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
          {type}
          {detail && type !== detail && (
            <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
              {detail}
            </span>
          )}
        </span>
        <span className="text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
          <div className="text-xs">
            <JsonTree data={entry.message} />
          </div>
        </div>
      )}
    </div>
  )
}

const ITEMS_PER_PAGE = 50

export function TranscriptViewer() {
  const {
    selectedSessionId,
    transcriptEntries,
    transcriptTotalCount,
    transcriptHasMore,
    isLoadingTranscript,
    fetchTranscript,
    clearTranscript,
  } = useClaudeSessionsStore()

  const [filter, setFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Fetch transcript when session changes
  useEffect(() => {
    if (selectedSessionId) {
      clearTranscript()
      setCurrentPage(1)
      fetchTranscript(selectedSessionId, 0, ITEMS_PER_PAGE)
    }
  }, [selectedSessionId, fetchTranscript, clearTranscript])

  // Filter and search entries
  const filteredEntries = useMemo(() => {
    return transcriptEntries.filter((entry) => {
      // Type filter
      if (filter !== 'all') {
        const { type } = getEntryTypeLabel(entry)
        if (type !== filter) return false
      }

      // Search filter
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase()
        const jsonStr = JSON.stringify(entry).toLowerCase()
        if (!jsonStr.includes(searchLower)) return false
      }

      return true
    })
  }, [transcriptEntries, filter, searchQuery])

  // Pagination
  const totalPages = Math.ceil(transcriptTotalCount / ITEMS_PER_PAGE)

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1
      setCurrentPage(newPage)
      const offset = (newPage - 1) * ITEMS_PER_PAGE
      if (selectedSessionId) {
        fetchTranscript(selectedSessionId, offset, ITEMS_PER_PAGE)
      }
    }
  }

  const handleNextPage = () => {
    if (transcriptHasMore || currentPage < totalPages) {
      const newPage = currentPage + 1
      setCurrentPage(newPage)
      const offset = (newPage - 1) * ITEMS_PER_PAGE
      if (selectedSessionId) {
        fetchTranscript(selectedSessionId, offset, ITEMS_PER_PAGE)
      }
    }
  }

  if (!selectedSessionId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a session to view transcript
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter & Search Bar */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-3">
        {/* Filter buttons */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <div className="flex gap-1 flex-wrap">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                  filter === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search content, tool names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingTranscript ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {searchQuery || filter !== 'all'
              ? 'No entries match your filters'
              : 'No transcript entries'}
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <TranscriptEntryItem
              key={`${entry.timestamp}-${index}`}
              entry={entry}
              index={(currentPage - 1) * ITEMS_PER_PAGE + index}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {transcriptTotalCount} total entries
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isLoadingTranscript}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
              currentPage <= 1 || isLoadingTranscript
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage}/{Math.max(1, totalPages)}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!transcriptHasMore || isLoadingTranscript}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
              !transcriptHasMore || isLoadingTranscript
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            )}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
