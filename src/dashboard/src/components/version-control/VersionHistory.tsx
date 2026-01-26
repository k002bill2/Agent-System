/**
 * Version History Component
 * Displays version history for configs with diff and rollback capabilities
 */

import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  History,
  GitBranch,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  Clock,
  User,
  Tag,
  Check,
  Archive,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ConfigType = 'agent' | 'session' | 'project' | 'workflow' | 'permission' | 'notification_rule' | 'llm_router'
type VersionStatus = 'draft' | 'active' | 'archived' | 'rolled_back'

interface ConfigVersion {
  id: string
  config_type: ConfigType
  config_id: string
  version: number
  label: string | null
  description: string | null
  status: VersionStatus
  data: Record<string, unknown>
  changes_summary: string | null
  diff_from_previous: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  rolled_back_from: string | null
  rolled_back_at: string | null
}

interface VersionHistoryResponse {
  config_type: ConfigType
  config_id: string
  versions: ConfigVersion[]
  current_version: number
  total_versions: number
}

interface VersionCompare {
  version_a: ConfigVersion
  version_b: ConfigVersion
  diff: Record<string, unknown>
  added_keys: string[]
  removed_keys: string[]
  modified_keys: string[]
  is_identical: boolean
}

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function fetchHistory(configType: ConfigType, configId: string): Promise<VersionHistoryResponse> {
  const res = await fetch(`${API_BASE}/config-versions/history/${configType}/${configId}`)
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}

async function compareVersions(versionIdA: string, versionIdB: string): Promise<VersionCompare> {
  const res = await fetch(`${API_BASE}/config-versions/compare/${versionIdA}/${versionIdB}`)
  if (!res.ok) throw new Error('Failed to compare versions')
  return res.json()
}

async function rollbackToVersion(targetVersionId: string, reason?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/config-versions/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_version_id: targetVersionId, reason }),
  })
  if (!res.ok) throw new Error('Failed to rollback')
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

const statusColors: Record<VersionStatus, string> = {
  draft: 'text-gray-500 bg-gray-100 dark:bg-gray-700',
  active: 'text-green-600 bg-green-100 dark:bg-green-900/30',
  archived: 'text-gray-500 bg-gray-100 dark:bg-gray-700',
  rolled_back: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
}

const statusIcons: Record<VersionStatus, typeof Check> = {
  draft: FileText,
  active: Check,
  archived: Archive,
  rolled_back: RotateCcw,
}

interface VersionHistoryProps {
  configType: ConfigType
  configId: string
  className?: string
}

export function VersionHistory({ configType, configId, className }: VersionHistoryProps) {
  const [history, setHistory] = useState<VersionHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)
  const [comparing, setComparing] = useState<{ a: string; b: string } | null>(null)
  const [comparison, setComparison] = useState<VersionCompare | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [configType, configId])

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchHistory(configType, configId)
      setHistory(data)
    } catch {
      setError('Failed to load version history')
    } finally {
      setLoading(false)
    }
  }

  const handleCompare = async (versionIdA: string, versionIdB: string) => {
    try {
      setComparing({ a: versionIdA, b: versionIdB })
      const result = await compareVersions(versionIdA, versionIdB)
      setComparison(result)
    } catch {
      setError('Failed to compare versions')
    }
  }

  const handleRollback = async (targetVersionId: string) => {
    if (!confirm('Are you sure you want to rollback to this version? This will create a new version with the old data.')) {
      return
    }

    try {
      setRollingBack(true)
      await rollbackToVersion(targetVersionId, 'Manual rollback')
      await loadHistory()
    } catch {
      setError('Failed to rollback')
    } finally {
      setRollingBack(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 text-red-500 py-4', className)}>
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    )
  }

  if (!history || history.versions.length === 0) {
    return (
      <div className={cn('text-center py-8 text-gray-500 dark:text-gray-400', className)}>
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No version history available</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">
            Version History
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({history.total_versions} versions)
          </span>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Current: v{history.current_version}
        </span>
      </div>

      {/* Comparison View */}
      {comparison && comparing && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Comparing v{comparison.version_a.version} vs v{comparison.version_b.version}
              </span>
            </div>
            <button
              onClick={() => {
                setComparing(null)
                setComparison(null)
              }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Close
            </button>
          </div>

          {comparison.is_identical ? (
            <p className="text-sm text-gray-500">These versions are identical</p>
          ) : (
            <div className="space-y-2 text-sm">
              {comparison.added_keys.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-medium">Added:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {comparison.added_keys.join(', ')}
                  </span>
                </div>
              )}
              {comparison.removed_keys.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-red-600 font-medium">Removed:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {comparison.removed_keys.join(', ')}
                  </span>
                </div>
              )}
              {comparison.modified_keys.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-yellow-600 font-medium">Modified:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {comparison.modified_keys.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Version List */}
      <div className="space-y-2">
        {history.versions.map((version, index) => {
          const StatusIcon = statusIcons[version.status]
          const isExpanded = expandedVersion === version.id
          const nextVersion = history.versions[index + 1]

          return (
            <div
              key={version.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Version Header */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                      v{version.version}
                    </span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-xs flex items-center gap-1',
                        statusColors[version.status]
                      )}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {version.status}
                    </span>
                  </div>
                  {version.label && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Tag className="w-3 h-3" />
                      {version.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(version.created_at).toLocaleString()}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                  {/* Description */}
                  {version.description && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {version.description}
                    </p>
                  )}

                  {/* Changes Summary */}
                  {version.changes_summary && (
                    <div className="text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Changes: </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {version.changes_summary}
                      </span>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {version.created_by && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {version.created_by}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(version.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        // Open data viewer (could be modal or new panel)
                        console.log('View data:', version.data)
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Data
                    </button>

                    {nextVersion && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCompare(version.id, nextVersion.id)
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Compare
                      </button>
                    )}

                    {version.status !== 'active' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRollback(version.id)
                        }}
                        disabled={rollingBack}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
                      >
                        {rollingBack ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default VersionHistory
