import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ProjectRole = 'owner' | 'editor' | 'viewer'

export interface ProjectAccessMember {
  id: string
  project_id: string
  user_id: string
  user_email: string | null
  user_name: string | null
  role: ProjectRole
  granted_by: string | null
  created_at: string
  updated_at: string
}

export interface MyAccess {
  project_id: string
  role: ProjectRole | null
  has_access: boolean
}

export interface ProjectInvitation {
  id: string
  project_id: string
  email: string
  role: string
  status: string
  expires_at: string
  created_at: string
}

export interface OrgMemberForProject {
  user_id: string
  email: string
  name: string | null
  org_role: string  // owner, admin, member, viewer
}

interface ProjectAccessState {
  members: ProjectAccessMember[]
  myAccess: MyAccess | null
  loading: boolean
  error: string | null
  invitations: ProjectInvitation[]
  isLoadingInvitations: boolean

  // Actions
  fetchMembers: (projectId: string) => Promise<void>
  addMember: (projectId: string, userId: string, role: ProjectRole) => Promise<void>
  updateRole: (projectId: string, userId: string, role: ProjectRole) => Promise<void>
  removeMember: (projectId: string, userId: string) => Promise<void>
  fetchMyAccess: (projectId: string) => Promise<void>
  clearError: () => void
  fetchInvitations: (projectId: string) => Promise<void>
  inviteByEmail: (projectId: string, email: string, role: string) => Promise<void>
  cancelInvitation: (projectId: string, invitationId: string) => Promise<void>
  acceptInvitation: (token: string) => Promise<{ project_id: string; role: string }>
  availableOrgMembers: OrgMemberForProject[]
  isLoadingAvailableMembers: boolean
  fetchAvailableOrgMembers: (projectId: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useProjectAccessStore = create<ProjectAccessState>((set, get) => ({
  members: [],
  myAccess: null,
  loading: false,
  error: null,
  invitations: [],
  isLoadingInvitations: false,
  availableOrgMembers: [],
  isLoadingAvailableMembers: false,

  fetchMembers: async (projectId: string) => {
    set({ loading: true, error: null, members: [] })  // 프로젝트 전환 시 이전 멤버 즉시 초기화
    try {
      const data = await apiClient.get<ProjectAccessMember[]>(
        `/api/projects/${projectId}/access`
      )
      set({ members: data, loading: false })
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  addMember: async (projectId: string, userId: string, role: ProjectRole) => {
    set({ loading: true, error: null })
    try {
      const newMember = await apiClient.post<ProjectAccessMember>(
        `/api/projects/${projectId}/access`,
        { user_id: userId, role }
      )
      set((state) => ({
        members: [...state.members, newMember],
        loading: false,
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  updateRole: async (projectId: string, userId: string, role: ProjectRole) => {
    set({ loading: true, error: null })
    try {
      const updated = await apiClient.put<ProjectAccessMember>(
        `/api/projects/${projectId}/access/${userId}`,
        { role }
      )
      set((state) => ({
        members: state.members.map((m) =>
          m.user_id === userId ? updated : m
        ),
        loading: false,
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  removeMember: async (projectId: string, userId: string) => {
    set({ loading: true, error: null })
    try {
      await apiClient.delete(
        `/api/projects/${projectId}/access/${userId}`
      )
      set((state) => ({
        members: state.members.filter((m) => m.user_id !== userId),
        loading: false,
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  fetchMyAccess: async (projectId: string) => {
    set({ myAccess: null })  // 프로젝트 전환 시 이전 값 초기화
    try {
      const data = await apiClient.get<MyAccess>(
        `/api/projects/${projectId}/access/me`
      )
      set({ myAccess: data })
    } catch {
      // 접근 권한 없으면 null 유지
    }
  },

  clearError: () => set({ error: null }),

  fetchInvitations: async (projectId: string) => {
    set({ isLoadingInvitations: true })
    try {
      const data = await apiClient.get<ProjectInvitation[]>(
        `/api/v1/projects/${projectId}/invitations`
      )
      set({ invitations: data, isLoadingInvitations: false })
    } catch {
      set({ isLoadingInvitations: false })
    }
  },

  inviteByEmail: async (projectId: string, email: string, role: string) => {
    await apiClient.post(
      `/api/v1/projects/${projectId}/invitations`,
      { email, role }
    )
    await get().fetchInvitations(projectId)
  },

  cancelInvitation: async (projectId: string, invitationId: string) => {
    await apiClient.delete(
      `/api/v1/projects/${projectId}/invitations/${invitationId}`
    )
    await get().fetchInvitations(projectId)
  },

  acceptInvitation: async (token: string) => {
    return apiClient.post<{ project_id: string; role: string }>(
      `/api/v1/invitations/${token}/accept`
    )
  },

  fetchAvailableOrgMembers: async (projectId: string) => {
    set({ isLoadingAvailableMembers: true })
    try {
      const data = await apiClient.get<{ members: OrgMemberForProject[] }>(
        `/api/project-registry/${projectId}/available-members`
      )
      set({ availableOrgMembers: data.members, isLoadingAvailableMembers: false })
    } catch {
      set({ availableOrgMembers: [], isLoadingAvailableMembers: false })
    }
  },
}))
