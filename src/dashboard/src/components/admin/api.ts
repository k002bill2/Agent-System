import { authFetch } from '../../stores/auth'
import type { AdminUser, MenuVisibility, SystemInfo, UserListResponse } from './types'
import { API_BASE } from './types'

export async function fetchUsers(params: {
  search?: string
  is_active?: boolean | null
  is_admin?: boolean | null
  role?: string | null
  limit: number
  offset: number
}): Promise<UserListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.append('search', params.search)
  if (params.is_active !== null && params.is_active !== undefined)
    query.append('is_active', String(params.is_active))
  if (params.is_admin !== null && params.is_admin !== undefined)
    query.append('is_admin', String(params.is_admin))
  if (params.role !== null && params.role !== undefined)
    query.append('role', params.role)
  query.append('limit', String(params.limit))
  query.append('offset', String(params.offset))

  const res = await authFetch(`${API_BASE}/admin/users?${query}`)
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`)
  return res.json()
}

export async function updateUser(
  userId: string,
  update: { is_active?: boolean; is_admin?: boolean; role?: string; name?: string }
): Promise<AdminUser> {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const res = await authFetch(`${API_BASE}/admin/system-info`)
  if (!res.ok) throw new Error(`Failed to fetch system info: ${res.statusText}`)
  return res.json()
}

export interface MenuVisibilityData {
  visibility: MenuVisibility
  menu_order: string[]
}

export async function fetchMenuVisibilityData(): Promise<MenuVisibilityData> {
  const res = await authFetch(`${API_BASE}/admin/menu-visibility`)
  if (!res.ok) throw new Error(`Failed to fetch menu visibility: ${res.statusText}`)
  return res.json()
}

export async function fetchMenuVisibility(): Promise<MenuVisibility> {
  const data = await fetchMenuVisibilityData()
  return data.visibility
}

export async function saveMenuVisibility(
  visibility: MenuVisibility,
  menuOrder?: string[],
): Promise<MenuVisibilityData> {
  const res = await authFetch(`${API_BASE}/admin/menu-visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility, menu_order: menuOrder }),
  })
  if (!res.ok) throw new Error(`Failed to save menu visibility: ${res.statusText}`)
  return res.json()
}
