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
  hook_count: number
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

export type MCPServerSource = 'user' | 'project'

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
  source: MCPServerSource
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
  user_mcp_servers: MCPServerConfig[]
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

// MCP Modal Types
export type MCPModalMode = 'create' | 'edit' | null

// Skill/Agent Modal Types
export type SkillModalMode = 'create' | 'edit' | null
export type AgentModalMode = 'create' | 'edit' | null

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

  // MCP Modal state
  mcpModalMode: MCPModalMode
  editingMCPServer: MCPServerConfig | null
  savingMCP: boolean
  deletingMCP: Set<string>

  // Skill Modal state
  skillModalMode: SkillModalMode
  editingSkill: SkillConfig | null
  savingSkill: boolean
  deletingSkills: Set<string>

  // Agent Modal state
  agentModalMode: AgentModalMode
  editingAgent: AgentConfig | null
  agentContent: string | null
  savingAgent: boolean
  deletingAgents: Set<string>

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
  removeProject: (projectId: string) => Promise<boolean>
  startStreaming: () => void
  stopStreaming: () => void
  setActiveTab: (tab: TabType) => void
  clearError: () => void
  refresh: () => Promise<void>

  // MCP CRUD actions
  openMCPModal: (mode: 'create' | 'edit', server?: MCPServerConfig) => void
  closeMCPModal: () => void
  createMCPServer: (projectId: string, data: {
    server_id: string
    command: string
    args: string[]
    env: Record<string, string>
    disabled: boolean
    note: string
  }) => Promise<boolean>
  updateMCPServer: (projectId: string, serverId: string, data: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
    note?: string
  }) => Promise<boolean>
  deleteMCPServer: (projectId: string, serverId: string) => Promise<boolean>

  // Skill CRUD actions
  openSkillModal: (mode: 'create' | 'edit', skill?: SkillConfig) => void
  closeSkillModal: () => void
  createSkill: (projectId: string, skillId: string, content: string) => Promise<boolean>
  updateSkill: (projectId: string, skillId: string, content: string) => Promise<boolean>
  deleteSkill: (projectId: string, skillId: string) => Promise<boolean>

  // Agent CRUD actions
  openAgentModal: (mode: 'create' | 'edit', agent?: AgentConfig) => void
  closeAgentModal: () => void
  fetchAgentContent: (projectId: string, agentId: string) => Promise<void>
  createAgent: (projectId: string, agentId: string, content: string, isShared: boolean) => Promise<boolean>
  updateAgent: (projectId: string, agentId: string, content: string) => Promise<boolean>
  deleteAgent: (projectId: string, agentId: string) => Promise<boolean>

  // Hooks CRUD actions
  addHookEntry: (projectId: string, event: string, matcher: string, hooks: { type: string; command: string }[]) => Promise<boolean>
  deleteHook: (projectId: string, event: string, index: number) => Promise<boolean>
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

  // MCP Modal state
  mcpModalMode: null,
  editingMCPServer: null,
  savingMCP: false,
  deletingMCP: new Set(),

  // Skill Modal state
  skillModalMode: null,
  editingSkill: null,
  savingSkill: false,
  deletingSkills: new Set(),

  // Agent Modal state
  agentModalMode: null,
  editingAgent: null,
  agentContent: null,
  savingAgent: false,
  deletingAgents: new Set(),

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

  removeProject: async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/remove`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to remove project')
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

  // MCP CRUD actions
  openMCPModal: (mode, server) => {
    set({
      mcpModalMode: mode,
      editingMCPServer: server || null,
    })
  },

  closeMCPModal: () => {
    set({
      mcpModalMode: null,
      editingMCPServer: null,
    })
  },

  createMCPServer: async (projectId, data) => {
    set({ savingMCP: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to create MCP server')
      }

      // Refresh project data
      await get().fetchProjectSummary(projectId)
      set({ mcpModalMode: null, editingMCPServer: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingMCP: false })
    }
  },

  updateMCPServer: async (projectId, serverId, data) => {
    set({ savingMCP: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/mcp/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to update MCP server')
      }

      // Refresh project data
      await get().fetchProjectSummary(projectId)
      set({ mcpModalMode: null, editingMCPServer: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingMCP: false })
    }
  },

  deleteMCPServer: async (projectId, serverId) => {
    const key = `${projectId}:${serverId}`
    set((state) => ({ deletingMCP: new Set([...state.deletingMCP, key]) }))

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/mcp/${serverId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to delete MCP server')
      }

      // Refresh project data
      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingMCP)
        newSet.delete(key)
        return { deletingMCP: newSet }
      })
    }
  },

  // Skill CRUD actions
  openSkillModal: (mode, skill) => {
    set({
      skillModalMode: mode,
      editingSkill: skill || null,
      skillContent: null,
    })
    // If editing, fetch the content
    if (mode === 'edit' && skill) {
      get().fetchSkillContent(skill.project_id, skill.skill_id)
    }
  },

  closeSkillModal: () => {
    set({
      skillModalMode: null,
      editingSkill: null,
      skillContent: null,
    })
  },

  createSkill: async (projectId, skillId, content) => {
    set({ savingSkill: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId, content }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to create skill')
      }

      await get().fetchProjectSummary(projectId)
      set({ skillModalMode: null, editingSkill: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingSkill: false })
    }
  },

  updateSkill: async (projectId, skillId, content) => {
    set({ savingSkill: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/skills/${skillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to update skill')
      }

      await get().fetchProjectSummary(projectId)
      set({ skillModalMode: null, editingSkill: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingSkill: false })
    }
  },

  deleteSkill: async (projectId, skillId) => {
    const key = `${projectId}:${skillId}`
    set((state) => ({ deletingSkills: new Set([...state.deletingSkills, key]) }))

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/skills/${skillId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to delete skill')
      }

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingSkills)
        newSet.delete(key)
        return { deletingSkills: newSet }
      })
    }
  },

  // Agent CRUD actions
  openAgentModal: (mode, agent) => {
    set({
      agentModalMode: mode,
      editingAgent: agent || null,
      agentContent: null,
    })
    // If editing, fetch the content
    if (mode === 'edit' && agent) {
      get().fetchAgentContent(agent.project_id, agent.agent_id)
    }
  },

  closeAgentModal: () => {
    set({
      agentModalMode: null,
      editingAgent: null,
      agentContent: null,
    })
  },

  fetchAgentContent: async (projectId, agentId) => {
    set({ isLoadingContent: true })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/agents/${agentId}/content`)
      if (!res.ok) {
        throw new Error('Failed to fetch agent content')
      }

      const data = await res.json()
      set({ agentContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  createAgent: async (projectId, agentId, content, isShared) => {
    set({ savingAgent: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, content, is_shared: isShared }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to create agent')
      }

      await get().fetchProjectSummary(projectId)
      set({ agentModalMode: null, editingAgent: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingAgent: false })
    }
  },

  updateAgent: async (projectId, agentId, content) => {
    set({ savingAgent: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to update agent')
      }

      await get().fetchProjectSummary(projectId)
      set({ agentModalMode: null, editingAgent: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingAgent: false })
    }
  },

  deleteAgent: async (projectId, agentId) => {
    const key = `${projectId}:${agentId}`
    set((state) => ({ deletingAgents: new Set([...state.deletingAgents, key]) }))

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/agents/${agentId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to delete agent')
      }

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingAgents)
        newSet.delete(key)
        return { deletingAgents: newSet }
      })
    }
  },

  // Hooks CRUD actions
  addHookEntry: async (projectId, event, matcher, hooks) => {
    set({ error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/hooks/events/${event}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matcher, hooks }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to add hook')
      }

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  deleteHook: async (projectId, event, index) => {
    set({ error: null })

    try {
      const res = await fetch(`${API_BASE}/project-configs/${projectId}/hooks/${event}/${index}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to delete hook')
      }

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },
}))
