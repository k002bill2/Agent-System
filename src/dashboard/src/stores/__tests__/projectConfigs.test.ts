/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectConfigsStore } from '../projectConfigs'

const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock EventSource
class MockEventSource {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  constructor(url: string) { this.url = url }
  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
}
// @ts-expect-error - Mock
global.EventSource = MockEventSource

function resetStore() {
  useProjectConfigsStore.setState({
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
    mcpModalMode: null,
    editingMCPServer: null,
    savingMCP: false,
    deletingMCP: new Set(),
    skillModalMode: null,
    editingSkill: null,
    savingSkill: false,
    deletingSkills: new Set(),
    agentModalMode: null,
    editingAgent: null,
    agentContent: null,
    savingAgent: false,
    deletingAgents: new Set(),
  })
}

describe('projectConfigs store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty projects', () => {
      expect(useProjectConfigsStore.getState().projects).toEqual([])
    })

    it('has no selected project', () => {
      expect(useProjectConfigsStore.getState().selectedProjectId).toBeNull()
    })

    it('has overview as default tab', () => {
      expect(useProjectConfigsStore.getState().activeTab).toBe('overview')
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setActiveTab', () => {
      useProjectConfigsStore.getState().setActiveTab('skills')
      expect(useProjectConfigsStore.getState().activeTab).toBe('skills')
    })

    it('clearError', () => {
      useProjectConfigsStore.setState({ error: 'err' })
      useProjectConfigsStore.getState().clearError()
      expect(useProjectConfigsStore.getState().error).toBeNull()
    })

    it('openMCPModal create', () => {
      useProjectConfigsStore.getState().openMCPModal('create')
      expect(useProjectConfigsStore.getState().mcpModalMode).toBe('create')
      expect(useProjectConfigsStore.getState().editingMCPServer).toBeNull()
    })

    it('openMCPModal edit', () => {
      const server = { server_id: 'srv-1' } as any
      useProjectConfigsStore.getState().openMCPModal('edit', server)
      expect(useProjectConfigsStore.getState().mcpModalMode).toBe('edit')
      expect(useProjectConfigsStore.getState().editingMCPServer).toEqual(server)
    })

    it('closeMCPModal', () => {
      useProjectConfigsStore.setState({ mcpModalMode: 'edit', editingMCPServer: {} as any })
      useProjectConfigsStore.getState().closeMCPModal()
      expect(useProjectConfigsStore.getState().mcpModalMode).toBeNull()
      expect(useProjectConfigsStore.getState().editingMCPServer).toBeNull()
    })

    it('openSkillModal', () => {
      useProjectConfigsStore.getState().openSkillModal('create')
      expect(useProjectConfigsStore.getState().skillModalMode).toBe('create')
    })

    it('closeSkillModal', () => {
      useProjectConfigsStore.setState({ skillModalMode: 'edit' })
      useProjectConfigsStore.getState().closeSkillModal()
      expect(useProjectConfigsStore.getState().skillModalMode).toBeNull()
    })

    it('openAgentModal', () => {
      useProjectConfigsStore.getState().openAgentModal('create')
      expect(useProjectConfigsStore.getState().agentModalMode).toBe('create')
    })

    it('closeAgentModal', () => {
      useProjectConfigsStore.setState({ agentModalMode: 'edit' })
      useProjectConfigsStore.getState().closeAgentModal()
      expect(useProjectConfigsStore.getState().agentModalMode).toBeNull()
    })
  })

  // ── fetchProjects ──────────────────────────────────────

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      const projects = [
        { project_id: 'p1', project_name: 'App' },
        { project_id: 'p2', project_name: 'Lib' },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ projects }),
      })
      // selectProject will trigger fetchProjectSummary
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ project: projects[0], skills: [], agents: [], mcp_servers: [], user_mcp_servers: [], hooks: [] }),
      })

      await useProjectConfigsStore.getState().fetchProjects()

      expect(useProjectConfigsStore.getState().projects).toEqual(projects)
      expect(useProjectConfigsStore.getState().isLoading).toBe(false)
      // Auto-selects first project
      expect(useProjectConfigsStore.getState().selectedProjectId).toBe('p1')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      await useProjectConfigsStore.getState().fetchProjects()

      expect(useProjectConfigsStore.getState().error).toContain('Failed to fetch projects')
    })
  })

  // ── selectProject ──────────────────────────────────────

  describe('selectProject', () => {
    it('selects project and fetches summary', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      useProjectConfigsStore.getState().selectProject('p1')

      expect(useProjectConfigsStore.getState().selectedProjectId).toBe('p1')
      expect(useProjectConfigsStore.getState().selectedProject).toBeNull() // cleared before fetch
    })

    it('clears when null', () => {
      useProjectConfigsStore.setState({ selectedProjectId: 'p1', selectedProject: {} as any })
      useProjectConfigsStore.getState().selectProject(null)

      expect(useProjectConfigsStore.getState().selectedProjectId).toBeNull()
    })
  })

  // ── fetchProjectSummary ────────────────────────────────

  describe('fetchProjectSummary', () => {
    it('fetches and stores project summary', async () => {
      const summary = {
        project: { project_id: 'p1', project_name: 'App' },
        skills: [{ skill_id: 'sk-1' }],
        agents: [],
        mcp_servers: [],
        user_mcp_servers: [],
        hooks: [],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(summary),
      })

      await useProjectConfigsStore.getState().fetchProjectSummary('p1')

      expect(useProjectConfigsStore.getState().selectedProject).toEqual(summary)
      expect(useProjectConfigsStore.getState().isLoadingProject).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Not Found' })

      await useProjectConfigsStore.getState().fetchProjectSummary('p1')

      expect(useProjectConfigsStore.getState().error).toContain('Failed to fetch project')
    })
  })

  // ── fetchAllSkills ─────────────────────────────────────

  describe('fetchAllSkills', () => {
    it('fetches all skills', async () => {
      const skills = [{ skill_id: 'sk-1', name: 'Skill 1' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(skills),
      })

      await useProjectConfigsStore.getState().fetchAllSkills()

      expect(useProjectConfigsStore.getState().allSkills).toEqual(skills)
    })
  })

  // ── fetchAllAgents ─────────────────────────────────────

  describe('fetchAllAgents', () => {
    it('fetches all agents', async () => {
      const agents = [{ agent_id: 'ag-1', name: 'Agent 1' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(agents),
      })

      await useProjectConfigsStore.getState().fetchAllAgents()

      expect(useProjectConfigsStore.getState().allAgents).toEqual(agents)
    })
  })

  // ── fetchSkillContent ──────────────────────────────────

  describe('fetchSkillContent', () => {
    it('fetches skill content and references', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '# Skill', references: ['ref1.md'] }),
      })

      await useProjectConfigsStore.getState().fetchSkillContent('p1', 'sk-1')

      expect(useProjectConfigsStore.getState().skillContent).toBe('# Skill')
      expect(useProjectConfigsStore.getState().skillReferences).toEqual(['ref1.md'])
    })
  })

  // ── Streaming ──────────────────────────────────────────

  describe('streaming', () => {
    it('stopStreaming closes eventSource', () => {
      const mockES = { close: vi.fn() }
      useProjectConfigsStore.setState({ eventSource: mockES as any })

      useProjectConfigsStore.getState().stopStreaming()

      expect(mockES.close).toHaveBeenCalled()
      expect(useProjectConfigsStore.getState().eventSource).toBeNull()
    })

    it('startStreaming creates EventSource', () => {
      useProjectConfigsStore.getState().startStreaming()

      const es = useProjectConfigsStore.getState().eventSource as unknown as MockEventSource
      expect(es).not.toBeNull()
      expect(es.url).toContain('/api/project-configs/stream')
    })
  })

  // ── refresh ────────────────────────────────────────────

  describe('refresh', () => {
    it('calls fetchProjects and fetchProjectSummary if project selected', async () => {
      useProjectConfigsStore.setState({ selectedProjectId: 'p1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await useProjectConfigsStore.getState().refresh()

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // Helper for successful project summary mock
  function mockProjectSummaryOk() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ project: { project_id: 'p1' }, skills: [], agents: [], mcp_servers: [], user_mcp_servers: [], hooks: [] }),
    })
  }

  // ── toggleMCPServer ────────────────────────────────────

  describe('toggleMCPServer', () => {
    it('enables server and updates local state', async () => {
      useProjectConfigsStore.setState({
        selectedProject: {
          project: { project_id: 'p1' } as any,
          skills: [], agents: [],
          mcp_servers: [{ server_id: 'srv-1', disabled: true } as any],
          user_mcp_servers: [], hooks: [],
        },
      })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await useProjectConfigsStore.getState().toggleMCPServer('p1', 'srv-1', true)

      const server = useProjectConfigsStore.getState().selectedProject?.mcp_servers.find(s => s.server_id === 'srv-1')
      expect(server?.disabled).toBe(false)
    })

    it('prevents double-toggle', async () => {
      useProjectConfigsStore.setState({
        togglingServers: new Set(['p1:srv-1']),
        selectedProject: null,
      })

      await useProjectConfigsStore.getState().toggleMCPServer('p1', 'srv-1', true)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      useProjectConfigsStore.setState({ selectedProject: null })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Server error' }),
      })

      await useProjectConfigsStore.getState().toggleMCPServer('p1', 'srv-1', true)

      expect(useProjectConfigsStore.getState().error).toBe('Server error')
    })
  })

  // ── addExternalPath ────────────────────────────────────

  describe('addExternalPath', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })

      const result = await useProjectConfigsStore.getState().addExternalPath('/some/path')

      expect(result).toBe(true)
    })

    it('returns false and sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid path' }),
      })

      const result = await useProjectConfigsStore.getState().addExternalPath('/bad/path')

      expect(result).toBe(false)
      expect(useProjectConfigsStore.getState().error).toBe('Invalid path')
    })
  })

  // ── removeExternalPath ─────────────────────────────────

  describe('removeExternalPath', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })

      const result = await useProjectConfigsStore.getState().removeExternalPath('/some/path')

      expect(result).toBe(true)
    })

    it('returns false and sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().removeExternalPath('/some/path')

      expect(result).toBe(false)
    })
  })

  // ── removeProject ──────────────────────────────────────

  describe('removeProject', () => {
    it('returns true on success and refreshes', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })

      const result = await useProjectConfigsStore.getState().removeProject('p1')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Remove failed' }),
      })

      const result = await useProjectConfigsStore.getState().removeProject('p1')

      expect(result).toBe(false)
    })
  })

  // ── MCP CRUD ───────────────────────────────────────────

  describe('createMCPServer', () => {
    it('returns true and refreshes on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().createMCPServer('p1', {
        command: 'npx', args: [], env: {},
      })

      expect(result).toBe(true)
      expect(useProjectConfigsStore.getState().mcpModalMode).toBeNull()
    })

    it('returns false and sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Conflict' }),
      })

      const result = await useProjectConfigsStore.getState().createMCPServer('p1', {
        command: 'npx', args: [], env: {},
      })

      expect(result).toBe(false)
      expect(useProjectConfigsStore.getState().error).toBe('Conflict')
    })
  })

  describe('updateMCPServer', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().updateMCPServer('p1', 'srv-1', {
        command: 'uvx', args: [],
      })

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().updateMCPServer('p1', 'srv-1', {})

      expect(result).toBe(false)
    })
  })

  describe('deleteMCPServer', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().deleteMCPServer('p1', 'srv-1')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Server busy' }),
      })

      const result = await useProjectConfigsStore.getState().deleteMCPServer('p1', 'srv-1')

      expect(result).toBe(false)
    })
  })

  // ── Skill CRUD ─────────────────────────────────────────

  describe('createSkill', () => {
    it('returns true and closes modal on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().createSkill('p1', 'my-skill', '# Skill')

      expect(result).toBe(true)
      expect(useProjectConfigsStore.getState().skillModalMode).toBeNull()
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Already exists' }),
      })

      const result = await useProjectConfigsStore.getState().createSkill('p1', 'my-skill', '# Skill')

      expect(result).toBe(false)
    })
  })

  describe('updateSkill', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().updateSkill('p1', 'sk-1', 'new content')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().updateSkill('p1', 'sk-1', 'content')

      expect(result).toBe(false)
    })
  })

  describe('deleteSkill', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().deleteSkill('p1', 'sk-1')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().deleteSkill('p1', 'sk-1')

      expect(result).toBe(false)
    })
  })

  // ── Agent CRUD ─────────────────────────────────────────

  describe('fetchAgentContent', () => {
    it('fetches and stores agent content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '# Agent' }),
      })

      await useProjectConfigsStore.getState().fetchAgentContent('p1', 'ag-1')

      expect(useProjectConfigsStore.getState().agentContent).toBe('# Agent')
      expect(useProjectConfigsStore.getState().isLoadingContent).toBe(false)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Not Found' })

      await useProjectConfigsStore.getState().fetchAgentContent('p1', 'ag-1')

      expect(useProjectConfigsStore.getState().error).toContain('Failed to fetch agent content')
    })
  })

  describe('createAgent', () => {
    it('returns true and closes modal on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().createAgent('p1', 'my-agent', '# Agent', false)

      expect(result).toBe(true)
      expect(useProjectConfigsStore.getState().agentModalMode).toBeNull()
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Conflict' }),
      })

      const result = await useProjectConfigsStore.getState().createAgent('p1', 'my-agent', '# Agent', false)

      expect(result).toBe(false)
    })
  })

  describe('updateAgent', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().updateAgent('p1', 'ag-1', 'new content')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().updateAgent('p1', 'ag-1', 'content')

      expect(result).toBe(false)
    })
  })

  describe('deleteAgent', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().deleteAgent('p1', 'ag-1')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().deleteAgent('p1', 'ag-1')

      expect(result).toBe(false)
    })
  })

  // ── Hooks CRUD ─────────────────────────────────────────

  describe('addHookEntry', () => {
    it('returns true and refreshes on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().addHookEntry(
        'p1', 'PostToolUse', 'Edit', [{ type: 'command', command: 'echo hi' }]
      )

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid event' }),
      })

      const result = await useProjectConfigsStore.getState().addHookEntry(
        'p1', 'BadEvent', 'Edit', []
      )

      expect(result).toBe(false)
      expect(useProjectConfigsStore.getState().error).toBe('Invalid event')
    })
  })

  describe('deleteHook', () => {
    it('returns true and refreshes on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().deleteHook('p1', 'PostToolUse', 0)

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Index out of range' }),
      })

      const result = await useProjectConfigsStore.getState().deleteHook('p1', 'PostToolUse', 99)

      expect(result).toBe(false)
    })
  })

  // ── Copy Actions ───────────────────────────────────────

  describe('copySkill', () => {
    it('returns true and refreshes on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().copySkill('p1', 'sk-1', 'p2')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Copy failed' }),
      })

      const result = await useProjectConfigsStore.getState().copySkill('p1', 'sk-1', 'p2')

      expect(result).toBe(false)
    })
  })

  describe('copyAgent', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })
      mockProjectSummaryOk()

      const result = await useProjectConfigsStore.getState().copyAgent('p1', 'ag-1', 'p2')

      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectConfigsStore.getState().copyAgent('p1', 'ag-1', 'p2')

      expect(result).toBe(false)
    })
  })
})
