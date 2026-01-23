import { create } from 'zustand'

const API_BASE = '/api'

// Types matching backend models
export interface ProjectInfo {
  project_id: string
  project_name: string
  project_path: string
  claude_dir: string
  has_skills: boolean
  has_agents: boolean
  has_mcp: boolean
  has_hooks: boolean
  skill_count: number
  agent_count: number
  mcp_server_count: number
  last_modified: string
}

export interface SkillConfig {
  skill_id: string
  project_id: string
  name: string
  description: string
  file_path: string
  tools: string[]
  model: string | null
  version: string | null
  author: string | null
  has_references: boolean
  has_scripts: boolean
  has_assets: boolean
  created_at: string | null
  modified_at: string | null
}

export interface AgentConfig {
  agent_id: string
  project_id: string
  name: string
  description: string
  file_path: string
  tools: string[]
  model: string | null
  role: string | null
  ace_capabilities: Record<string, unknown> | null
  is_shared: boolean
  modified_at: string | null
}

export interface MCPServerConfig {
  server_id: string
  project_id: string
  command: string
  args: string[]
  env: Record<string, string>
  disabled: boolean
  note: string
  server_type: 'npx' | 'uvx' | 'command'
  package_name: string
}

export interface HookConfig {
  hook_id: string
  project_id: string
  event: string
  matcher: string
  command: string
  hook_type: string
  file_path: string
}

export interface ProjectConfigSummary {
  project: ProjectInfo
  skills: SkillConfig[]
  agents: AgentConfig[]
  mcp_servers: MCPServerConfig[]
  hooks: HookConfig[]
}

export interface ConfigChangeEvent {
  event_type: 'created' | 'modified' | 'deleted'
  project_id: string
  config_type: 'skills' | 'agents' | 'mcp' | 'hooks'
  item_id: string | null
  timestamp: string
  details: Record<string, unknown>
}

export type TabType = 'overview' | 'skills' | 'agents' | 'mcp' | 'hooks'

interface ProjectConfigsState {
  // Projects
  projects: ProjectInfo[]
  selectedProjectId: string | null
  selectedProject: ProjectConfigSummary | null
  isLoading: boolean
  isLoadingProject: boolean
  error: string | null

  // All items (across projects)
  allSkills: SkillConfig[]
  allAgents: AgentConfig[]
  isLoadingAll: boolean

  // Active tab
  activeTab: TabType

  // External paths
  externalPaths: string[]

  // Real-time updates
  eventSource: EventSource | null
  recentChanges: ConfigChangeEvent[]

  // Skill content
  skillContent: string | null
  skillReferences: string[]
  isLoadingContent: boolean

  // MCP toggle state
  togglingServers: Set<string>

  // Actions
  fetchProjects: () => Promise<void>
  selectProject: (projectId: string | null) => void
  fetchProjectSummary: (projectId: string) => Promise<void>
  fetchAllSkills: () => Promise<void>
  fetchAllAgents: () => Promise<void>
  fetchSkillContent: (projectId: string, skillId: string) => Promise<void>
  toggleMCPServer: (projectId: string, serverId: string, enabled: boolean) => Promise<void>
  addExternalPath: (path: string) => Promise<boolean>
  removeExternalPath: (path: string) => Promise<boolean>
  startStreaming: () => void
  stopStreaming: () => void
  setActiveTab: (tab: TabType) => void
  clearError: () => void
  refresh: () => Promise<void>
}

