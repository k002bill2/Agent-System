import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Project {
  id: string
  name: string
  path: string
  description: string
  has_claude_md: boolean
  vector_store_initialized: boolean
  indexed_at: string | null
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

  // Actions - Data
  fetchProjects: () => Promise<void>
  fetchTemplates: () => Promise<void>
  createProject: (id: string, name: string, description: string, template: string) => Promise<boolean>
  linkProject: (id: string, sourcePath: string) => Promise<boolean>
  updateProject: (id: string, name?: string, description?: string, path?: string) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  indexProject: (id: string) => Promise<boolean>

  // Actions - Modal
  openCreateModal: () => void
  openLinkModal: () => void
  openEditModal: (project: Project) => void
  closeModal: () => void

  // Actions - Search
  setSearchQuery: (query: string) => void

  // Computed
  filteredProjects: () => Project[]
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
        throw new Error(data.detail || 'Failed to create project')
      }
      await get().fetchProjects()
      set({ isLoading: false, modalMode: null })
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
        throw new Error(data.detail || 'Failed to link project')
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
        throw new Error(data.detail || 'Failed to update project')
      }
      await get().fetchProjects()
      set({ isLoading: false, modalMode: null, editingProject: null })
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
        throw new Error(data.detail || 'Failed to delete project')
      }
      await get().fetchProjects()
      set({ isLoading: false })
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
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to index project')
      }
      await get().fetchProjects()
      set({ isLoading: false })
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
}))
