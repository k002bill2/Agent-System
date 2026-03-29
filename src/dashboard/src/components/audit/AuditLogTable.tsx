import { useState, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Filter,
  Loader2,
} from 'lucide-react'

// Types
export interface AuditLogEntry {
  id: string
  session_id: string | null
  user_id: string | null
  project_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  changes: Record<string, unknown> | null
  agent_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  status: string
  error_message: string | null
  created_at: string
}

export interface AuditLogResponse {
  logs: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

export interface AuditLogFilter {
  session_id?: string
  user_id?: string
  project_id?: string
  action?: string
  resource_type?: string
  status?: string
  start_date?: string
  end_date?: string
}

interface AuditLogTableProps {
  sessionId?: string
  projectId?: string
  includeGlobal?: boolean
  className?: string
}

// Status icons and colors
const statusConfig: Record<string, { icon: typeof CheckCircle; color: string }> = {
  success: { icon: CheckCircle, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
  denied: { icon: AlertTriangle, color: 'text-yellow-500' },
}

// Action color mapping
const actionColors: Record<string, string> = {
  created: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resumed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  granted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  executed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  login: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  logout: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
  registered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  refreshed: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  changed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(actionColors)) {
    if (action.toLowerCase().includes(key)) {
      return color
    }
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
}

interface FilterOption {
  value: string
  label: string
}

export function AuditLogTable({ sessionId, projectId, includeGlobal = true, className }: AuditLogTableProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<AuditLogFilter>({})
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(0)
  const [availableActions, setAvailableActions] = useState<FilterOption[]>([])
  const [availableResourceTypes, setAvailableResourceTypes] = useState<FilterOption[]>([])
  const pageSize = 20

  // Fetch filter options from API
  useEffect(() => {
    fetch('/api/audit/actions')
      .then((r) => r.json())
      .then((d) => setAvailableActions(d.actions || []))
      .catch(() => {})
    fetch('/api/audit/resource-types')
      .then((r) => r.json())
      .then((d) => setAvailableResourceTypes(d.resource_types || []))
      .catch(() => {})
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (sessionId) params.set('session_id', sessionId)
      if (projectId) params.set('project_id', projectId)
      if (projectId) params.set('include_global', String(includeGlobal))
      if (filter.action) params.set('action', filter.action)
      if (filter.resource_type) params.set('resource_type', filter.resource_type)
      if (filter.status) params.set('status', filter.status)
      if (filter.start_date) params.set('start_date', filter.start_date)
      if (filter.end_date) params.set('end_date', filter.end_date)
      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))

      const res = await fetch(`/api/audit?${params}`)
      if (!res.ok) throw new Error('Failed to fetch audit logs')

      const data: AuditLogResponse = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sessionId, projectId, includeGlobal, filter, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExport = async (format: 'json' | 'csv') => {
    const params = new URLSearchParams()
    params.set('format', format)
    if (sessionId) params.set('session_id', sessionId)
    if (projectId) params.set('project_id', projectId)
    if (filter.action) params.set('action', filter.action)
    if (filter.resource_type) params.set('resource_type', filter.resource_type)

    window.open(`/api/audit/export?${params}`, '_blank')
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h3 className="font-medium text-gray-900 dark:text-white">Audit Trail</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({total} entries)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700',
              showFilters && 'bg-gray-100 dark:bg-gray-700'
            )}
          >
            <Filter className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <RefreshCw className={cn('w-4 h-4 text-gray-500', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => handleExport('json')}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Export JSON"
          >
            <Download className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="grid grid-cols-4 gap-4">
            <select
              value={filter.action || ''}
              onChange={(e) => setFilter((f) => ({ ...f, action: e.target.value || undefined }))}
              className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            >
              <option value="">All Actions</option>
              {availableActions.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              value={filter.resource_type || ''}
              onChange={(e) => setFilter((f) => ({ ...f, resource_type: e.target.value || undefined }))}
              className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            >
              <option value="">All Resources</option>
              {availableResourceTypes.map((rt) => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
            <select
              value={filter.status || ''}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value || undefined }))}
              className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="denied">Denied</option>
            </select>
            <button
              onClick={() => setFilter({})}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Resource
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Agent
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No audit logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <AuditLogRow
                  key={log.id}
                  log={log}
                  expanded={expandedRows.has(log.id)}
                  onToggle={() => toggleRow(log.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface AuditLogRowProps {
  log: AuditLogEntry
  expanded: boolean
  onToggle: () => void
}

function AuditLogRow({ log, expanded, onToggle }: AuditLogRowProps) {
  const statusCfg = statusConfig[log.status] || statusConfig.success
  const StatusIcon = statusCfg.icon
  const actionLabel = log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {new Date(log.created_at).toLocaleString()}
        </td>
        <td className="px-4 py-3">
          <span className={cn('px-2 py-1 text-xs font-medium rounded', getActionColor(log.action))}>
            {actionLabel}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          <span className="text-gray-600 dark:text-gray-300">{log.resource_type}</span>
          {log.resource_id && (
            <span className="ml-2 text-gray-400 text-xs">
              {log.resource_id.slice(0, 8)}...
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          {log.agent_id || '-'}
        </td>
        <td className="px-4 py-3">
          <StatusIcon className={cn('w-4 h-4', statusCfg.color)} />
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-900/50">
          <td colSpan={6} className="px-8 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Details</h4>
                <dl className="space-y-1">
                  <div className="flex">
                    <dt className="w-24 text-gray-500">ID:</dt>
                    <dd className="text-xs">{log.id}</dd>
                  </div>
                  {log.session_id && (
                    <div className="flex">
                      <dt className="w-24 text-gray-500">Session:</dt>
                      <dd className="text-xs">{log.session_id}</dd>
                    </div>
                  )}
                  {log.user_id && (
                    <div className="flex">
                      <dt className="w-24 text-gray-500">User:</dt>
                      <dd className="text-xs">{log.user_id}</dd>
                    </div>
                  )}
                  {log.ip_address && (
                    <div className="flex">
                      <dt className="w-24 text-gray-500">IP:</dt>
                      <dd>{log.ip_address}</dd>
                    </div>
                  )}
                  {log.error_message && (
                    <div className="flex">
                      <dt className="w-24 text-gray-500">Error:</dt>
                      <dd className="text-red-500">{log.error_message}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {(log.changes || log.new_value) && (
                <div>
                  <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Changes</h4>
                  <pre className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-40">
                    {JSON.stringify(log.changes || log.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default AuditLogTable