export const useProjectConfigsStore = create<ProjectConfigsState>((set, get) => ({
  // Initial state
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  isLoading: false,
  isLoadingProject: false,
  error: null,

  allSkills: [],
  allAgents: [],
  isLoadingAll: false,

  activeTab: 'overview',

  externalPaths: [],

  eventSource: null,
  recentChanges: [],

  skillContent: null,
  skillReferences: [],
  isLoadingContent: false,

  togglingServers: new Set(),

  // Actions
  fetchProjects: async () => {
    set({ isLoading: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs`)
      if (!res.ok) {
        throw new Error(`Failed to fetch projects: ${res.statusText}`)
      }

      const data = await res.json()
      set({
        projects: data.projects,
        isLoading: false,
      })

      // Auto-select first project if none selected
      const { selectedProjectId } = get()
      if (!selectedProjectId && data.projects.length > 0) {
        get().selectProject(data.projects[0].project_id)
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoading: false })
    }
  },

  selectProject: (projectId: string | null) => {
    set({ selectedProjectId: projectId, selectedProject: null })
    if (projectId) {
      get().fetchProjectSummary(projectId)
    }
  },

  fetchProjectSummary: async (projectId: string) => {
    set({ isLoadingProject: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch project: ${res.statusText}`)
      }

      const data: ProjectConfigSummary = await res.json()
      set({
        selectedProject: data,
        isLoadingProject: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingProject: false })
    }
  },

  fetchAllSkills: async () => {
    set({ isLoadingAll: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/skills/all`)
      if (!res.ok) {
        throw new Error(`Failed to fetch skills: ${res.statusText}`)
      }

      const data: SkillConfig[] = await res.json()
      set({
        allSkills: data,
        isLoadingAll: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingAll: false })
    }
  },

  fetchAllAgents: async () => {
    set({ isLoadingAll: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/agents/all`)
      if (!res.ok) {
        throw new Error(`Failed to fetch agents: ${res.statusText}`)
      }

      const data: AgentConfig[] = await res.json()
      set({
        allAgents: data,
        isLoadingAll: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingAll: false })
    }
  },

  fetchSkillContent: async (projectId: string, skillId: string) => {
    set({ isLoadingContent: true, skillContent: null, skillReferences: [] })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/skills/${skillId}/content`)
      if (!res.ok) {
        throw new Error(`Failed to fetch skill content: ${res.statusText}`)
      }

      const data = await res.json()
      set({
        skillContent: data.content,
        skillReferences: data.references,
        isLoadingContent: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  toggleMCPServer: async (projectId: string, serverId: string, enabled: boolean) => {
    const { togglingServers } = get()
    const key = `${projectId}:${serverId}`

    // Prevent double-toggle
    if (togglingServers.has(key)) return

    set({ togglingServers: new Set([...togglingServers, key]) })

    try {
      const endpoint = enabled ? 'enable' : 'disable'
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/mcp/${serverId}/${endpoint}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Failed to ${endpoint} server`)
      }

      // Update local state
      set((state) => {
        if (!state.selectedProject) return state

        return {
          selectedProject: {
            ...state.selectedProject,
            mcp_servers: state.selectedProject.mcp_servers.map((s) =>
              s.server_id === serverId ? { ...s, disabled: !enabled } : s
            ),
          },
        }
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
    } finally {
      set((state) => {
        const newSet = new Set(state.togglingServers)
        newSet.delete(key)
        return { togglingServers: newSet }
      })
    }
  },

  addExternalPath: async (path: string) => {
    try {
      const res = await fetch(`${API_BASE}/project-configs/external-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to add path')
      }

      // Refresh projects list
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  removeExternalPath: async (path: string) => {
    try {
      const encodedPath = encodeURIComponent(path)
      const res = await fetch(`${API_BASE}/project-configs/external-paths/${encodedPath}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to remove path')
      }

      // Refresh projects list
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  startStreaming: () => {
    const { eventSource: existing, stopStreaming } = get()

    if (existing) {
      stopStreaming()
    }

    const eventSource = new EventSource(`${API_BASE}/project-configs/stream`)

    eventSource.addEventListener('config_change', (event) => {
      try {
        const change: ConfigChangeEvent = JSON.parse(event.data)

        // Add to recent changes
        set((state) => ({
          recentChanges: [change, ...state.recentChanges.slice(0, 19)],
        }))

        // Refresh if change affects selected project
        const { selectedProjectId } = get()
        if (change.project_id === selectedProjectId) {
          get().fetchProjectSummary(selectedProjectId)
        }
      } catch (e) {
        console.error('Failed to parse config change:', e)
      }
    })

    eventSource.addEventListener('connected', () => {
      console.log('Connected to config stream')
    })

    eventSource.addEventListener('error', () => {
      console.warn('Config stream error, will reconnect...')
      stopStreaming()
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        get().startStreaming()
      }, 5000)
    })

    set({ eventSource })
  },

  stopStreaming: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({ eventSource: null })
    }
  },

  setActiveTab: (tab: TabType) => {
    set({ activeTab: tab })
  },

  clearError: () => {
    set({ error: null })
  },

  refresh: async () => {
    const { selectedProjectId, fetchProjects, fetchProjectSummary } = get()
    await fetchProjects()
    if (selectedProjectId) {
      await fetchProjectSummary(selectedProjectId)
    }
  },
}))
