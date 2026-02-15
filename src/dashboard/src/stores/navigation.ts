import { create } from 'zustand'

export type ViewType =
  | 'login'
  | 'register'
  | 'auth-callback-google'
  | 'auth-callback-github'
  | 'invitation-accept'
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'agents'
  | 'activity'
  | 'monitor'
  | 'claude-sessions'
  | 'project-configs'
  | 'project-management'
  | 'git'
  | 'organizations'
  | 'audit'
  | 'notifications'
  | 'analytics'
  | 'workflows'
  | 'playground'
  | 'admin'
  | 'settings'

// Views that don't require authentication
export const PUBLIC_VIEWS: ViewType[] = ['login', 'register', 'auth-callback-google', 'auth-callback-github', 'invitation-accept']

// Check if a view is public (doesn't require auth)
export function isPublicView(view: ViewType): boolean {
  return PUBLIC_VIEWS.includes(view)
}

interface NavigationState {
  currentView: ViewType
  projectFilter: string | null  // null = All Projects
  pendingTaskInput: string | null  // Task Analyzer로 전달할 초기 입력값
  setView: (view: ViewType) => void
  setProjectFilter: (projectId: string | null) => void
  setPendingTaskInput: (text: string | null) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'dashboard',
  projectFilter: null,
  pendingTaskInput: null,
  setView: (view) => set({ currentView: view }),
  setProjectFilter: (projectId) => set({ projectFilter: projectId }),
  setPendingTaskInput: (text) => set({ pendingTaskInput: text }),
}))
