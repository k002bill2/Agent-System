import { create } from 'zustand'

export type ViewType = 'dashboard' | 'projects' | 'tasks' | 'agents' | 'activity' | 'monitor' | 'settings'

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
