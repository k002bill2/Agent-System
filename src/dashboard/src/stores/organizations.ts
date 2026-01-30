import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'
export type OrganizationPlan = 'free' | 'starter' | 'professional' | 'enterprise'
export type OrganizationStatus = 'active' | 'suspended' | 'pending' | 'deleted'
export type OrganizationModalMode = 'create' | 'edit' | 'invite' | null
export type OrganizationTab = 'overview' | 'members' | 'settings'

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  status: OrganizationStatus
  plan: OrganizationPlan
  contact_email: string | null
  contact_name: string | null
  logo_url: string | null
  primary_color: string | null
  max_members: number
  max_projects: number
  max_sessions_per_day: number
  max_tokens_per_month: number
  current_members: number
  current_projects: number
  tokens_used_this_month: number
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  email: string
  name: string | null
  role: MemberRole
  permissions: string[]
  is_active: boolean
  invited_by: string | null
  invited_at: string | null
  joined_at: string | null
  last_active_at: string | null
  created_at: string
}

export interface OrganizationStats {
  organization_id: string
  total_members: number
  active_members: number
  total_projects: number
  active_projects: number
  total_sessions: number
  sessions_today: number
  sessions_this_week: number
  tokens_used_today: number
  tokens_used_this_month: number
  total_cost_this_month: number
  api_calls_today: number
}

export interface OrganizationCreate {
  name: string
  slug: string
  description?: string
  contact_email?: string
  contact_name?: string
  plan?: OrganizationPlan
}

export interface CreateOrganizationRequest {
  organization: OrganizationCreate
  owner_user_id: string
  owner_email: string
  owner_name?: string
}

export interface OrganizationUpdate {
  name?: string
  description?: string
  contact_email?: string
  contact_name?: string
  logo_url?: string
  primary_color?: string
  settings?: Record<string, unknown>
}

export interface InviteMemberRequest {
  email: string
  role?: MemberRole
  name?: string
  message?: string
}

// ─────────────────────────────────────────────────────────────
// Store State
// ─────────────────────────────────────────────────────────────

interface OrganizationsState {
  // State
  organizations: Organization[]
  currentOrganization: Organization | null
  members: OrganizationMember[]
  stats: OrganizationStats | null
  userMemberships: OrganizationMember[]
  isLoading: boolean
  error: string | null
  modalMode: OrganizationModalMode
  activeTab: OrganizationTab

  // Actions
  setModalMode: (mode: OrganizationModalMode) => void
  setActiveTab: (tab: OrganizationTab) => void
  setCurrentOrganization: (org: Organization | null) => void
  clearError: () => void

  // Organization CRUD
  fetchOrganizations: () => Promise<void>
  fetchOrganization: (orgId: string) => Promise<void>
  createOrganization: (data: CreateOrganizationRequest) => Promise<boolean>
  updateOrganization: (orgId: string, data: OrganizationUpdate) => Promise<boolean>
  deleteOrganization: (orgId: string) => Promise<boolean>

  // Members
  fetchMembers: (orgId: string) => Promise<void>
  inviteMember: (orgId: string, data: InviteMemberRequest, invitedBy?: string) => Promise<boolean>
  updateMemberRole: (orgId: string, memberId: string, role: MemberRole) => Promise<boolean>
  removeMember: (orgId: string, memberId: string) => Promise<boolean>

  // User's memberships
  fetchUserMemberships: (userId: string) => Promise<void>
  getCurrentUserRole: (orgId: string, userId: string) => MemberRole | null

