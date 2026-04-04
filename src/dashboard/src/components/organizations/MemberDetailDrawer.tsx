import { memo, useEffect, useState, useCallback } from 'react'
import {
  X,
  Mail,
  Shield,
  Calendar,
  Clock,
  Activity,
  Coins,
  TrendingUp,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { roleIcons, roleColors, roleLabels } from './memberRoleConstants'
import type { OrganizationMember, MemberRole, MemberUsageSummary } from '../../stores/organizations'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface MemberDetailDrawerProps {
  /** 선택된 멤버 정보 */
  member: OrganizationMember
  /** 멤버 사용량 (없을 수 있음) */
  usage: MemberUsageSummary | null
  /** 현재 로그인한 사용자 ID */
  currentUserId: string
  /** 역할 변경/제거 권한 여부 */
  canManage: boolean
  /** 드로어 닫기 */
  onClose: () => void
  /** 역할 변경 */
  onUpdateRole: (role: MemberRole) => void
  /** 멤버 제거 */
  onRemove: () => void
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '-'
  }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(dateStr)
  } catch {
    return '-'
  }
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const MemberDetailDrawer = memo(function MemberDetailDrawer({
  member,
  usage,
  currentUserId,
  canManage,
  onClose,
  onUpdateRole,
  onRemove,
}: MemberDetailDrawerProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const isCurrentUser = member.user_id === currentUserId
  const RoleIcon = roleIcons[member.role]
  const canChangeRole = canManage && !isCurrentUser && member.role !== 'owner'

  // Escape 키로 닫기
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        onClick={onClose}
        aria-label="Close drawer"
      />

      {/* Drawer Panel */}
      <div className="relative w-96 max-w-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
              {(member.name || member.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {member.name || member.email}
              </h2>
              {isCurrentUser && (
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  (You)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                  roleColors[member.role]
                )}
              >
                <RoleIcon className="w-3 h-3" />
                {roleLabels[member.role]}
              </span>
              {member.is_active && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Active
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            aria-label="Close member detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Contact Info */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Contact
            </h3>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-900 dark:text-white truncate">
                {member.email}
              </span>
            </div>
          </section>

          {/* Dates */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Activity
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Joined</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatDate(member.joined_at)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last Active</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatRelativeTime(member.last_active_at)}
                </p>
              </div>
              {member.invited_at && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Invited</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(member.invited_at)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Usage Stats */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Usage
            </h3>
            {usage ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Tokens Today</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {usage.tokens_used_today.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Coins className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Tokens/Month</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {usage.tokens_used_this_month.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Sessions Today</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {usage.sessions_today}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Sessions/Month</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {usage.sessions_this_month}
                    </p>
                  </div>
                </div>

                {/* Org Usage Percentage */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Org Usage Share</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {usage.percentage_of_org}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        usage.percentage_of_org > 50
                          ? 'bg-primary-500'
                          : usage.percentage_of_org > 25
                            ? 'bg-blue-500'
                            : 'bg-emerald-500'
                      )}
                      style={{ width: `${Math.max(usage.percentage_of_org, 1)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No usage data available</p>
              </div>
            )}
          </section>

          {/* Actions */}
          {canChangeRole && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Manage
              </h3>
              <div className="space-y-3">
                {/* Role Change */}
                <div className="relative">
                  <button
                    onClick={() => setShowRoleMenu(!showRoleMenu)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Change member role"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Change Role</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-gray-400 transition-transform',
                        showRoleMenu && 'rotate-180'
                      )}
                    />
                  </button>

                  {showRoleMenu && (
                    <div className="mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                      {(['admin', 'member', 'viewer'] as MemberRole[]).map((role) => {
                        const Icon = roleIcons[role]
                        return (
                          <button
                            key={role}
                            onClick={() => {
                              setShowRoleMenu(false)
                              if (role !== member.role) {
                                onUpdateRole(role)
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                              role === member.role
                                ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/10'
                                : 'text-gray-700 dark:text-gray-300'
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {roleLabels[role]}
                            {role === member.role && (
                              <span className="ml-auto text-xs text-gray-400">Current</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Remove Member */}
                {!showRemoveConfirm ? (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="w-full flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Member
                  </button>
                ) : (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                      Are you sure you want to remove this member?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowRemoveConfirm(false)
                          onRemove()
                        }}
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setShowRemoveConfirm(false)}
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
})

MemberDetailDrawer.displayName = 'MemberDetailDrawer'
