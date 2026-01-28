import { create } from 'zustand'

export type ViewType =
  | 'login'
  | 'register'
  | 'auth-callback-google'
  | 'auth-callback-github'
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'agents'
  | 'activity'
  | 'monitor'
  | 'claude-sessions'
  | 'project-configs'
  | 'git'
  | 'organizations'
  | 'audit'
  | 'notifications'
  | 'analytics'
  | 'playground'
  | 'settings'

// Views that don't require authentication
export const PUBLIC_VIEWS: ViewType[] = ['login', 'register', 'auth-callback-google', 'auth-callback-github']

// Check if a view is public (doesn't require auth)
export function isPublicView(view: ViewType): boolean {
  return PUBLIC_VIEWS.includes(view)
}

interface NavigationState {
  currentView: ViewType
  projectFilter: string | null  // null = All Projects
  setView: (view: ViewType) => void
  setProjectFilter: (projectId: string | null) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'dashboard',
  projectFilter: null,
  setView: (view) => set({ currentView: view }),
  setProjectFilter: (projectId) => set({ projectFilter: projectId }),
}))
