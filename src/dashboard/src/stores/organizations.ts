import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

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

export interface QuotaCheckResult {
  allowed: boolean
  current: number
  limit: number
  message: string
}

export interface QuotaStatus {
  organization_id: string
  plan: string
  members: QuotaCheckResult
  projects: QuotaCheckResult
  sessions: QuotaCheckResult
  tokens: QuotaCheckResult
}

export interface MemberUsageSummary {
  id: string
  user_id: string
  email: string
  name: string | null
  role: MemberRole
  tokens_used_today: number
  tokens_used_this_month: number
  tokens_used_period: number
  sessions_today: number
  sessions_this_month: number
  sessions_period: number
  last_active_at: string | null
  percentage_of_org: number
}

export interface MemberUsageResponse {
  organization_id: string
  period: string
  total_tokens: number
  members: MemberUsageSummary[]
}

export interface MemberDailyUsage {
  date: string
  tokens: number
  sessions: number
  cost_usd: number
}

export interface MemberModelUsage {
  model: string
  tokens: number
  sessions: number
  percentage: number
}

export interface MemberUsageDetail {
  user_id: string
  email: string
  name: string | null
  role: MemberRole
  permissions: string[]
  is_active: boolean
  invited_by: string | null
  joined_at: string | null
  last_active_at: string | null
  tokens_used_today: number
  tokens_used_this_month: number
  sessions_today: number
  sessions_this_month: number
  total_cost_usd: number
  percentage_of_org: number
  daily_usage: MemberDailyUsage[]
  model_usage: MemberModelUsage[]
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
  quotaStatus: QuotaStatus | null
  memberUsage: MemberUsageResponse | null
  memberUsageDetail: MemberUsageDetail | null
  isMemberDetailLoading: boolean
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

  // Stats & Quota
  fetchStats: (orgId: string) => Promise<void>
  fetchQuotaStatus: (orgId: string) => Promise<void>
  fetchMemberUsage: (orgId: string, period?: string) => Promise<void>
  fetchMemberUsageDetail: (orgId: string, userId: string, period?: string, memberId?: string) => Promise<void>
  clearMemberUsageDetail: () => void

  // Invitation
  acceptInvitation: (token: string, userId: string, userName?: string) => Promise<{ success: boolean; member?: OrganizationMember; error?: string }>
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
  quotaStatus: null,
  memberUsage: null,
  memberUsageDetail: null,
  isMemberDetailLoading: false,
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
      const data = await apiClient.get<Organization[]>('/api/organizations')
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
      const data = await apiClient.get<Organization>(`/api/organizations/${orgId}`)
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
      const newOrg = await apiClient.post<Organization>('/api/organizations', data)
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
      const updatedOrg = await apiClient.patch<Organization>(`/api/organizations/${orgId}`, data)
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
      await apiClient.delete(`/api/organizations/${orgId}`)
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
      const data = await apiClient.get<OrganizationMember[]>(`/api/organizations/${orgId}/members`)
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
      const queryParam = invitedBy ? `?invited_by=${encodeURIComponent(invitedBy)}` : ''
      await apiClient.post(
        `/api/organizations/${orgId}/members/invite${queryParam}`,
        data
      )
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
      const updatedMember = await apiClient.patch<OrganizationMember>(
        `/api/organizations/${orgId}/members/${memberId}/role`,
        { role }
      )
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
      await apiClient.delete(
        `/api/organizations/${orgId}/members/${memberId}`
      )
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
      const data = await apiClient.get<OrganizationMember[]>(
        `/api/organizations/user/${userId}/organizations`
      )
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
      const data = await apiClient.get<OrganizationStats>(`/api/organizations/${orgId}/stats`)
      set({ stats: data })
    } catch (error) {
      console.error('Failed to fetch organization stats:', error)
    }
  },

  fetchQuotaStatus: async (orgId) => {
    try {
      const data = await apiClient.get<QuotaStatus>(`/api/organizations/${orgId}/quota`)
      set({ quotaStatus: data })
    } catch (error) {
      console.error('Failed to fetch quota status:', error)
    }
  },

  fetchMemberUsage: async (orgId, period = 'month') => {
    try {
      const data = await apiClient.get<MemberUsageResponse>(
        `/api/organizations/${orgId}/members/usage?period=${period}`
      )
      set({ memberUsage: data })
    } catch (error) {
      console.error('Failed to fetch member usage:', error)
    }
  },

  fetchMemberUsageDetail: async (orgId, userId, period = 'month', memberId) => {
    set({ isMemberDetailLoading: true })
    try {
      const params = new URLSearchParams({ period })
      if (memberId) params.set('member_id', memberId)
      const data = await apiClient.get<MemberUsageDetail>(
        `/api/organizations/${orgId}/members/${userId}/usage-detail?${params.toString()}`
      )
      set({ memberUsageDetail: data, isMemberDetailLoading: false })
    } catch (error) {
      console.error('Failed to fetch member usage detail:', error)
      set({ memberUsageDetail: null, isMemberDetailLoading: false })
    }
  },

  clearMemberUsageDetail: () => set({ memberUsageDetail: null }),

  // ─────────────────────────────────────────────────────────────
  // Invitation
  // ─────────────────────────────────────────────────────────────

  acceptInvitation: async (token, userId, userName) => {
    set({ isLoading: true, error: null })
    try {
      const member = await apiClient.post<OrganizationMember>(
        '/api/organizations/invitations/accept',
        { token, user_id: userId, user_name: userName }
      )
      set({ isLoading: false })
      return { success: true, member }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to accept invitation'
      set({
        error: errorMessage,
        isLoading: false,
      })
      return { success: false, error: errorMessage }
    }
  },
}))
