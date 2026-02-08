import { useEffect, useState } from 'react'
import {
  Users,
  Shield,
  ShieldOff,
  Search,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Server,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'

// ============================================================================
// Types
// ============================================================================

interface AdminUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  oauth_provider: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string | null
  last_login_at: string | null
}

interface UserListResponse {
  users: AdminUser[]
  total: number
}

interface SystemInfo {
  version: string
  user_count: number
  active_user_count: number
  admin_count: number
}

type AdminTab = 'users' | 'system'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ============================================================================
// API helpers
// ============================================================================

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchUsers(params: {
  search?: string
  is_active?: boolean | null
  is_admin?: boolean | null
  limit: number
  offset: number
}): Promise<UserListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.append('search', params.search)
  if (params.is_active !== null && params.is_active !== undefined)
    query.append('is_active', String(params.is_active))
  if (params.is_admin !== null && params.is_admin !== undefined)
    query.append('is_admin', String(params.is_admin))
  query.append('limit', String(params.limit))
  query.append('offset', String(params.offset))

  const res = await fetch(`${API_BASE}/admin/users?${query}`, {
    headers: await getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`)
  return res.json()
}

async function updateUser(
  userId: string,
  update: { is_active?: boolean; is_admin?: boolean; name?: string }
): Promise<AdminUser> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(update),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

async function fetchSystemInfo(): Promise<SystemInfo> {
  const res = await fetch(`${API_BASE}/admin/system-info`, {
    headers: await getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch system info: ${res.statusText}`)
  return res.json()
}

// ============================================================================
// Component
// ============================================================================

export function AdminPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  if (!user?.is_admin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ShieldOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            접근 권한 없음
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            관리자 권한이 필요합니다.
          </p>
        </div>
      </div>
    )
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'system', label: 'System', icon: Server },
  ]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserManagement currentUserId={user.id} />}
      {activeTab === 'system' && <SystemInfoPanel />}
    </div>
  )
}

// ============================================================================
// User Management
// ============================================================================

function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [filterAdmin, setFilterAdmin] = useState<boolean | null>(null)
  const [page, setPage] = useState(0)
  const limit = 20

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUsers({
        search: search || undefined,
        is_active: filterActive,
        is_admin: filterAdmin,
        limit,
        offset: page * limit,
      })
      setUsers(data.users)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page, filterActive, filterAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(0)
    load()
  }

  const handleToggle = async (
    userId: string,
    field: 'is_active' | 'is_admin',
    currentValue: boolean
  ) => {
    try {
      const updated = await updateUser(userId, { [field]: !currentValue })
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="이메일 또는 이름 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        >
          검색
        </button>

        <select
          value={filterActive === null ? 'all' : String(filterActive)}
          onChange={(e) => {
            const v = e.target.value
            setFilterActive(v === 'all' ? null : v === 'true')
            setPage(0)
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <select
          value={filterAdmin === null ? 'all' : String(filterAdmin)}
          onChange={(e) => {
            const v = e.target.value
            setFilterAdmin(v === 'all' ? null : v === 'true')
            setPage(0)
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">All Roles</option>
          <option value="true">Admin</option>
          <option value="false">User</option>
        </select>

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} users
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                User
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Provider
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Admin
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Created
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Last Login
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <span className="text-primary-700 dark:text-primary-400 font-medium text-xs">
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {u.name || '-'}
                          {u.id === currentUserId && (
                            <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">
                              (you)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {u.oauth_provider || 'email'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_admin ? (
                      <Shield className="w-4 h-4 text-amber-500 mx-auto" />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleToggle(u.id, 'is_active', u.is_active)}
                        disabled={u.id === currentUserId}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-30"
                        title={u.is_active ? '비활성화' : '활성화'}
                      >
                        {u.is_active ? (
                          <UserX className="w-4 h-4 text-red-500" />
                        ) : (
                          <UserCheck className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggle(u.id, 'is_admin', u.is_admin)}
                        disabled={u.id === currentUserId}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-30"
                        title={u.is_admin ? '관리자 해제' : '관리자 지정'}
                      >
                        {u.is_admin ? (
                          <ShieldOff className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Shield className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// System Info
// ============================================================================

function SystemInfoPanel() {
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
    { label: 'Version', value: info.version },
    { label: 'Total Users', value: info.user_count },
    { label: 'Active Users', value: info.active_user_count },
    { label: 'Admins', value: info.admin_count },
  ]

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {s.label}
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
