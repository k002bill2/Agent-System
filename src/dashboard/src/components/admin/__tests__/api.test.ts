import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock authFetch before importing the module
const mockAuthFetch = vi.fn()
vi.mock('../../../stores/auth', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

// Now import the functions under test
import { fetchUsers, updateUser, fetchSystemInfo, fetchMenuVisibilityData, saveMenuVisibility } from '../api'

describe('admin/api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchUsers', () => {
    it('calls authFetch with correct query params', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [], total: 0 }),
      })

      await fetchUsers({ limit: 20, offset: 0 })

      const callUrl = mockAuthFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('/admin/users?')
      expect(callUrl).toContain('limit=20')
      expect(callUrl).toContain('offset=0')
    })

    it('appends search param when provided', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [], total: 0 }),
      })

      await fetchUsers({ search: 'test', limit: 20, offset: 0 })

      const callUrl = mockAuthFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('search=test')
    })

    it('appends is_active param when provided', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [], total: 0 }),
      })

      await fetchUsers({ is_active: true, limit: 20, offset: 0 })

      const callUrl = mockAuthFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('is_active=true')
    })

    it('appends role param when provided', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [], total: 0 }),
      })

      await fetchUsers({ role: 'admin', limit: 20, offset: 0 })

      const callUrl = mockAuthFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('role=admin')
    })

    it('does not append null/undefined optional params', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [], total: 0 }),
      })

      await fetchUsers({
        search: undefined,
        is_active: null,
        is_admin: null,
        role: undefined,
        limit: 20,
        offset: 0,
      })

      const callUrl = mockAuthFetch.mock.calls[0][0] as string
      expect(callUrl).not.toContain('search=')
      expect(callUrl).not.toContain('is_active=')
      expect(callUrl).not.toContain('role=')
    })

    it('throws error on non-ok response', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
      })

      await expect(fetchUsers({ limit: 20, offset: 0 })).rejects.toThrow('Failed to fetch users: Forbidden')
    })

    it('returns the parsed JSON', async () => {
      const data = { users: [{ id: '1' }], total: 1 }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      })

      const result = await fetchUsers({ limit: 20, offset: 0 })
      expect(result).toEqual(data)
    })
  })

  describe('updateUser', () => {
    it('calls authFetch with PATCH method and body', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', is_active: false }),
      })

      await updateUser('u1', { is_active: false })

      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/u1'),
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })
      )
    })

    it('throws error with detail message on failure', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ detail: 'Cannot deactivate self' }),
      })

      await expect(updateUser('u1', { is_active: false })).rejects.toThrow('Cannot deactivate self')
    })

    it('falls back to statusText when json parse fails', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('parse error')),
      })

      await expect(updateUser('u1', { role: 'admin' })).rejects.toThrow('Internal Server Error')
    })
  })

  describe('fetchSystemInfo', () => {
    it('calls the correct endpoint', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.0', user_count: 10 }),
      })

      await fetchSystemInfo()
      expect(mockAuthFetch).toHaveBeenCalledWith(expect.stringContaining('/admin/system-info'))
    })

    it('throws on non-ok response', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      })

      await expect(fetchSystemInfo()).rejects.toThrow('Failed to fetch system info: Unauthorized')
    })
  })

  describe('fetchMenuVisibilityData', () => {
    it('calls the correct endpoint', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ visibility: {}, menu_order: [] }),
      })

      await fetchMenuVisibilityData()
      expect(mockAuthFetch).toHaveBeenCalledWith(expect.stringContaining('/admin/menu-visibility'))
    })

    it('throws on non-ok response', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(fetchMenuVisibilityData()).rejects.toThrow('Failed to fetch menu visibility: Not Found')
    })
  })

  describe('saveMenuVisibility', () => {
    it('calls authFetch with PUT method and correct body', async () => {
      const visibility = { dashboard: { user: true, admin: true } }
      const menuOrder = ['dashboard', 'projects']

      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ visibility, menu_order: menuOrder }),
      })

      await saveMenuVisibility(visibility, menuOrder)

      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/menu-visibility'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility, menu_order: menuOrder }),
        })
      )
    })

    it('throws on non-ok response', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        statusText: 'Server Error',
      })

      await expect(saveMenuVisibility({}, [])).rejects.toThrow('Failed to save menu visibility: Server Error')
    })
  })
})
