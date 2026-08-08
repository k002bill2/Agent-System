import { create } from 'zustand'
import { apiClient } from '../../services/apiClient'
import { getApiUrl } from '../../config/api'
// `export type` 재노출은 로컬 바인딩을 만들지 않는다 — 아래에서 본문이 애노테이션으로
// 쓰는 이름들은 별도로 import type 한다 (ConfigChangeEvent · GlobalConfigSummary 는
// 소비자 재노출 대상이 아니라 여기서만 필요).
import type {
  AgentConfig,
  ConfigChangeEvent,
  DBProject,
  GlobalConfigSummary,
  ProjectConfigsState,
  ProjectConfigSummary,
  ProjectInfo,
  SkillConfig,
  TabType,
} from './types'

// 소비자 실측(2026-08-08): 아래 11개 타입 + 훅 `useProjectConfigsStore`.
export type {
  AgentConfig,
  CommandConfig,
  DBProject,
  HookConfig,
  MCPServerConfig,
  MemoryConfig,
  ProjectConfigSummary,
  ProjectInfo,
  RuleConfig,
  SkillConfig,
  TabType,
} from './types'

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
