import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import { getApiUrl } from '../config/api'

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
  has_commands: boolean
  has_rules: boolean
  has_memory: boolean
  skill_count: number
  agent_count: number
  mcp_server_count: number
  hook_count: number
  command_count: number
  rule_count: number
  memory_count: number
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

export interface CommandConfig {
  command_id: string
  project_id: string
  name: string
  description: string
  file_path: string
  allowed_tools: string | null
  argument_hint: string | null
  modified_at: string | null
}

export interface MemoryConfig {
  memory_id: string
  project_id: string
  name: string
  description: string
  file_path: string
  memory_type: string
  modified_at: string | null
}

export interface RuleConfig {
  rule_id: string
  project_id: string
  name: string
  description: string
  file_path: string
  is_global: boolean
  modified_at: string | null
}

export interface ProjectConfigSummary {
  project: ProjectInfo
  skills: SkillConfig[]
  agents: AgentConfig[]
  mcp_servers: MCPServerConfig[]
  user_mcp_servers: MCPServerConfig[]
  hooks: HookConfig[]
  commands: CommandConfig[]
  rules: RuleConfig[]
  memories: MemoryConfig[]
}

export interface GlobalConfigSummary {
  agents: AgentConfig[]
  skills: SkillConfig[]
  hooks: HookConfig[]
  mcp_servers: MCPServerConfig[]
  rules: RuleConfig[]
}

export interface ConfigChangeEvent {
  event_type: 'created' | 'modified' | 'deleted'
  project_id: string
  config_type: 'skills' | 'agents' | 'mcp' | 'hooks'
  item_id: string | null
  timestamp: string
  details: Record<string, unknown>
}

// DB-managed project types
export interface DBProject {
  id: string
  name: string
  slug: string
  description: string | null
  path: string | null
  is_active: boolean
  settings: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  created_by: string | null
}

export type TabType = 'overview' | 'skills' | 'agents' | 'mcp' | 'hooks' | 'commands' | 'rules' | 'memory'

// MCP Modal Types
export type MCPModalMode = 'create' | 'edit' | null

