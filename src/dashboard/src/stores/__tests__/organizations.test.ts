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

const mockOrg = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  status: 'active' as const,
  plan: 'free' as const,
  contact_email: null,
  contact_name: null,
  logo_url: null,
  primary_color: null,
  max_members: 10,
  max_projects: 5,
  max_sessions_per_day: 100,
  max_tokens_per_month: 100000,
  current_members: 1,
  current_projects: 0,
  tokens_used_this_month: 0,
  settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
})

const mockMember = (id: string, userId: string, orgId: string, role: string) => ({
  id,
  organization_id: orgId,
  user_id: userId,
  email: `${userId}@test.com`,
  name: `User ${userId}`,
  role,
  permissions: [],
  is_active: true,
  invited_by: null,
  invited_at: null,
  joined_at: '2024-01-01T00:00:00Z',
  last_active_at: null,
  created_at: '2024-01-01T00:00:00Z',
})

function mockOkResponse(data: any): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as Response
}

function mockErrorResponse(detail: any): Response {
  return {
    ok: false,
    json: () => Promise.resolve({ detail }),
  } as any
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

    it('has null modalMode', () => {
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
    })

    it('has empty members', () => {
      expect(useOrganizationsStore.getState().members).toEqual([])
    })

    it('has null stats, quotaStatus, memberUsage', () => {
      const state = useOrganizationsStore.getState()
      expect(state.stats).toBeNull()
      expect(state.quotaStatus).toBeNull()
      expect(state.memberUsage).toBeNull()
    })

    it('has empty userMemberships', () => {
      expect(useOrganizationsStore.getState().userMemberships).toEqual([])
    })

    it('is not loading and has no error', () => {
      const state = useOrganizationsStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setModalMode', () => {
      useOrganizationsStore.getState().setModalMode('create')
      expect(useOrganizationsStore.getState().modalMode).toBe('create')
    })

    it('setModalMode to edit', () => {
      useOrganizationsStore.getState().setModalMode('edit')
      expect(useOrganizationsStore.getState().modalMode).toBe('edit')
    })

    it('setModalMode to invite', () => {
      useOrganizationsStore.getState().setModalMode('invite')
      expect(useOrganizationsStore.getState().modalMode).toBe('invite')
    })

    it('setModalMode to null', () => {
      useOrganizationsStore.setState({ modalMode: 'create' })
      useOrganizationsStore.getState().setModalMode(null)
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
    })

    it('setActiveTab', () => {
      useOrganizationsStore.getState().setActiveTab('members')
      expect(useOrganizationsStore.getState().activeTab).toBe('members')
    })

    it('setActiveTab to settings', () => {
      useOrganizationsStore.getState().setActiveTab('settings')
      expect(useOrganizationsStore.getState().activeTab).toBe('settings')
    })

    it('setCurrentOrganization', () => {
      const org = mockOrg('org-1', 'Test')
      useOrganizationsStore.getState().setCurrentOrganization(org)
      expect(useOrganizationsStore.getState().currentOrganization).toEqual(org)
    })

    it('setCurrentOrganization to null', () => {
      useOrganizationsStore.setState({ currentOrganization: mockOrg('org-1', 'Test') })
      useOrganizationsStore.getState().setCurrentOrganization(null)
      expect(useOrganizationsStore.getState().currentOrganization).toBeNull()
    })

    it('clearError', () => {
      useOrganizationsStore.setState({ error: 'some error' })
      useOrganizationsStore.getState().clearError()
      expect(useOrganizationsStore.getState().error).toBeNull()
    })

    it('clearError when already null', () => {
      useOrganizationsStore.getState().clearError()
      expect(useOrganizationsStore.getState().error).toBeNull()
    })
  })

  // ── fetchOrganizations ─────────────────────────────────

  describe('fetchOrganizations', () => {
    it('sets isLoading true during fetch', async () => {
      let resolvePromise: (v: any) => void
      vi.mocked(authFetch).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const fetchPromise = useOrganizationsStore.getState().fetchOrganizations()
      expect(useOrganizationsStore.getState().isLoading).toBe(true)
      expect(useOrganizationsStore.getState().error).toBeNull()

      resolvePromise!({ ok: true, json: () => Promise.resolve([]) })
      await fetchPromise

      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('fetches and stores organizations', async () => {
      const orgs = [mockOrg('org-1', 'Org 1'), mockOrg('org-2', 'Org 2')]
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(orgs))

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().organizations).toEqual(orgs)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
      expect(useOrganizationsStore.getState().error).toBeNull()
    })

    it('sets error on non-ok response', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch organizations')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network error'))

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().error).toBe('Network error')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce('some string error')

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch organizations')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('clears previous error on new fetch', async () => {
      useOrganizationsStore.setState({ error: 'old error' })
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse([]))

      await useOrganizationsStore.getState().fetchOrganizations()

      expect(useOrganizationsStore.getState().error).toBeNull()
    })
  })

  // ── fetchOrganization ──────────────────────────────────

  describe('fetchOrganization', () => {
    it('fetches and sets currentOrganization', async () => {
      const org = mockOrg('org-1', 'Test Org')
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(org))

      await useOrganizationsStore.getState().fetchOrganization('org-1')

      expect(useOrganizationsStore.getState().currentOrganization).toEqual(org)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('sets isLoading true during fetch', async () => {
      let resolvePromise: (v: any) => void
      vi.mocked(authFetch).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const fetchPromise = useOrganizationsStore.getState().fetchOrganization('org-1')
      expect(useOrganizationsStore.getState().isLoading).toBe(true)

      resolvePromise!({ ok: true, json: () => Promise.resolve(mockOrg('org-1', 'Test')) })
      await fetchPromise
    })

    it('sets error on non-ok response', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchOrganization('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch organization')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Connection refused'))

      await useOrganizationsStore.getState().fetchOrganization('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Connection refused')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(42)

      await useOrganizationsStore.getState().fetchOrganization('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch organization')
    })
  })

  // ── createOrganization ─────────────────────────────────

  describe('createOrganization', () => {
    const createPayload = {
      organization: { name: 'New Org', slug: 'new-org' },
      owner_user_id: 'u-1',
      owner_email: 'owner@test.com',
    }

    it('creates org, adds to list, sets current, closes modal', async () => {
      useOrganizationsStore.setState({ modalMode: 'create' })
      const newOrg = mockOrg('org-new', 'New Org')
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(newOrg))

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations).toContainEqual(newOrg)
      expect(useOrganizationsStore.getState().currentOrganization).toEqual(newOrg)
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('appends to existing organizations list', async () => {
      const existing = mockOrg('org-existing', 'Existing')
      useOrganizationsStore.setState({ organizations: [existing] })
      const newOrg = mockOrg('org-new', 'New')
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(newOrg))

      await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(useOrganizationsStore.getState().organizations).toHaveLength(2)
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Slug already exists'))

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Slug already exists')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles array error detail with msg fields', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([
          { loc: ['body', 'name'], msg: 'field required' },
          { loc: ['body', 'slug'], msg: 'invalid slug' },
        ])
      )

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('field required')
      expect(useOrganizationsStore.getState().error).toContain('invalid slug')
    })

    it('handles array error detail without msg (falls back to JSON.stringify)', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ loc: ['body', 'name'], type: 'missing' }])
      )

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      // When msg is undefined, JSON.stringify is used
      expect(useOrganizationsStore.getState().error).toContain('missing')
    })

    it('handles non-array non-string error detail (default message)', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse({ unexpected: 'format' })
      )

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to create organization')
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network failure'))

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Network failure')
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(undefined)

      const result = await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to create organization')
    })

    it('sets isLoading true during creation', async () => {
      let resolvePromise: (v: any) => void
      vi.mocked(authFetch).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useOrganizationsStore.getState().createOrganization(createPayload)
      expect(useOrganizationsStore.getState().isLoading).toBe(true)

      resolvePromise!(mockOkResponse(mockOrg('org-1', 'Test')))
      await promise
    })

    it('sends correct request body', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(mockOrg('org-1', 'Test')))

      await useOrganizationsStore.getState().createOrganization(createPayload)

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })
      )
    })
  })

  // ── updateOrganization ─────────────────────────────────

  describe('updateOrganization', () => {
    it('updates org in list and currentOrganization when matching', async () => {
      useOrganizationsStore.setState({
        organizations: [mockOrg('org-1', 'Old'), mockOrg('org-2', 'Other')],
        currentOrganization: mockOrg('org-1', 'Old'),
        modalMode: 'edit',
      })
      const updated = { ...mockOrg('org-1', 'Updated'), name: 'Updated' }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(updated))

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'Updated' })

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations[0].name).toBe('Updated')
      expect(useOrganizationsStore.getState().organizations[1].name).toBe('Other')
      expect(useOrganizationsStore.getState().currentOrganization?.name).toBe('Updated')
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('does not change currentOrganization when updating a different org', async () => {
      const currentOrg = mockOrg('org-current', 'Current')
      useOrganizationsStore.setState({
        organizations: [mockOrg('org-1', 'Old'), currentOrg],
        currentOrganization: currentOrg,
      })
      const updated = { ...mockOrg('org-1', 'Updated') }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(updated))

      await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'Updated' })

      expect(useOrganizationsStore.getState().currentOrganization).toEqual(currentOrg)
    })

    it('handles currentOrganization being null', async () => {
      useOrganizationsStore.setState({
        organizations: [mockOrg('org-1', 'Old')],
        currentOrganization: null,
      })
      const updated = mockOrg('org-1', 'Updated')
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(updated))

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'Updated' })

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().currentOrganization).toBeNull()
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Name too long'))

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x'.repeat(500) })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Name too long')
    })

    it('handles array error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ loc: ['body', 'name'], msg: 'too long' }])
      )

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x' })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('too long')
    })

    it('handles array error detail without msg field', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ loc: ['body', 'name'], type: 'value_error' }])
      )

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x' })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('value_error')
    })

    it('handles non-array non-string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse(123))

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x' })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to update organization')
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Timeout'))

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x' })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Timeout')
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(null)

      const result = await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'x' })

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to update organization')
    })

    it('sends correct PATCH request', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(mockOrg('org-1', 'Updated')))

      await useOrganizationsStore.getState().updateOrganization('org-1', { name: 'Updated', description: 'New desc' })

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-1'),
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated', description: 'New desc' }),
        })
      )
    })
  })

  // ── deleteOrganization ─────────────────────────────────

  describe('deleteOrganization', () => {
    it('removes org from list and clears currentOrganization when matching', async () => {
      useOrganizationsStore.setState({
        organizations: [mockOrg('org-1', 'First'), mockOrg('org-2', 'Second')],
        currentOrganization: mockOrg('org-1', 'First'),
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().organizations).toHaveLength(1)
      expect(useOrganizationsStore.getState().organizations[0].id).toBe('org-2')
      expect(useOrganizationsStore.getState().currentOrganization).toBeNull()
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('does not clear currentOrganization when deleting a different org', async () => {
      const currentOrg = mockOrg('org-2', 'Second')
      useOrganizationsStore.setState({
        organizations: [mockOrg('org-1', 'First'), currentOrg],
        currentOrganization: currentOrg,
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().currentOrganization).toEqual(currentOrg)
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Cannot delete active org'))

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Cannot delete active org')
    })

    it('handles array error detail with msg', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ msg: 'has active members' }])
      )

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('has active members')
    })

    it('handles array error detail without msg', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ type: 'constraint_violation' }])
      )

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('constraint_violation')
    })

    it('handles non-array non-string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse({ code: 403 }))

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to delete organization')
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Server down'))

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Server down')
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce('unknown')

      const result = await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to delete organization')
    })

    it('sends correct DELETE request', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      await useOrganizationsStore.getState().deleteOrganization('org-1')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  // ── Members ────────────────────────────────────────────

  describe('fetchMembers', () => {
    it('fetches and stores members', async () => {
      const members = [mockMember('m-1', 'u-1', 'org-1', 'owner')]
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(members))

      await useOrganizationsStore.getState().fetchMembers('org-1')

      expect(useOrganizationsStore.getState().members).toEqual(members)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('sets error on non-ok response', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchMembers('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch members')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with Error object', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Connection lost'))

      await useOrganizationsStore.getState().fetchMembers('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Connection lost')
    })

    it('handles network exception with non-Error value', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(0)

      await useOrganizationsStore.getState().fetchMembers('org-1')

      expect(useOrganizationsStore.getState().error).toBe('Failed to fetch members')
    })

    it('sets isLoading true during fetch', async () => {
      let resolvePromise: (v: any) => void
      vi.mocked(authFetch).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useOrganizationsStore.getState().fetchMembers('org-1')
      expect(useOrganizationsStore.getState().isLoading).toBe(true)

      resolvePromise!(mockOkResponse([]))
      await promise
    })
  })

  describe('inviteMember', () => {
    const invitePayload = { email: 'newuser@test.com', role: 'member' as const }

    it('invites member, refreshes members list, closes modal', async () => {
      // First call: invite succeeds
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ id: 'm-new' }))
      // Second call: fetchMembers refresh
      const members = [mockMember('m-1', 'u-1', 'org-1', 'owner')]
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(members))

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload, 'u-owner')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
      expect(useOrganizationsStore.getState().modalMode).toBeNull()
    })

    it('includes invitedBy as query parameter when provided', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({}))
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse([]))

      await useOrganizationsStore.getState().inviteMember('org-1', invitePayload, 'user-123')

      const firstCallUrl = vi.mocked(authFetch).mock.calls[0][0]
      expect(firstCallUrl).toContain('invited_by=user-123')
    })

    it('does not include invitedBy when not provided', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({}))
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse([]))

      await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      const firstCallUrl = vi.mocked(authFetch).mock.calls[0][0]
      expect(firstCallUrl).not.toContain('invited_by')
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('User already a member'))

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('User already a member')
    })

    it('handles array error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ msg: 'invalid email format' }])
      )

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('invalid email format')
    })

    it('handles array error detail without msg field', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ type: 'email_invalid' }])
      )

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('email_invalid')
    })

    it('handles non-array non-string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse(false))

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to invite member')
    })

    it('handles network exception with Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('CORS error'))

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('CORS error')
    })

    it('handles network exception with non-Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce({ code: 500 })

      const result = await useOrganizationsStore.getState().inviteMember('org-1', invitePayload)

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to invite member')
    })

    it('sends correct POST request', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({}))
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse([]))

      await useOrganizationsStore.getState().inviteMember('org-1', invitePayload, 'u-owner')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-1/members/invite'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invitePayload),
        })
      )
    })
  })

  describe('updateMemberRole', () => {
    it('updates member role in list', async () => {
      useOrganizationsStore.setState({
        members: [mockMember('m-1', 'u-1', 'org-1', 'member') as any],
      })
      const updated = { ...mockMember('m-1', 'u-1', 'org-1', 'admin') }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(updated))

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().members[0].role).toBe('admin')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('does not change other members', async () => {
      useOrganizationsStore.setState({
        members: [
          mockMember('m-1', 'u-1', 'org-1', 'member') as any,
          mockMember('m-2', 'u-2', 'org-1', 'viewer') as any,
        ],
      })
      const updated = { ...mockMember('m-1', 'u-1', 'org-1', 'admin') }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(updated))

      await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(useOrganizationsStore.getState().members[1].role).toBe('viewer')
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Cannot change owner role'))

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Cannot change owner role')
    })

    it('handles array error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ msg: 'invalid role' }])
      )

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('invalid role')
    })

    it('handles array error detail without msg', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ type: 'permission_denied' }])
      )

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('permission_denied')
    })

    it('handles non-array non-string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse(null))

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to update member role')
    })

    it('handles network exception with Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Server error'))

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Server error')
    })

    it('handles network exception with non-Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(false)

      const result = await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to update member role')
    })

    it('sends correct PATCH request', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(mockMember('m-1', 'u-1', 'org-1', 'admin')))

      await useOrganizationsStore.getState().updateMemberRole('org-1', 'm-1', 'admin')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-1/members/m-1/role'),
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'admin' }),
        })
      )
    })
  })

  describe('removeMember', () => {
    it('removes member from list', async () => {
      useOrganizationsStore.setState({
        members: [
          mockMember('m-1', 'u-1', 'org-1', 'member') as any,
          mockMember('m-2', 'u-2', 'org-1', 'viewer') as any,
        ],
      })
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(true)
      expect(useOrganizationsStore.getState().members).toHaveLength(1)
      expect(useOrganizationsStore.getState().members[0].id).toBe('m-2')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Cannot remove owner'))

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Cannot remove owner')
    })

    it('handles array error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ msg: 'last admin cannot be removed' }])
      )

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('last admin cannot be removed')
    })

    it('handles array error detail without msg', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ code: 'LAST_OWNER' }])
      )

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toContain('LAST_OWNER')
    })

    it('handles non-array non-string error detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse(true))

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to remove member')
    })

    it('handles network exception with Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Request aborted'))

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Request aborted')
    })

    it('handles network exception with non-Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce('string error')

      const result = await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(result).toBe(false)
      expect(useOrganizationsStore.getState().error).toBe('Failed to remove member')
    })

    it('sends correct DELETE request', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: true } as Response)

      await useOrganizationsStore.getState().removeMember('org-1', 'm-1')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-1/members/m-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  // ── User Memberships ───────────────────────────────────

  describe('fetchUserMemberships', () => {
    it('fetches and stores user memberships', async () => {
      const memberships = [
        mockMember('m-1', 'u-1', 'org-1', 'admin'),
        mockMember('m-2', 'u-1', 'org-2', 'member'),
      ]
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(memberships))

      await useOrganizationsStore.getState().fetchUserMemberships('u-1')

      expect(useOrganizationsStore.getState().userMemberships).toEqual(memberships)
    })

    it('handles non-ok response silently (console.error)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchUserMemberships('u-1')

      expect(consoleSpy).toHaveBeenCalled()
      // userMemberships should remain unchanged (empty)
      expect(useOrganizationsStore.getState().userMemberships).toEqual([])
      consoleSpy.mockRestore()
    })

    it('handles network exception silently (console.error)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network error'))

      await useOrganizationsStore.getState().fetchUserMemberships('u-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch user memberships:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('calls correct API endpoint', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse([]))

      await useOrganizationsStore.getState().fetchUserMemberships('user-abc')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/user/user-abc/organizations')
      )
    })
  })

  // ── getCurrentUserRole ─────────────────────────────────

  describe('getCurrentUserRole', () => {
    it('finds role from userMemberships (priority)', () => {
      useOrganizationsStore.setState({
        userMemberships: [
          { organization_id: 'org-1', user_id: 'u-1', role: 'admin' } as any,
        ],
        members: [
          { user_id: 'u-1', role: 'viewer' } as any, // Should not be used
        ],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBe('admin')
    })

    it('falls back to members list when not in userMemberships', () => {
      useOrganizationsStore.setState({
        userMemberships: [],
        members: [{ user_id: 'u-1', role: 'viewer' } as any],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBe('viewer')
    })

    it('returns null when not found in either list', () => {
      useOrganizationsStore.setState({
        userMemberships: [],
        members: [],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBeNull()
    })

    it('does not match userMembership with different orgId', () => {
      useOrganizationsStore.setState({
        userMemberships: [
          { organization_id: 'org-2', user_id: 'u-1', role: 'admin' } as any,
        ],
        members: [],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBeNull()
    })

    it('does not match userMembership with different userId', () => {
      useOrganizationsStore.setState({
        userMemberships: [
          { organization_id: 'org-1', user_id: 'u-2', role: 'admin' } as any,
        ],
        members: [],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBeNull()
    })

    it('matches member by user_id regardless of org context', () => {
      useOrganizationsStore.setState({
        userMemberships: [],
        members: [
          { user_id: 'u-other', role: 'admin' } as any,
          { user_id: 'u-1', role: 'owner' } as any,
        ],
      })

      const role = useOrganizationsStore.getState().getCurrentUserRole('org-1', 'u-1')
      expect(role).toBe('owner')
    })
  })

  // ── Stats ──────────────────────────────────────────────

  describe('fetchStats', () => {
    it('fetches and stores stats', async () => {
      const stats = { organization_id: 'org-1', total_members: 10, active_members: 8 }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(stats))

      await useOrganizationsStore.getState().fetchStats('org-1')

      expect(useOrganizationsStore.getState().stats).toEqual(stats)
    })

    it('handles non-ok response silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchStats('org-1')

      expect(consoleSpy).toHaveBeenCalled()
      expect(useOrganizationsStore.getState().stats).toBeNull()
      consoleSpy.mockRestore()
    })

    it('handles network exception silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Timeout'))

      await useOrganizationsStore.getState().fetchStats('org-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch organization stats:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('calls correct API endpoint', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({}))

      await useOrganizationsStore.getState().fetchStats('org-abc')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-abc/stats')
      )
    })
  })

  describe('fetchQuotaStatus', () => {
    it('fetches and stores quota status', async () => {
      const quota = {
        organization_id: 'org-1',
        plan: 'professional',
        members: { allowed: true, current: 5, limit: 50, message: 'OK' },
      }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(quota))

      await useOrganizationsStore.getState().fetchQuotaStatus('org-1')

      expect(useOrganizationsStore.getState().quotaStatus).toEqual(quota)
    })

    it('handles non-ok response silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchQuotaStatus('org-1')

      expect(consoleSpy).toHaveBeenCalled()
      expect(useOrganizationsStore.getState().quotaStatus).toBeNull()
      consoleSpy.mockRestore()
    })

    it('handles network exception silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Fetch failed'))

      await useOrganizationsStore.getState().fetchQuotaStatus('org-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch quota status:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('calls correct API endpoint', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({}))

      await useOrganizationsStore.getState().fetchQuotaStatus('org-xyz')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-xyz/quota')
      )
    })
  })

  describe('fetchMemberUsage', () => {
    it('fetches and stores member usage', async () => {
      const usage = { organization_id: 'org-1', period: 'month', total_tokens: 5000, members: [] }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(usage))

      await useOrganizationsStore.getState().fetchMemberUsage('org-1', 'month')

      expect(useOrganizationsStore.getState().memberUsage).toEqual(usage)
    })

    it('uses default period "month" when not specified', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ members: [] }))

      await useOrganizationsStore.getState().fetchMemberUsage('org-1')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('period=month')
      )
    })

    it('uses custom period when specified', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ members: [] }))

      await useOrganizationsStore.getState().fetchMemberUsage('org-1', 'week')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('period=week')
      )
    })

    it('handles non-ok response silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockResolvedValueOnce({ ok: false } as Response)

      await useOrganizationsStore.getState().fetchMemberUsage('org-1')

      expect(consoleSpy).toHaveBeenCalled()
      expect(useOrganizationsStore.getState().memberUsage).toBeNull()
      consoleSpy.mockRestore()
    })

    it('handles network exception silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Network error'))

      await useOrganizationsStore.getState().fetchMemberUsage('org-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch member usage:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('calls correct API endpoint', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ members: [] }))

      await useOrganizationsStore.getState().fetchMemberUsage('org-abc', 'day')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org-abc/members/usage?period=day')
      )
    })
  })

  // ── acceptInvitation ───────────────────────────────────

  describe('acceptInvitation', () => {
    it('returns success with member on ok response', async () => {
      const member = { id: 'm-1', role: 'member', organization_id: 'org-1' }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(member))

      const result = await useOrganizationsStore.getState().acceptInvitation('token-123', 'u-1', 'Test User')

      expect(result.success).toBe(true)
      expect(result.member).toEqual(member)
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
      expect(useOrganizationsStore.getState().error).toBeNull()
    })

    it('returns success without userName parameter', async () => {
      const member = { id: 'm-1', role: 'member' }
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse(member))

      const result = await useOrganizationsStore.getState().acceptInvitation('token-123', 'u-1')

      expect(result.success).toBe(true)
      expect(result.member).toEqual(member)
    })

    it('returns error with string detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse('Token expired'))

      const result = await useOrganizationsStore.getState().acceptInvitation('bad-token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Token expired')
      expect(useOrganizationsStore.getState().error).toBe('Token expired')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('returns error with array detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([
          { msg: 'token is invalid' },
          { msg: 'user not found' },
        ])
      )

      const result = await useOrganizationsStore.getState().acceptInvitation('bad-token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('token is invalid')
      expect(result.error).toContain('user not found')
      expect(useOrganizationsStore.getState().error).toContain('token is invalid')
    })

    it('returns error with array detail without msg', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(
        mockErrorResponse([{ type: 'expired_token' }])
      )

      const result = await useOrganizationsStore.getState().acceptInvitation('bad-token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired_token')
    })

    it('returns error with non-array non-string detail', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockErrorResponse({ code: 'EXPIRED' }))

      const result = await useOrganizationsStore.getState().acceptInvitation('bad-token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to accept invitation')
    })

    it('handles network exception with Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(new Error('Connection refused'))

      const result = await useOrganizationsStore.getState().acceptInvitation('token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
      expect(useOrganizationsStore.getState().error).toBe('Connection refused')
      expect(useOrganizationsStore.getState().isLoading).toBe(false)
    })

    it('handles network exception with non-Error', async () => {
      vi.mocked(authFetch).mockRejectedValueOnce(undefined)

      const result = await useOrganizationsStore.getState().acceptInvitation('token', 'u-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to accept invitation')
      expect(useOrganizationsStore.getState().error).toBe('Failed to accept invitation')
    })

    it('sets isLoading true during request', async () => {
      let resolvePromise: (v: any) => void
      vi.mocked(authFetch).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useOrganizationsStore.getState().acceptInvitation('token', 'u-1')
      expect(useOrganizationsStore.getState().isLoading).toBe(true)
      expect(useOrganizationsStore.getState().error).toBeNull()

      resolvePromise!(mockOkResponse({ id: 'm-1' }))
      await promise
    })

    it('sends correct POST request with userName', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ id: 'm-1' }))

      await useOrganizationsStore.getState().acceptInvitation('token-abc', 'u-1', 'John Doe')

      expect(vi.mocked(authFetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/invitations/accept'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: 'token-abc',
            user_id: 'u-1',
            user_name: 'John Doe',
          }),
        })
      )
    })

    it('sends correct POST request without userName', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce(mockOkResponse({ id: 'm-1' }))

      await useOrganizationsStore.getState().acceptInvitation('token-abc', 'u-1')

      const callBody = JSON.parse(vi.mocked(authFetch).mock.calls[0][1]?.body as string)
      expect(callBody).toEqual({
        token: 'token-abc',
        user_id: 'u-1',
        user_name: undefined,
      })
    })
  })
})
