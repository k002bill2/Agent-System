import { create } from 'zustand'
import { analytics } from '../services/analytics'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Helper to extract error message from API response
function extractErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const obj = detail as Record<string, unknown>
    if (obj.message && typeof obj.message === 'string') return obj.message
    if (obj.msg && typeof obj.msg === 'string') return obj.msg
    // FastAPI validation errors
    if (Array.isArray(detail)) {
      return detail.map((e: { msg?: string }) => e.msg || '').filter(Boolean).join(', ') || fallback
    }
    return JSON.stringify(detail)
  }
  return fallback
}

export interface Project {
  id: string
  name: string
  path: string
  description: string
  has_claude_md: boolean
  vector_store_initialized: boolean
  indexed_at: string | null
  git_path: string | null
  git_enabled: boolean
  sort_order: number
}

export interface DeletionPreview {
  project_id: string
  project_name: string
  project_path: string
  sessions_count: number
  tasks_count: number
  messages_count: number
  approvals_count: number
  feedbacks_count: number
  dataset_entries_count: number
  has_rag_index: boolean
  rag_chunks_count: number
  has_symlink: boolean
  source_files_preserved: boolean
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
}

export type ModalMode = 'create' | 'link' | 'edit' | null

interface ProjectsState {
  // Data
  projects: Project[]
  templates: ProjectTemplate[]
  isLoading: boolean
  error: string | null

  // Modal state
  modalMode: ModalMode
  editingProject: Project | null

  // Search/Filter
  searchQuery: string

  // Selected project for details panel
  selectedProjectId: string | null

  // Actions - Data
  fetchProjects: () => Promise<void>
  fetchTemplates: () => Promise<void>
  createProject: (id: string, name: string, description: string, template: string) => Promise<boolean>
  linkProject: (id: string, sourcePath: string) => Promise<boolean>
  updateProject: (id: string, name?: string, description?: string, path?: string) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  indexProject: (id: string) => Promise<boolean>
  fetchDeletionPreview: (id: string) => Promise<DeletionPreview | null>
  reorderProjects: (projectIds: string[]) => Promise<boolean>

  // Actions - Modal
  openCreateModal: () => void
  openLinkModal: () => void
  openEditModal: (project: Project) => void
  closeModal: () => void

  // Actions - Search
  setSearchQuery: (query: string) => void

  // Actions - Selection
  selectProject: (id: string | null) => void

  // Computed
  filteredProjects: () => Project[]
  getSelectedProject: () => Project | null
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  // Initial state
  projects: [],
  templates: [],
  isLoading: false,
  error: null,
  modalMode: null,
  editingProject: null,
  searchQuery: '',
  selectedProjectId: null,

  // Fetch all projects
  fetchProjects: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects`)
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`)
      }
      const projects = await response.json()
      set({ projects, isLoading: false })

      // Auto-select first project if none selected
      const { selectedProjectId } = get()
      if (!selectedProjectId && projects.length > 0) {
        set({ selectedProjectId: projects[0].id })
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  // Fetch available templates
  fetchTemplates: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/templates`)
      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`)
      }
      const templates = await response.json()
      set({ templates })
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  },

  // Create a new project from template
  createProject: async (id, name, description, template) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, description, template }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to create project'))
      }
      await get().fetchProjects()
      set({ isLoading: false, modalMode: null })
      analytics.track('project_created', { project_id: id, name, template })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Link an external project
  linkProject: async (id, sourcePath) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, source_path: sourcePath }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to link project'))
      }
      await get().fetchProjects()
      set({ isLoading: false, modalMode: null })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Update project metadata
  updateProject: async (id, name, description, path) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, path }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to update project'))
      }
      await get().fetchProjects()
      set({ isLoading: false, modalMode: null, editingProject: null })
      analytics.track('project_updated', { project_id: id })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Delete a project
  deleteProject: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to delete project'))
      }
      await get().fetchProjects()
      set({ isLoading: false })
      analytics.track('project_deleted', { project_id: id })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Index project for RAG
  indexProject: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/rag/projects/${id}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_reindex: false }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to index project'))
      }
      await get().fetchProjects()
      set({ isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Fetch deletion preview
  fetchDeletionPreview: async (id) => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}/deletion-preview`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to fetch deletion preview'))
      }
      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  // Reorder projects
  reorderProjects: async (projectIds) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/projects/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: projectIds }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(extractErrorMessage(data.detail, 'Failed to reorder projects'))
      }
      const reorderedProjects = await response.json()
      set({ projects: reorderedProjects, isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  // Modal actions
  openCreateModal: () => set({ modalMode: 'create', editingProject: null, error: null }),
  openLinkModal: () => set({ modalMode: 'link', editingProject: null, error: null }),
  openEditModal: (project) => set({ modalMode: 'edit', editingProject: project, error: null }),
  closeModal: () => set({ modalMode: null, editingProject: null, error: null }),

  // Search
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Selection
  selectProject: (id) => set({ selectedProjectId: id }),

  // Computed: filtered projects
  filteredProjects: () => {
    const { projects, searchQuery } = get()
    if (!searchQuery.trim()) return projects

    const query = searchQuery.toLowerCase()
    return projects.filter(
      (p) =>
        p.id.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.path.toLowerCase().includes(query)
    )
  },

  // Computed: get selected project
  getSelectedProject: () => {
    const { projects, selectedProjectId } = get()
    if (!selectedProjectId) return null
    return projects.find((p) => p.id === selectedProjectId) || null
  },
}))
