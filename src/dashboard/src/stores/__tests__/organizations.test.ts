/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../auth', () => ({
  authFetch: vi.fn(),
}))

import { useOrganizationsStore } from '../organizations'
import { authFetch } from '../auth'

function resetStore() {
  useOrganizationsStore.setState({
    organizations: [],
    currentOrganization: null,
    members: [],
    stats: null,
    quotaStatus: null,
    memberUsage: null,
    userMemberships: [],
    isLoading: false,
    error: null,
    modalMode: null,
    activeTab: 'overview',
  })
}

describe('organizations store', () => {
  beforeEach(() => {
    resetStore()
    vi.mocked(authFetch).mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty organizations', () => {
      expect(useOrganizationsStore.getState().organizations).toEqual([])
    })

    it('has null currentOrganization', () => {
      expect(useOrganizationsStore.getState().currentOrganization).toBeNull()
    })

    it('has overview as default tab', () => {
      expect(useOrganizationsStore.getState().activeTab).toBe('overview')
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setModalMode', () => {
      useOrganizationsStore.getState().setModalMode('create')
      expect(useOrganizationsStore.getState().modalMode).toBe('create')
    })

    it('setActiveTab', () => {
      useOrganizationsStore.getState().setActiveTab('members')
      expect(useOrganizationsStore.getState().activeTab).toBe('members')
    })

    it('setCurrentOrganization', () => {
      const org = { id: 'org-1', name: 'Test' } as any
      useOrganizationsStore.getState().setCurrentOrganization(org)
      expect(useOrganizationsStore.getState().currentOrganization).toEqual(org)
    })

    it('clearError', () => {
      useOrganizationsStore.setState({ error: 'err' })
      useOrganizationsStore.getState().clearError()
      expect(useOrganizationsStore.getState().error).toBeNull()
    })
  })

  // ── fetchOrganizations ─────────────────────────────────

  describe('fetchOrganizations', () => {
    it('fetches and stores organizations', async () => {
      const orgs = [{ id: 'org-1', name: 'Org 1' }]
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(orgs),
      } as Response)

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().organizations).toEqual(orgs)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().error).toContain('Failed to fetch organizations')
    })
  })

  // ── fetchOrganization ──────────────────────────────────

  describe('fetchOrganization', () => {
    it('fetches single org', async () => {
      const org = { id: 'org-1', name: 'Org' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(org),
      } as Response)

      await useOrganizationsStore.getState().fetchOrganization('org-1')

      expect(useOrganizationsStore.getState().currentOrganization).toEqual(org)
    })
  })

  // ── createOrganization ─────────────────────────────────

  describe('createOrganization', () => {
    it('creates org and adds to list', async () => {
      const newOrg = { id: 'org-new', name: 'New' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newOrg),
      } as Response)

      const result = await useOrganizationsStore.getState().createOrganization({
        organization: { name: 'New', slug: 'new' },
        owner_user_id: 'u-1',
        owner_email: 'test@test.com',
      })

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations).toContainEqual(newOrg)
      expect(useOrganizationsStore.getState().currentOrganization).toEqual(newOrg)
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Slug already exists' }),
      } as any)

      const result = await useOrganizationsStore.getState().createOrganization({
        organization: { name: 'Dup', slug: 'dup' },
        owner_user_id: 'u-1',
        owner_email: 'test@test.com',
      })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Slug already exists')
    })

    it('handles array error detail (validation)', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          detail: [
            { loc: ['body', 'name'], msg: 'field required' },
            { loc: ['body', 'slug'], msg: 'invalid slug' },
          ],
        }),
      } as any)

      const result = await useOrganizationsStore.getState().createOrganization({
        organization: { name: '', slug: '' },
        owner_user_id: 'u-1',
        owner_email: 'test@test.com',
      })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('field required')
      expect(useOrganizationsStore.getState().error).toContain('invalid slug')
    })
  })

  // ── updateOrganization ─────────────────────────────────

  describe('updateOrganization', () => {
    it('updates org in list and currentOrganization', async () => {
      useOrganizationsStore.setState({
        organizations: [{ id: 'org-1', name: 'Old' } as any],
        currentOrganization: { id: 'org-1', name: 'Old' } as any,
      })
      const updated = { id: 'org-1', name: 'Updated' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updated),
      } as Response)

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'Updated' })

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations[0].name).toBe('Updated')
      expect(useOrganizationsStore.getState().currentOrganization?.name).toBe('Updated')
    })
  })

  // ── deleteOrganization ─────────────────────────────────

  describe('deleteOrganization', () => {
    it('removes org from list', async () => {
      useOrganizationsStore.setState({
        organizations: [{ id: 'org-1' } as any, { id: 'org-2' } as any],
        currentOrganization: { id: 'org-1' } as any,
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations).toHaveLength(1)
      expect(useOrganizationsStore.getState().currentOrganization).toBeNull()
    })
  })

  // ── Members ────────────────────────────────────────────

  describe('members', () => {
    it('fetchMembers stores members', async () => {
      const members = [{ id: 'm-1', role: 'owner' }]
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(members),
      } as Response)

      await useOrganizationsStore.getState().fetchMembers('org-1')

      expect(useOrganizationsStore.getState().members).toEqual(members)
    })

    it('updateMemberRole updates member in list', async () => {
      useOrganizationsStore.setState({
        members: [{ id: 'm-1', role: 'member' } as any],
      })
      const updated = { id: 'm-1', role: 'admin' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updated),
      } as Response)

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().members[0].role).toBe('admin')
    })

    it('removeMember removes from list', async () => {
      useOrganizationsStore.setState({
        members: [{ id: 'm-1' } as any, { id: 'm-2' } as any],
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().members).toHaveLength(1)
    })
  })

  // ── getCurrentUserRole ─────────────────────────────────

  describe('getCurrentUserRole', () => {
    it('finds role from userMemberships', () => {
      useOrganizationsStore.setState({
        userMemberships: [
          { organization_id: 'org-1', user_id: 'u-1', role: 'admin' } as any,
        ],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBe('admin')
    })

    it('falls back to members list', () => {
      useOrganizationsStore.setState({
        members: [{ user_id: 'u-1', role: 'viewer' } as any],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBe('viewer')
    })

    it('returns null when not found', () => {
      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBeNull()
    })
  })

  // ── Stats ──────────────────────────────────────────────

  describe('stats', () => {
    it('fetchStats stores stats', async () => {
      const stats = { total_members: 10 }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(stats),
      } as Response)

      await useOrganizationsStore.getState().fetchStats('org-1')
      expect(useOrganizationsStore.getState().stats).toEqual(stats)
    })

    it('fetchQuotaStatus stores quota', async () => {
      const quota = { organization_id: 'org-1', plan: 'free' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(quota),
      } as Response)

      await useOrganizationsStore.getState().fetchQuotaStatus('org-1')
      expect(useOrganizationsStore.getState().quotaStatus).toEqual(quota)
    })

    it('fetchMemberUsage stores usage', async () => {
      const usage = { members: [] }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(usage),
      } as Response)

      await useOrganizationsStore.getState().fetchMemberUsage('org-1', 'week')
      expect(useOrganizationsStore.getState().memberUsage).toEqual(usage)
    })
  })

  // ── acceptInvitation ───────────────────────────────────

  describe('acceptInvitation', () => {
    it('returns success with member', async () => {
      const member = { id: 'm-1', role: 'member' }
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(member),
      } as Response)

      const result = await useOrganizationsStore.getState().acceptInvitation('token-123', 'u-1', 'User')

      expect(result.success).toBe(true)
      expect(result.member).toEqual(member)
    })

    it('returns error on failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Token expired' }),
      } as any)

      const result = await useOrganizationsStore.getState().acceptInvitation('bad-token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Token expired')
    })
  })
})