// Skill/Agent Modal Types
export type SkillModalMode = 'create' | 'edit' | null
export type AgentModalMode = 'create' | 'edit' | null
export type CommandModalMode = 'create' | 'edit' | null
export type RuleModalMode = 'create' | 'edit' | null
export type MemoryModalMode = 'create' | 'edit' | null

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

  // Global configs (~/.claude/)
  globalConfigs: GlobalConfigSummary | null
  isLoadingGlobal: boolean

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

  // Command Modal state
  commandModalMode: CommandModalMode
  editingCommand: CommandConfig | null
  commandContent: string | null
  savingCommand: boolean
  deletingCommands: Set<string>

  // Rule Modal state
  ruleModalMode: RuleModalMode
  editingRule: RuleConfig | null
  ruleContent: string | null
  savingRule: boolean
  deletingRules: Set<string>

  // Memory Modal state
  memoryModalMode: MemoryModalMode
  editingMemory: MemoryConfig | null
  memoryContent: string | null
  memoryIndex: string | null
  savingMemory: boolean
  deletingMemories: Set<string>

  // Actions
  fetchProjects: () => Promise<void>
  selectProject: (projectId: string | null) => void
  fetchProjectSummary: (projectId: string) => Promise<void>
  fetchAllSkills: () => Promise<void>
  fetchAllAgents: () => Promise<void>
  fetchGlobalConfigs: () => Promise<void>
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

  // Command CRUD actions
  openCommandModal: (mode: 'create' | 'edit', command?: CommandConfig) => void
  closeCommandModal: () => void
  fetchCommandContent: (projectId: string, commandId: string) => Promise<void>
  createCommand: (projectId: string, commandId: string, content: string) => Promise<boolean>
  updateCommand: (projectId: string, commandId: string, content: string) => Promise<boolean>
  deleteCommand: (projectId: string, commandId: string) => Promise<boolean>

  // Rule CRUD actions
  openRuleModal: (mode: 'create' | 'edit', rule?: RuleConfig) => void
  closeRuleModal: () => void
  fetchRuleContent: (projectId: string, ruleId: string) => Promise<void>
  fetchGlobalRuleContent: (ruleId: string) => Promise<void>
  createRule: (projectId: string, ruleId: string, content: string) => Promise<boolean>
  updateRule: (projectId: string, ruleId: string, content: string) => Promise<boolean>
  deleteRule: (projectId: string, ruleId: string) => Promise<boolean>
  createGlobalRule: (ruleId: string, content: string) => Promise<boolean>
  updateGlobalRule: (ruleId: string, content: string) => Promise<boolean>
  deleteGlobalRule: (ruleId: string) => Promise<boolean>

  // Memory CRUD actions
  openMemoryModal: (mode: 'create' | 'edit', memory?: MemoryConfig) => void
  closeMemoryModal: () => void
  fetchMemoryContent: (projectId: string, memoryId: string) => Promise<void>
  fetchMemoryIndex: (projectId: string) => Promise<void>
  createMemory: (projectId: string, memoryId: string, content: string) => Promise<boolean>
  updateMemory: (projectId: string, memoryId: string, content: string) => Promise<boolean>
  deleteMemory: (projectId: string, memoryId: string) => Promise<boolean>
  updateMemoryIndex: (projectId: string, content: string) => Promise<boolean>

  // Copy actions
  copySkill: (sourceProjectId: string, skillId: string, targetProjectId: string) => Promise<boolean>
  copyAgent: (sourceProjectId: string, agentId: string, targetProjectId: string) => Promise<boolean>
  copyMCPServer: (sourceProjectId: string, serverId: string, targetProjectId: string) => Promise<boolean>
  copyHook: (sourceProjectId: string, event: string, index: number, targetProjectId: string) => Promise<boolean>
  copyCommand: (sourceProjectId: string, commandId: string, targetProjectId: string) => Promise<boolean>
  copyRule: (sourceProjectId: string, ruleId: string, targetProjectId: string) => Promise<boolean>

  // DB Project CRUD actions
  dbProjects: DBProject[]
  isLoadingDBProjects: boolean
  fetchDBProjects: () => Promise<void>
  fetchAllDBProjects: () => Promise<void>
  createDBProject: (data: { name: string; description?: string; path?: string }) => Promise<boolean>
  updateDBProject: (id: string, data: { name?: string; description?: string; path?: string }) => Promise<boolean>
  deleteDBProject: (id: string) => Promise<boolean>
  hardDeleteDBProject: (id: string) => Promise<boolean>
  restoreDBProject: (id: string) => Promise<boolean>
  toggleDBProjectActive: (id: string) => Promise<boolean>
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

  globalConfigs: null,
  isLoadingGlobal: false,

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

  // DB Projects
  dbProjects: [],
  isLoadingDBProjects: false,

  // Command Modal state
  commandModalMode: null,
  editingCommand: null,
  commandContent: null,
  savingCommand: false,
  deletingCommands: new Set(),

  // Rule Modal state
  ruleModalMode: null,
  editingRule: null,
  ruleContent: null,
  savingRule: false,
  deletingRules: new Set(),

  // Memory Modal state
  memoryModalMode: null,
  editingMemory: null,
  memoryContent: null,
  memoryIndex: null,
  savingMemory: false,
  deletingMemories: new Set(),

  // Actions
  fetchProjects: async () => {
    set({ isLoading: true, error: null })

    try {
      const data = await apiClient.get<{ projects: ProjectInfo[] }>('/api/project-configs')
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
      const data = await apiClient.get<ProjectConfigSummary>(`/api/project-configs/${projectId}`)
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
      const data = await apiClient.get<SkillConfig[]>('/api/project-configs/skills/all')
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
      const data = await apiClient.get<AgentConfig[]>('/api/project-configs/agents/all')
      set({
        allAgents: data,
        isLoadingAll: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingAll: false })
    }
  },

  fetchGlobalConfigs: async () => {
    set({ isLoadingGlobal: true })

    try {
      const data = await apiClient.get<GlobalConfigSummary>('/api/project-configs/global')
      set({ globalConfigs: data, isLoadingGlobal: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingGlobal: false })
    }
  },

  fetchSkillContent: async (projectId: string, skillId: string) => {
    set({ isLoadingContent: true, skillContent: null, skillReferences: [] })

    try {
      const data = await apiClient.get<{ content: string; references: string[] }>(`/api/project-configs/${projectId}/skills/${skillId}/content`)
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
      await apiClient.post(`/api/project-configs/${projectId}/mcp/${serverId}/${endpoint}`)

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
      await apiClient.post('/api/project-configs/external-paths', { path })

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
      await apiClient.delete(`/api/project-configs/external-paths/${encodedPath}`)

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
      await apiClient.delete(`/api/project-configs/${projectId}/remove`)

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

    const eventSource = new EventSource(getApiUrl('/api/project-configs/stream'))

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
      // Connected to config stream
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
      await apiClient.post(`/api/project-configs/${projectId}/mcp`, data)

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
      await apiClient.put(`/api/project-configs/${projectId}/mcp/${serverId}`, data)

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
      await apiClient.delete(`/api/project-configs/${projectId}/mcp/${serverId}`)

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
      await apiClient.post(`/api/project-configs/${projectId}/skills`, { skill_id: skillId, content })

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
      await apiClient.put(`/api/project-configs/${projectId}/skills/${skillId}`, { content })

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
      await apiClient.delete(`/api/project-configs/${projectId}/skills/${skillId}`)

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
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/agents/${agentId}/content`)
      set({ agentContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  createAgent: async (projectId, agentId, content, isShared) => {
    set({ savingAgent: true, error: null })

    try {
      await apiClient.post(`/api/project-configs/${projectId}/agents`, { agent_id: agentId, content, is_shared: isShared })

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
      await apiClient.put(`/api/project-configs/${projectId}/agents/${agentId}`, { content })

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
      await apiClient.delete(`/api/project-configs/${projectId}/agents/${agentId}`)

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
      await apiClient.post(`/api/project-configs/${projectId}/hooks/events/${event}`, { matcher, hooks })

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
      await apiClient.delete(`/api/project-configs/${projectId}/hooks/${event}/${index}`)

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  // Copy actions
  copySkill: async (sourceProjectId, skillId, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/skills/${skillId}/copy`, { skill_id: skillId, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  copyAgent: async (sourceProjectId, agentId, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/agents/${agentId}/copy`, { agent_id: agentId, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  copyMCPServer: async (sourceProjectId, serverId, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/mcp/${serverId}/copy`, { server_id: serverId, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  copyHook: async (sourceProjectId, event, index, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/hooks/${event}/${index}/copy`, { event, index, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  // Command CRUD actions
  openCommandModal: (mode, command) => {
    set({
      commandModalMode: mode,
      editingCommand: command || null,
      commandContent: null,
    })
    if (mode === 'edit' && command) {
      get().fetchCommandContent(command.project_id, command.command_id)
    }
  },

  closeCommandModal: () => {
    set({
      commandModalMode: null,
      editingCommand: null,
      commandContent: null,
    })
  },

  fetchCommandContent: async (projectId, commandId) => {
    set({ isLoadingContent: true })

    try {
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/commands/${commandId}/content`)
      set({ commandContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  createCommand: async (projectId, commandId, content) => {
    set({ savingCommand: true, error: null })

    try {
      await apiClient.post(`/api/project-configs/${projectId}/commands`, { command_id: commandId, content })

      await get().fetchProjectSummary(projectId)
      set({ commandModalMode: null, editingCommand: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingCommand: false })
    }
  },

  updateCommand: async (projectId, commandId, content) => {
    set({ savingCommand: true, error: null })

    try {
      await apiClient.put(`/api/project-configs/${projectId}/commands/${commandId}`, { content })

      await get().fetchProjectSummary(projectId)
      set({ commandModalMode: null, editingCommand: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingCommand: false })
    }
  },

  deleteCommand: async (projectId, commandId) => {
    const key = `${projectId}:${commandId}`
    set((state) => ({ deletingCommands: new Set([...state.deletingCommands, key]) }))

    try {
      await apiClient.delete(`/api/project-configs/${projectId}/commands/${commandId}`)

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingCommands)
        newSet.delete(key)
        return { deletingCommands: newSet }
      })
    }
  },

  // Rule CRUD actions
  openRuleModal: (mode, rule) => {
    set({
      ruleModalMode: mode,
      editingRule: rule || null,
      ruleContent: null,
    })
    if (mode === 'edit' && rule) {
      if (rule.is_global) {
        get().fetchGlobalRuleContent(rule.rule_id)
      } else {
        get().fetchRuleContent(rule.project_id, rule.rule_id)
      }
    }
  },

  closeRuleModal: () => {
    set({
      ruleModalMode: null,
      editingRule: null,
      ruleContent: null,
    })
  },

  fetchRuleContent: async (projectId, ruleId) => {
    set({ isLoadingContent: true })

    try {
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/rules/${ruleId}/content`)
      set({ ruleContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  fetchGlobalRuleContent: async (ruleId) => {
    set({ isLoadingContent: true })

    try {
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/global/rules/${ruleId}/content`)
      set({ ruleContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  createRule: async (projectId, ruleId, content) => {
    set({ savingRule: true, error: null })

    try {
      await apiClient.post(`/api/project-configs/${projectId}/rules`, { rule_id: ruleId, content })

      await get().fetchProjectSummary(projectId)
      set({ ruleModalMode: null, editingRule: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingRule: false })
    }
  },

  updateRule: async (projectId, ruleId, content) => {
    set({ savingRule: true, error: null })

    try {
      await apiClient.put(`/api/project-configs/${projectId}/rules/${ruleId}`, { content })

      await get().fetchProjectSummary(projectId)
      set({ ruleModalMode: null, editingRule: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingRule: false })
    }
  },

  deleteRule: async (projectId, ruleId) => {
    const key = `${projectId}:${ruleId}`
    set((state) => ({ deletingRules: new Set([...state.deletingRules, key]) }))

    try {
      await apiClient.delete(`/api/project-configs/${projectId}/rules/${ruleId}`)

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingRules)
        newSet.delete(key)
        return { deletingRules: newSet }
      })
    }
  },

  createGlobalRule: async (ruleId, content) => {
    set({ savingRule: true, error: null })

    try {
      await apiClient.post('/api/project-configs/global/rules', { rule_id: ruleId, content })

      await get().fetchGlobalConfigs()
      set({ ruleModalMode: null, editingRule: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingRule: false })
    }
  },

  updateGlobalRule: async (ruleId, content) => {
    set({ savingRule: true, error: null })

    try {
      await apiClient.put(`/api/project-configs/global/rules/${ruleId}`, { content })

      await get().fetchGlobalConfigs()
      set({ ruleModalMode: null, editingRule: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingRule: false })
    }
  },

  deleteGlobalRule: async (ruleId) => {
    const key = `global:${ruleId}`
    set((state) => ({ deletingRules: new Set([...state.deletingRules, key]) }))

    try {
      await apiClient.delete(`/api/project-configs/global/rules/${ruleId}`)

      await get().fetchGlobalConfigs()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingRules)
        newSet.delete(key)
        return { deletingRules: newSet }
      })
    }
  },

  // Memory CRUD actions
  openMemoryModal: (mode, memory) => {
    set({
      memoryModalMode: mode,
      editingMemory: memory || null,
      memoryContent: null,
    })
    if (mode === 'edit' && memory) {
      get().fetchMemoryContent(memory.project_id, memory.memory_id)
    }
  },

  closeMemoryModal: () => {
    set({
      memoryModalMode: null,
      editingMemory: null,
      memoryContent: null,
    })
  },

  fetchMemoryContent: async (projectId, memoryId) => {
    set({ isLoadingContent: true })

    try {
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/memories/${memoryId}/content`)
      set({ memoryContent: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  fetchMemoryIndex: async (projectId) => {
    set({ isLoadingContent: true })

    try {
      const data = await apiClient.get<{ content: string }>(`/api/project-configs/${projectId}/memories/index`)
      set({ memoryIndex: data.content, isLoadingContent: false })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingContent: false })
    }
  },

  createMemory: async (projectId, memoryId, content) => {
    set({ savingMemory: true, error: null })

    try {
      await apiClient.post(`/api/project-configs/${projectId}/memories`, { memory_id: memoryId, content })

      await get().fetchProjectSummary(projectId)
      set({ memoryModalMode: null, editingMemory: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingMemory: false })
    }
  },

  updateMemory: async (projectId, memoryId, content) => {
    set({ savingMemory: true, error: null })

    try {
      await apiClient.put(`/api/project-configs/${projectId}/memories/${memoryId}`, { content })

      await get().fetchProjectSummary(projectId)
      set({ memoryModalMode: null, editingMemory: null })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingMemory: false })
    }
  },

  deleteMemory: async (projectId, memoryId) => {
    const key = `${projectId}:${memoryId}`
    set((state) => ({ deletingMemories: new Set([...state.deletingMemories, key]) }))

    try {
      await apiClient.delete(`/api/project-configs/${projectId}/memories/${memoryId}`)

      await get().fetchProjectSummary(projectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set((state) => {
        const newSet = new Set(state.deletingMemories)
        newSet.delete(key)
        return { deletingMemories: newSet }
      })
    }
  },

  updateMemoryIndex: async (projectId, content) => {
    set({ savingMemory: true, error: null })

    try {
      await apiClient.put(`/api/project-configs/${projectId}/memories/index`, { content })

      set({ memoryIndex: content })
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    } finally {
      set({ savingMemory: false })
    }
  },

  copyRule: async (sourceProjectId, ruleId, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/rules/${ruleId}/copy`, { rule_id: ruleId, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  copyCommand: async (sourceProjectId, commandId, targetProjectId) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-configs/${sourceProjectId}/commands/${commandId}/copy`, { command_id: commandId, target_project_id: targetProjectId })

      await get().fetchProjects()
      await get().fetchProjectSummary(targetProjectId)
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  // DB Project CRUD actions
  fetchDBProjects: async () => {
    set({ isLoadingDBProjects: true, error: null })

    try {
      const data = await apiClient.get<{ projects: DBProject[] }>('/api/project-registry')
      set({
        dbProjects: data.projects,
        isLoadingDBProjects: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingDBProjects: false })
    }
  },

  fetchAllDBProjects: async () => {
    set({ isLoadingDBProjects: true, error: null })

    try {
      const data = await apiClient.get<{ projects: DBProject[] }>('/api/project-registry/all')
      set({
        dbProjects: data.projects,
        isLoadingDBProjects: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingDBProjects: false })
    }
  },

  createDBProject: async (data) => {
    set({ error: null })

    try {
      await apiClient.post('/api/project-registry', data)

      // Refresh both DB projects and config projects
      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  updateDBProject: async (id, data) => {
    set({ error: null })

    try {
      await apiClient.put(`/api/project-registry/${id}`, data)

      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  deleteDBProject: async (id) => {
    set({ error: null })

    try {
      await apiClient.delete(`/api/project-registry/${id}`)

      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  hardDeleteDBProject: async (id) => {
    set({ error: null })

    try {
      await apiClient.delete(`/api/project-registry/${id}/permanent`)

      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  restoreDBProject: async (id) => {
    set({ error: null })

    try {
      await apiClient.post(`/api/project-registry/${id}/restore`)

      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  toggleDBProjectActive: async (id) => {
    set({ error: null })

    try {
      await apiClient.patch(`/api/project-registry/${id}/toggle-active`)

      await get().fetchAllDBProjects()
      await get().fetchProjects()
      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },
}))
