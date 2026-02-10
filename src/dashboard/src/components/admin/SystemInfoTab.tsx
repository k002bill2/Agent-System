import { useEffect, useState } from 'react'
import { RefreshCw, Users, UserCheck, ShieldCheck, TrendingUp } from 'lucide-react'
import type { SystemInfo } from './types'
import { ROLE_COLORS, ROLE_LABELS } from './types'
import { fetchSystemInfo } from './api'
import type { UserRole } from '../../stores/auth'

export function SystemInfoTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchSystemInfo()
      setInfo(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return <div className="text-gray-500 py-8 text-center">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
        {error}
      </div>
    )
  }

  if (!info) return null

  const stats = [
    { label: 'Version', value: info.version, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Total Users', value: info.user_count, icon: Users, color: 'text-blue-500' },
    { label: 'Active Users', value: info.active_user_count, icon: UserCheck, color: 'text-green-500' },
    { label: 'Admins', value: info.admin_count, icon: ShieldCheck, color: 'text-amber-500' },
  ]

  const roleDistribution = info.role_distribution || {
    user: info.user_count - info.admin_count,
    manager: 0,
    admin: info.admin_count,
  }
  const totalForDistribution = roleDistribution.user + roleDistribution.manager + roleDistribution.admin

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          System Information
        </h3>
        <button
          onClick={load}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {s.label}
              </span>
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Role Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          역할 분포
        </h4>
        <div className="space-y-3">
          {(['user', 'manager', 'admin'] as UserRole[]).map((role) => {
            const count = roleDistribution[role] || 0
            const pct = totalForDistribution > 0 ? Math.round((count / totalForDistribution) * 100) : 0
            return (
              <div key={role} className="flex items-center gap-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-20 justify-center ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-primary-500 rounded-full h-2 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-right">
                  {count} ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {info.recent_signups && info.recent_signups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              최근 가입자
            </h4>
            <div className="space-y-2">
              {info.recent_signups.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div className="truncate">
                    <span className="text-gray-900 dark:text-white">
                      {u.name || u.email.split('@')[0]}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">
                      {u.email}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {info.recent_logins && info.recent_logins.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              최근 로그인
            </h4>
            <div className="space-y-2">
              {info.recent_logins.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div className="truncate">
                    <span className="text-gray-900 dark:text-white">
                      {u.name || u.email.split('@')[0]}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">
                      {u.email}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2">
                    {new Date(u.last_login_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
