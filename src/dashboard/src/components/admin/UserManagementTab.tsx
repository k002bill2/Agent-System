import { useEffect, useState, useCallback } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
} from 'lucide-react'
import type { UserRole } from '../../stores/auth'
import type { AdminUser } from './types'
import { ROLE_COLORS } from './types'
import { fetchUsers, updateUser } from './api'

interface Props {
  currentUserId: string
}

export function UserManagementTab({ currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [filterRole, setFilterRole] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchAction, setBatchAction] = useState<string>('')
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUsers({
        search: search || undefined,
        is_active: filterActive,
        is_admin: null,
        limit,
        offset: page * limit,
      })
      setUsers(data.users)
      setTotal(data.total)
      setSelectedIds(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [search, filterActive, page])

  useEffect(() => {
    load()
  }, [page, filterActive, filterRole]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(0)
    load()
  }

  const handleToggleActive = async (userId: string, currentValue: boolean) => {
    try {
      const updated = await updateUser(userId, { is_active: !currentValue })
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const updated = await updateUser(userId, { role: newRole })
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(users.filter((u) => u.id !== currentUserId).map((u) => u.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (userId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  const handleBatchApply = async () => {
    if (!batchAction || selectedIds.size === 0) return
    setError(null)

    const updates: Promise<AdminUser>[] = []
    for (const id of selectedIds) {
      if (batchAction === 'activate') {
        updates.push(updateUser(id, { is_active: true }))
      } else if (batchAction === 'deactivate') {
        updates.push(updateUser(id, { is_active: false }))
      } else if (['user', 'manager', 'admin'].includes(batchAction)) {
        updates.push(updateUser(id, { role: batchAction }))
      }
    }

    try {
      const results = await Promise.all(updates)
      setUsers((prev) =>
        prev.map((u) => {
          const updated = results.find((r) => r.id === u.id)
          return updated || u
        })
      )
      setSelectedIds(new Set())
      setBatchAction('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch update failed')
    }
  }

  const totalPages = Math.ceil(total / limit)
  const allSelectableChecked =
    users.filter((u) => u.id !== currentUserId).length > 0 &&
    users.filter((u) => u.id !== currentUserId).every((u) => selectedIds.has(u.id))

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
          value={filterRole ?? 'all'}
          onChange={(e) => {
            const v = e.target.value
            setFilterRole(v === 'all' ? null : v)
            setPage(0)
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">All Roles</option>
          <option value="user">일반 (User)</option>
          <option value="manager">관리자 (Manager)</option>
          <option value="admin">최고관리자 (Admin)</option>
        </select>

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} users
        </span>
      </div>

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            {selectedIds.size}명 선택됨
          </span>
          <select
            value={batchAction}
            onChange={(e) => setBatchAction(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">일괄 작업 선택...</option>
            <option value="activate">활성화</option>
            <option value="deactivate">비활성화</option>
            <option value="user">역할: 일반</option>
            <option value="manager">역할: 관리자</option>
            <option value="admin">역할: 최고관리자</option>
          </select>
          <button
            onClick={handleBatchApply}
            disabled={!batchAction}
            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            적용
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Table - Desktop */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
              </th>
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
                Role
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
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                    selectedIds.has(u.id) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={(e) => handleSelectOne(u.id, e.target.checked)}
                      disabled={u.id === currentUserId}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-30"
                    />
                  </td>
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
                    <select
                      value={u.role || (u.is_admin ? 'admin' : 'user')}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      disabled={u.id === currentUserId}
                      className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                        ROLE_COLORS[u.role || (u.is_admin ? 'admin' : 'user')]
                      }`}
                    >
                      <option value="user">일반 (User)</option>
                      <option value="manager">관리자 (Manager)</option>
                      <option value="admin">최고관리자 (Admin)</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    <span title={u.created_at ? new Date(u.created_at).toLocaleString() : ''}>
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString()
                        : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    <span title={u.last_login_at ? new Date(u.last_login_at).toLocaleString() : ''}>
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString()
                        : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
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

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-gray-500 py-8 text-center">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-gray-500 py-8 text-center">No users found</div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${
                selectedIds.has(u.id) ? 'ring-2 ring-primary-500' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(u.id)}
                  onChange={(e) => handleSelectOne(u.id, e.target.checked)}
                  disabled={u.id === currentUserId}
                  className="mt-1 w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-30"
                />
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                    <span className="text-primary-700 dark:text-primary-400 font-medium">
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {u.name || '-'}
                    {u.id === currentUserId && (
                      <span className="ml-1 text-xs text-primary-600">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <select
                      value={u.role || (u.is_admin ? 'admin' : 'user')}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      disabled={u.id === currentUserId}
                      className={`px-2 py-0.5 rounded text-xs font-medium border-0 ${
                        ROLE_COLORS[u.role || (u.is_admin ? 'admin' : 'user')]
                      }`}
                    >
                      <option value="user">일반</option>
                      <option value="manager">관리자</option>
                      <option value="admin">최고관리자</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(u.id, u.is_active)}
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
              </div>
            </div>
          ))
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
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
