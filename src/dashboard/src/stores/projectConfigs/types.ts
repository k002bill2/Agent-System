/** projectConfigs 스토어의 타입 정의.
 *
 * `ProjectConfigsState` 는 패키지 내부 전용이지만, 액션을 모듈로 승격할 때(Task 8)
 * 각 도메인 모듈이 `SetFn`/`GetFn` 대신 이것을 직접 참조하므로 export 한다.
 */
import type { AuthenticatedSseClient } from '../../services/authenticatedSse'

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

export interface ProjectConfigsState {
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
  eventSource: AuthenticatedSseClient | null
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
