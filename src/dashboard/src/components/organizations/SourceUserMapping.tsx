import { memo, useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Monitor, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { apiClient } from '../../services/apiClient'
import type { OrganizationMember } from '../../stores/organizations'

interface SourceUserMappingProps {
  organizationId: string
  members: OrganizationMember[]
}

interface MappingState {
  sourceUserMap: Record<string, string>
  availableSourceUsers: string[]
  isLoading: boolean
  isSaving: boolean
  saved: boolean
  error: string | null
}

const SourceUserMapping = memo(function SourceUserMapping({
  organizationId,
  members,
}: SourceUserMappingProps) {
  const [state, setState] = useState<MappingState>({
    sourceUserMap: {},
    availableSourceUsers: [],
    isLoading: true,
    isSaving: false,
    saved: false,
    error: null,
  })

  const fetchMapping = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const data = await apiClient.get<{
        source_user_map: Record<string, string>
        available_source_users: string[]
      }>(`/api/organizations/${organizationId}/source-user-map`)
      setState((prev) => ({
        ...prev,
        sourceUserMap: data.source_user_map,
        availableSourceUsers: data.available_source_users,
        isLoading: false,
      }))
    } catch {
      setState((prev) => ({
        ...prev,
        error: 'Failed to load mapping',
        isLoading: false,
      }))
    }
  }, [organizationId])

  useEffect(() => {
    fetchMapping()
  }, [fetchMapping])

  const handleSelect = useCallback(
    (userId: string, sourceUser: string) => {
      setState((prev) => ({
        ...prev,
        saved: false,
        sourceUserMap: { ...prev.sourceUserMap, [userId]: sourceUser },
      }))
    },
    []
  )

  const handleRemove = useCallback((userId: string) => {
    setState((prev) => {
      const { [userId]: _, ...rest } = prev.sourceUserMap
      return { ...prev, saved: false, sourceUserMap: rest }
    })
  }, [])

  const handleSave = useCallback(async () => {
    setState((prev) => ({ ...prev, isSaving: true, error: null }))
    try {
      await apiClient.put(`/api/organizations/${organizationId}/source-user-map`, {
        source_user_map: state.sourceUserMap,
      })
      setState((prev) => ({ ...prev, isSaving: false, saved: true }))
      setTimeout(() => setState((prev) => ({ ...prev, saved: false })), 2000)
    } catch {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: 'Failed to save mapping',
      }))
    }
  }, [organizationId, state.sourceUserMap])

  if (state.isLoading) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading mapping...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Claude Source User Mapping
          </h3>
        </div>
        <button
          onClick={fetchMapping}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
          aria-label="Refresh mapping"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        멤버의 Claude Code OS 사용자명을 매핑하면 사용량 데이터가 표시됩니다.
      </p>

      {state.availableSourceUsers.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          아직 감지된 source user가 없습니다. Claude Code 세션이 기록되면 자동으로 표시됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const mapped = state.sourceUserMap[member.user_id]
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {member.name || member.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {member.email}
                  </p>
                </div>
                <select
                  value={mapped || ''}
                  onChange={(e) =>
                    e.target.value
                      ? handleSelect(member.user_id, e.target.value)
                      : handleRemove(member.user_id)
                  }
                  className={cn(
                    'w-40 text-xs px-2 py-1.5 rounded border transition-colors',
                    'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600',
                    'text-gray-900 dark:text-white',
                    'focus:ring-1 focus:ring-primary-500 focus:border-primary-500'
                  )}
                  aria-label={`Source user for ${member.name || member.email}`}
                >
                  <option value="">— 선택 안 함 —</option>
                  {state.availableSourceUsers.map((su) => (
                    <option key={su} value={su}>
                      {su}
                    </option>
                  ))}
                </select>
                {mapped && (
                  <button
                    onClick={() => handleRemove(member.user_id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove mapping"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {state.error && (
        <p className="mt-2 text-xs text-red-500">{state.error}</p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {state.saved && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check className="w-3.5 h-3.5" />
            저장됨
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={state.isSaving}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
            'bg-primary-600 text-white hover:bg-primary-700',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {state.isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            '매핑 저장'
          )}
        </button>
      </div>
    </div>
  )
})

SourceUserMapping.displayName = 'SourceUserMapping'

export { SourceUserMapping }