  // Stats
  fetchStats: (orgId: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useOrganizationsStore = create<OrganizationsState>((set, get) => ({
  // Initial state
  organizations: [],
  currentOrganization: null,
  members: [],
  stats: null,
  userMemberships: [],
  isLoading: false,
  error: null,
  modalMode: null,
  activeTab: 'overview',

  // UI Actions
  setModalMode: (mode) => set({ modalMode: mode }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentOrganization: (org) => set({ currentOrganization: org }),
  clearError: () => set({ error: null }),

  // ─────────────────────────────────────────────────────────────
  // Organization CRUD
  // ─────────────────────────────────────────────────────────────

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations`)
      if (!response.ok) {
        throw new Error('Failed to fetch organizations')
      }
      const data = await response.json()
      set({ organizations: data, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch organizations',
        isLoading: false,
      })
    }
  },

  fetchOrganization: async (orgId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations/${orgId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch organization')
      }
      const data = await response.json()
      set({ currentOrganization: data, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch organization',
        isLoading: false,
      })
    }
  },

  createOrganization: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorData = await response.json()
        // Handle FastAPI validation errors (array format)
        let errorMessage = 'Failed to create organization'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      const newOrg = await response.json()
      set((state) => ({
        organizations: [...state.organizations, newOrg],
        currentOrganization: newOrg,
        isLoading: false,
        modalMode: null,
      }))
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create organization',
        isLoading: false,
      })
      return false
    }
  },

  updateOrganization: async (orgId, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Failed to update organization'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      const updatedOrg = await response.json()
      set((state) => ({
        organizations: state.organizations.map((org) =>
          org.id === orgId ? updatedOrg : org
        ),
        currentOrganization:
          state.currentOrganization?.id === orgId ? updatedOrg : state.currentOrganization,
        isLoading: false,
        modalMode: null,
      }))
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update organization',
        isLoading: false,
      })
      return false
    }
  },

  deleteOrganization: async (orgId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations/${orgId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Failed to delete organization'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      set((state) => ({
        organizations: state.organizations.filter((org) => org.id !== orgId),
        currentOrganization:
          state.currentOrganization?.id === orgId ? null : state.currentOrganization,
        isLoading: false,
      }))
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete organization',
        isLoading: false,
      })
      return false
    }
  },

  // ─────────────────────────────────────────────────────────────
  // Members
  // ─────────────────────────────────────────────────────────────

  fetchMembers: async (orgId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations/${orgId}/members`)
      if (!response.ok) {
        throw new Error('Failed to fetch members')
      }
      const data = await response.json()
      set({ members: data, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch members',
        isLoading: false,
      })
    }
  },

  inviteMember: async (orgId, data, invitedBy?: string) => {
    set({ isLoading: true, error: null })
    try {
      // invited_by는 필수 쿼리 파라미터
      const url = new URL(`${API_BASE_URL}/api/organizations/${orgId}/members/invite`)
      if (invitedBy) {
        url.searchParams.set('invited_by', invitedBy)
      }
      const response = await authFetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Failed to invite member'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      // Refresh members list
      await get().fetchMembers(orgId)
      set({ isLoading: false, modalMode: null })
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to invite member',
        isLoading: false,
      })
      return false
    }
  },

  updateMemberRole: async (orgId, memberId, role) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/organizations/${orgId}/members/${memberId}/role`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      )
      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Failed to update member role'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      const updatedMember = await response.json()
      set((state) => ({
        members: state.members.map((m) => (m.id === memberId ? updatedMember : m)),
        isLoading: false,
      }))
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update member role',
        isLoading: false,
      })
      return false
    }
  },

  removeMember: async (orgId, memberId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/organizations/${orgId}/members/${memberId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Failed to remove member'
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: { loc?: string[]; msg?: string }) =>
              err.msg || JSON.stringify(err)
            )
            .join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
        throw new Error(errorMessage)
      }
      set((state) => ({
        members: state.members.filter((m) => m.id !== memberId),
        isLoading: false,
      }))
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove member',
        isLoading: false,
      })
      return false
    }
  },

  // ─────────────────────────────────────────────────────────────
  // User Memberships
  // ─────────────────────────────────────────────────────────────

  fetchUserMemberships: async (userId) => {
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/organizations/user/${userId}/organizations`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch user memberships')
      }
      const data = await response.json()
      set({ userMemberships: data })
    } catch (error) {
      console.error('Failed to fetch user memberships:', error)
    }
  },

  getCurrentUserRole: (orgId, userId) => {
    const { userMemberships, members } = get()

    // First check userMemberships (if user memberships have been loaded)
    const userMembership = userMemberships.find(
      (m) => m.organization_id === orgId && m.user_id === userId
    )
    if (userMembership) {
      return userMembership.role
    }

    // Fallback to members list (if viewing the organization)
    const member = members.find((m) => m.user_id === userId)
    if (member) {
      return member.role
    }

    return null
  },

  // ─────────────────────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────────────────────

  fetchStats: async (orgId) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/organizations/${orgId}/stats`)
      if (!response.ok) {
        throw new Error('Failed to fetch organization stats')
      }
      const data = await response.json()
      set({ stats: data })
    } catch (error) {
      console.error('Failed to fetch organization stats:', error)
    }
  },
}))
