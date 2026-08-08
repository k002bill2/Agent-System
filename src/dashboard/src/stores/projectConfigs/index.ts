import { create } from 'zustand'
// 액션 본문이 전부 도메인 모듈로 나갔으므로 여기 남는 애노테이션은 create<> 뿐이다.
import type {
  ProjectConfigsState,
} from './types'
import * as projects from './projects'
import * as skills from './skills'
import * as agents from './agents'
import * as mcp from './mcp'
import * as hooks from './hooks'
import * as commands from './commands'
import * as rules from './rules'
import * as memories from './memories'
import * as dbProjects from './dbProjects'

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
  fetchProjects: () => projects.fetchProjects(set, get),
  selectProject: (projectId) => projects.selectProject(set, get, projectId),
  fetchProjectSummary: (projectId) => projects.fetchProjectSummary(set, get, projectId),
  fetchAllSkills: () => skills.fetchAllSkills(set, get),
  fetchAllAgents: () => agents.fetchAllAgents(set, get),
  fetchGlobalConfigs: () => projects.fetchGlobalConfigs(set, get),
  fetchSkillContent: (projectId, skillId) => skills.fetchSkillContent(set, get, projectId, skillId),
  toggleMCPServer: (projectId, serverId, enabled) => mcp.toggleMCPServer(set, get, projectId, serverId, enabled),
  addExternalPath: (path) => projects.addExternalPath(set, get, path),
  removeExternalPath: (path) => projects.removeExternalPath(set, get, path),
  removeProject: (projectId) => projects.removeProject(set, get, projectId),
  startStreaming: () => projects.startStreaming(set, get),
  stopStreaming: () => projects.stopStreaming(set, get),
  setActiveTab: (tab) => projects.setActiveTab(set, get, tab),
  clearError: () => projects.clearError(set, get),
  refresh: () => projects.refresh(set, get),

  // MCP CRUD actions
  openMCPModal: (mode, server) => mcp.openMCPModal(set, get, mode, server),
  closeMCPModal: () => mcp.closeMCPModal(set, get),
  createMCPServer: (projectId, data) => mcp.createMCPServer(set, get, projectId, data),
  updateMCPServer: (projectId, serverId, data) => mcp.updateMCPServer(set, get, projectId, serverId, data),
  deleteMCPServer: (projectId, serverId) => mcp.deleteMCPServer(set, get, projectId, serverId),

  // Skill CRUD actions
  openSkillModal: (mode, skill) => skills.openSkillModal(set, get, mode, skill),
  closeSkillModal: () => skills.closeSkillModal(set, get),
  createSkill: (projectId, skillId, content) => skills.createSkill(set, get, projectId, skillId, content),
  updateSkill: (projectId, skillId, content) => skills.updateSkill(set, get, projectId, skillId, content),
  deleteSkill: (projectId, skillId) => skills.deleteSkill(set, get, projectId, skillId),

  // Agent CRUD actions
  openAgentModal: (mode, agent) => agents.openAgentModal(set, get, mode, agent),
  closeAgentModal: () => agents.closeAgentModal(set, get),
  fetchAgentContent: (projectId, agentId) => agents.fetchAgentContent(set, get, projectId, agentId),
  createAgent: (projectId, agentId, content, isShared) =>
    agents.createAgent(set, get, projectId, agentId, content, isShared),
  updateAgent: (projectId, agentId, content) => agents.updateAgent(set, get, projectId, agentId, content),
  deleteAgent: (projectId, agentId) => agents.deleteAgent(set, get, projectId, agentId),

  // Hooks CRUD actions
  // `hooksArg` 는 impl 쪽 `hooks` 를 **의도적으로 개명**한 것이다 — 위 `import * as hooks` 를
  // 가리지 않으려면 여기서만 이름이 달라야 한다. "일관성" 을 이유로 `hooks` 로 되돌리지 마라.
  addHookEntry: (projectId, event, matcher, hooksArg) =>
    hooks.addHookEntry(set, get, projectId, event, matcher, hooksArg),
  deleteHook: (projectId, event, index) => hooks.deleteHook(set, get, projectId, event, index),

  // Copy actions
  copySkill: (sourceProjectId, skillId, targetProjectId) =>
    skills.copySkill(set, get, sourceProjectId, skillId, targetProjectId),
  copyAgent: (sourceProjectId, agentId, targetProjectId) =>
    agents.copyAgent(set, get, sourceProjectId, agentId, targetProjectId),
  copyMCPServer: (sourceProjectId, serverId, targetProjectId) =>
    mcp.copyMCPServer(set, get, sourceProjectId, serverId, targetProjectId),
  copyHook: (sourceProjectId, event, index, targetProjectId) =>
    hooks.copyHook(set, get, sourceProjectId, event, index, targetProjectId),

  // Command CRUD actions
  openCommandModal: (mode, command) => commands.openCommandModal(set, get, mode, command),
  closeCommandModal: () => commands.closeCommandModal(set, get),
  fetchCommandContent: (projectId, commandId) => commands.fetchCommandContent(set, get, projectId, commandId),
  createCommand: (projectId, commandId, content) => commands.createCommand(set, get, projectId, commandId, content),
  updateCommand: (projectId, commandId, content) => commands.updateCommand(set, get, projectId, commandId, content),
  deleteCommand: (projectId, commandId) => commands.deleteCommand(set, get, projectId, commandId),

  // Rule CRUD actions
  openRuleModal: (mode, rule) => rules.openRuleModal(set, get, mode, rule),
  closeRuleModal: () => rules.closeRuleModal(set, get),
  fetchRuleContent: (projectId, ruleId) => rules.fetchRuleContent(set, get, projectId, ruleId),
  fetchGlobalRuleContent: (ruleId) => rules.fetchGlobalRuleContent(set, get, ruleId),
  createRule: (projectId, ruleId, content) => rules.createRule(set, get, projectId, ruleId, content),
  updateRule: (projectId, ruleId, content) => rules.updateRule(set, get, projectId, ruleId, content),
  deleteRule: (projectId, ruleId) => rules.deleteRule(set, get, projectId, ruleId),
  createGlobalRule: (ruleId, content) => rules.createGlobalRule(set, get, ruleId, content),
  updateGlobalRule: (ruleId, content) => rules.updateGlobalRule(set, get, ruleId, content),
  deleteGlobalRule: (ruleId) => rules.deleteGlobalRule(set, get, ruleId),

  // Memory CRUD actions
  openMemoryModal: (mode, memory) => memories.openMemoryModal(set, get, mode, memory),
  closeMemoryModal: () => memories.closeMemoryModal(set, get),
  fetchMemoryContent: (projectId, memoryId) => memories.fetchMemoryContent(set, get, projectId, memoryId),
  fetchMemoryIndex: (projectId) => memories.fetchMemoryIndex(set, get, projectId),
  createMemory: (projectId, memoryId, content) => memories.createMemory(set, get, projectId, memoryId, content),
  updateMemory: (projectId, memoryId, content) => memories.updateMemory(set, get, projectId, memoryId, content),
  deleteMemory: (projectId, memoryId) => memories.deleteMemory(set, get, projectId, memoryId),
  updateMemoryIndex: (projectId, content) => memories.updateMemoryIndex(set, get, projectId, content),
  copyRule: (sourceProjectId, ruleId, targetProjectId) =>
    rules.copyRule(set, get, sourceProjectId, ruleId, targetProjectId),
  copyCommand: (sourceProjectId, commandId, targetProjectId) =>
    commands.copyCommand(set, get, sourceProjectId, commandId, targetProjectId),

  // DB Project CRUD actions
  fetchDBProjects: () => dbProjects.fetchDBProjects(set, get),
  fetchAllDBProjects: () => dbProjects.fetchAllDBProjects(set, get),
  createDBProject: (data) => dbProjects.createDBProject(set, get, data),
  updateDBProject: (id, data) => dbProjects.updateDBProject(set, get, id, data),
  deleteDBProject: (id) => dbProjects.deleteDBProject(set, get, id),
  hardDeleteDBProject: (id) => dbProjects.hardDeleteDBProject(set, get, id),
  restoreDBProject: (id) => dbProjects.restoreDBProject(set, get, id),
  toggleDBProjectActive: (id) => dbProjects.toggleDBProjectActive(set, get, id),
}))

