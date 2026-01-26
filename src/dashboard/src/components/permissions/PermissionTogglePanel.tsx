import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  usePermissionsStore,
  PermissionInfo,
  AgentPermission,
} from '../../stores/permissions'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FileEdit,
  FileSearch,
  Trash2,
  Globe,
  Wrench,
  Plus,
  ListTodo,
  CheckSquare,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'

interface PermissionTogglePanelProps {
  sessionId: string | null
  compact?: boolean
  className?: string
}

// Permission icons
const permissionIcons: Record<AgentPermission, typeof Shield> = {
  execute_bash: Terminal,
  write_file: FileEdit,
  read_file: FileSearch,
  delete_file: Trash2,
  network_access: Globe,
  mcp_tool_call: Wrench,
  create_session: Plus,
  modify_tasks: ListTodo,
  approve_operations: CheckSquare,
}

// Risk level colors
const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
}

export function PermissionTogglePanel({
  sessionId,
  compact = false,
  className,
}: PermissionTogglePanelProps) {
  const {
    permissions,
    disabledAgents,
    loading,
    error,
    fetchPermissions,
    togglePermission,
  } = usePermissionsStore()

  const [expanded, setExpanded] = useState(!compact)
  const [toggleLoading, setToggleLoading] = useState<string | null>(null)

  // Fetch permissions when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetchPermissions(sessionId)
    }
  }, [sessionId, fetchPermissions])

  const handleToggle = async (permission: AgentPermission) => {
    if (!sessionId) return

    setToggleLoading(permission)
    await togglePermission(sessionId, permission)
    setToggleLoading(null)
  }

  if (!sessionId) {
    return null
  }

  if (error) {
    return (
      <div className={cn('p-4 text-sm text-red-500', className)}>
        Failed to load permissions: {error}
      </div>
    )
  }

  // Count enabled permissions
  const enabledCount = permissions.filter((p) => p.enabled).length
  const highRiskEnabled = permissions.filter(
    (p) => p.enabled && p.risk === 'high'
  ).length

  // Compact view - summary only
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
          className
        )}
      >
        {highRiskEnabled > 0 ? (
          <ShieldAlert className="w-4 h-4 text-yellow-500" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-green-500" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {enabledCount}/{permissions.length} permissions
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
    )
  }

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
        className
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => compact && setExpanded(false)}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Permissions
          </h3>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <div className="flex items-center gap-2">
          {highRiskEnabled > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {highRiskEnabled} high-risk
            </span>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {enabledCount}/{permissions.length}
          </span>
          {compact && (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Permission list */}
      <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {permissions.map((perm) => (
          <PermissionRow
            key={perm.permission}
            permission={perm}
            loading={toggleLoading === perm.permission}
            onToggle={() => handleToggle(perm.permission)}
          />
        ))}
      </div>

      {/* Disabled agents (if any) */}
      {disabledAgents.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Disabled Agents
          </h4>
          <div className="flex flex-wrap gap-2">
            {disabledAgents.map((agentId) => (
              <span
                key={agentId}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
              >
                {agentId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface PermissionRowProps {
  permission: PermissionInfo
  loading: boolean
  onToggle: () => void
}

function PermissionRow({ permission, loading, onToggle }: PermissionRowProps) {
  const Icon = permissionIcons[permission.permission] || Shield

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-center gap-3">
        <Icon
          className={cn(
            'w-4 h-4',
            permission.enabled
              ? 'text-gray-700 dark:text-gray-300'
              : 'text-gray-400 dark:text-gray-500'
          )}
        />
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium',
                permission.enabled
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              {permission.title}
            </span>
            <span
              className={cn(
                'px-1.5 py-0.5 text-[10px] font-medium rounded uppercase',
                riskColors[permission.risk]
              )}
            >
              {permission.risk}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {permission.description}
          </p>
        </div>
      </div>

      {/* Toggle switch */}
      <button
        onClick={onToggle}
        disabled={loading}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
          permission.enabled
            ? 'bg-blue-600'
            : 'bg-gray-300 dark:bg-gray-600'
        )}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          </div>
        ) : (
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              permission.enabled && 'translate-x-5'
            )}
          />
        )}
      </button>
    </div>
  )
}

export default PermissionTogglePanel
