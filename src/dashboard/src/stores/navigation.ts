import { create } from 'zustand'

export type ViewType =
  | 'login'
  | 'register'
  | 'auth-callback-google'
  | 'auth-callback-github'
  | 'invitation-accept'
  | 'dashboard'
  | 'projects'
  | 'sessions'
  | 'agents'
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
  | 'external-usage'
  | 'admin'
  | 'settings'

// Views that don't require authentication
export const PUBLIC_VIEWS: ViewType[] = ['login', 'register', 'auth-callback-google', 'auth-callback-github', 'invitation-accept']

// Check if a view is public (doesn't require auth)
export function isPublicView(view: ViewType): boolean {
  return PUBLIC_VIEWS.includes(view)
}

// ViewType → URL path mapping
function viewToPath(view: ViewType): string {
  if (view === 'dashboard') return '/'
  return `/${view}`
}

// URL path → ViewType mapping
function pathToView(pathname: string): ViewType {
  if (pathname === '/') return 'dashboard'

  // Handle auth callback paths
  if (pathname === '/auth/callback/google') return 'auth-callback-google'
  if (pathname === '/auth/callback/github') return 'auth-callback-github'
  if (pathname === '/invitations/accept') return 'invitation-accept'

  // Strip leading slash
  const segment = pathname.replace(/^\//, '') as ViewType
  return segment || 'dashboard'
}

interface NavigationState {
  currentView: ViewType
  projectFilter: string | null  // null = All Projects
  pendingTaskInput: string | null  // Task Analyzer로 전달할 초기 입력값
  setView: (view: ViewType) => void
  setProjectFilter: (projectId: string | null) => void
  setPendingTaskInput: (text: string | null) => void
  /** Sync store from current URL (call on popstate or initial load) */
  syncFromUrl: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: pathToView(window.location.pathname),
  projectFilter: null,
  pendingTaskInput: null,
  setView: (view) => {
    const path = viewToPath(view)
    // Only pushState if path actually changed to avoid duplicate entries
    if (window.location.pathname !== path) {
      window.history.pushState({ view }, '', path)
    }
    set({ currentView: view })
  },
  setProjectFilter: (projectId) => set({ projectFilter: projectId }),
  setPendingTaskInput: (text) => set({ pendingTaskInput: text }),
  syncFromUrl: () => {
    const view = pathToView(window.location.pathname)
    set({ currentView: view })
  },
}))

// Listen for browser back/forward navigation
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    useNavigationStore.getState().syncFromUrl()
  })
}
