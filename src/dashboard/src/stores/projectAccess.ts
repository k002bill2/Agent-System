import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

interface ProjectAccessState {
  members: ProjectAccessMember[]
  myAccess: MyAccess | null
  loading: boolean
  error: string | null

  // Actions
  fetchMembers: (projectId: string) => Promise<void>
  addMember: (projectId: string, userId: string, role: ProjectRole) => Promise<void>
  updateRole: (projectId: string, userId: string, role: ProjectRole) => Promise<void>
  removeMember: (projectId: string, userId: string) => Promise<void>
  fetchMyAccess: (projectId: string) => Promise<void>
  clearError: () => void
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useProjectAccessStore = create<ProjectAccessState>((set) => ({
  members: [],
  myAccess: null,
  loading: false,
  error: null,

  fetchMembers: async (projectId: string) => {
    set({ loading: true, error: null })
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/projects/${projectId}/access`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Failed to fetch members')
      }
      const data = await res.json()
      set({ members: data, loading: false })
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  addMember: async (projectId: string, userId: string, role: ProjectRole) => {
    set({ loading: true, error: null })
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/projects/${projectId}/access`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, role }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Failed to add member')
      }
      const newMember = await res.json()
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
      const res = await authFetch(
        `${API_BASE_URL}/api/projects/${projectId}/access/${userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Failed to update role')
      }
      const updated = await res.json()
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
      const res = await authFetch(
        `${API_BASE_URL}/api/projects/${projectId}/access/${userId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Failed to remove member')
      }
      set((state) => ({
        members: state.members.filter((m) => m.user_id !== userId),
        loading: false,
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  fetchMyAccess: async (projectId: string) => {
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/projects/${projectId}/access/me`
      )
      if (!res.ok) {
        set({ myAccess: null })
        return
      }
      const data = await res.json()
      set({ myAccess: data })
    } catch {
      set({ myAccess: null })
    }
  },

  clearError: () => set({ error: null }),
}))
