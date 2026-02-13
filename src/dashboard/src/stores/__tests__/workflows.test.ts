/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWorkflowStore } from '../workflows'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock EventSource
class MockEventSource {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
}

// @ts-expect-error - Mock EventSource
global.EventSource = MockEventSource

function resetStore() {
  useWorkflowStore.setState({
    workflows: [],
    selectedWorkflowId: null,
    runs: {},
    activeRun: null,
    runLogs: {},
    isLoading: false,
    isRunning: false,
    error: null,
    showCreateModal: false,
    showYamlEditor: false,
    showSecretsManager: false,
    showTemplateGallery: false,
    secrets: [],
    schedule: null,
    webhooks: [],
    artifacts: {},
    templates: [],
  })
}

describe('workflow store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty workflows', () => {
      expect(useWorkflowStore.getState().workflows).toEqual([])
    })

    it('has no selected workflow', () => {
      expect(useWorkflowStore.getState().selectedWorkflowId).toBeNull()
    })

    it('is not loading', () => {
      expect(useWorkflowStore.getState().isLoading).toBe(false)
    })

    it('has no error', () => {
      expect(useWorkflowStore.getState().error).toBeNull()
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('selectWorkflow sets selectedWorkflowId and clears activeRun', () => {
      useWorkflowStore.setState({ activeRun: { id: 'run-1' } as any })

      useWorkflowStore.getState().selectWorkflow('wf-1')

      const state = useWorkflowStore.getState()
      expect(state.selectedWorkflowId).toBe('wf-1')
      expect(state.activeRun).toBeNull()
    })

    it('selectWorkflow with null clears selection', () => {
      useWorkflowStore.setState({ selectedWorkflowId: 'wf-1' })
      useWorkflowStore.getState().selectWorkflow(null)
      expect(useWorkflowStore.getState().selectedWorkflowId).toBeNull()
    })

    it('setShowCreateModal toggles modal', () => {
      useWorkflowStore.getState().setShowCreateModal(true)
      expect(useWorkflowStore.getState().showCreateModal).toBe(true)

      useWorkflowStore.getState().setShowCreateModal(false)
      expect(useWorkflowStore.getState().showCreateModal).toBe(false)
    })

    it('setShowYamlEditor toggles editor', () => {
      useWorkflowStore.getState().setShowYamlEditor(true)
      expect(useWorkflowStore.getState().showYamlEditor).toBe(true)
    })

    it('setShowSecretsManager toggles secrets', () => {
      useWorkflowStore.getState().setShowSecretsManager(true)
      expect(useWorkflowStore.getState().showSecretsManager).toBe(true)
    })

    it('setShowTemplateGallery toggles gallery', () => {
      useWorkflowStore.getState().setShowTemplateGallery(true)
      expect(useWorkflowStore.getState().showTemplateGallery).toBe(true)
    })

    it('setActiveRun sets the active run', () => {
      const run = { id: 'run-1', status: 'running' } as any
      useWorkflowStore.getState().setActiveRun(run)
      expect(useWorkflowStore.getState().activeRun).toEqual(run)
    })
  })

  // ── fetchWorkflows ─────────────────────────────────────

  describe('fetchWorkflows', () => {
    it('fetches and stores workflows', async () => {
      const workflows = [
        { id: 'wf-1', name: 'CI Pipeline' },
        { id: 'wf-2', name: 'Deploy' },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ workflows }),
      })

      await useWorkflowStore.getState().fetchWorkflows()

      const state = useWorkflowStore.getState()
      expect(state.workflows).toEqual(workflows)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('passes projectId as query param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ workflows: [] }),
      })

      await useWorkflowStore.getState().fetchWorkflows('proj-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?project_id=proj-1')
      )
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useWorkflowStore.getState().fetchWorkflows()

      const state = useWorkflowStore.getState()
      expect(state.error).toBe('Failed to fetch workflows')
      expect(state.isLoading).toBe(false)
    })

    it('sets isLoading during fetch', async () => {
      let resolvePromise: (v: unknown) => void
      mockFetch.mockReturnValueOnce(
        new Promise(resolve => { resolvePromise = resolve })
      )

      const promise = useWorkflowStore.getState().fetchWorkflows()
      expect(useWorkflowStore.getState().isLoading).toBe(true)

      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ workflows: [] }),
      })
      await promise

      expect(useWorkflowStore.getState().isLoading).toBe(false)
    })
  })

  // ── createWorkflow ─────────────────────────────────────

  describe('createWorkflow', () => {
    it('creates workflow and adds to list', async () => {
      const newWorkflow = { id: 'wf-new', name: 'New WF' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newWorkflow),
      })

      const result = await useWorkflowStore.getState().createWorkflow({
        name: 'New WF',
        yaml_content: 'name: New WF',
      })

      expect(result).toEqual(newWorkflow)
      expect(useWorkflowStore.getState().workflows).toContainEqual(newWorkflow)
      expect(useWorkflowStore.getState().showCreateModal).toBe(false)
    })

    it('sends project_id in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'wf-1' }),
      })

      await useWorkflowStore.getState().createWorkflow({
        name: 'Test',
        project_id: 'proj-1',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.project_id).toBe('proj-1')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid YAML' }),
      })

      const result = await useWorkflowStore.getState().createWorkflow({
        name: 'Bad WF',
      })

      expect(result).toBeNull()
      expect(useWorkflowStore.getState().error).toBe('Invalid YAML')
    })
  })

  // ── updateWorkflow ─────────────────────────────────────

  describe('updateWorkflow', () => {
    it('updates workflow in list', async () => {
      useWorkflowStore.setState({
        workflows: [{ id: 'wf-1', name: 'Old Name' } as any],
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'wf-1', name: 'New Name' }),
      })

      await useWorkflowStore.getState().updateWorkflow('wf-1', { name: 'New Name' } as any)

      expect(useWorkflowStore.getState().workflows[0].name).toBe('New Name')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useWorkflowStore.getState().updateWorkflow('wf-1', {} as any)

      expect(useWorkflowStore.getState().error).toBe('Failed to update workflow')
    })
  })

  // ── deleteWorkflow ─────────────────────────────────────

  describe('deleteWorkflow', () => {
    it('removes workflow from list', async () => {
      useWorkflowStore.setState({
        workflows: [
          { id: 'wf-1', name: 'WF 1' } as any,
          { id: 'wf-2', name: 'WF 2' } as any,
        ],
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      expect(useWorkflowStore.getState().workflows).toHaveLength(1)
      expect(useWorkflowStore.getState().workflows[0].id).toBe('wf-2')
    })

    it('clears selectedWorkflowId if deleted', async () => {
      useWorkflowStore.setState({
        workflows: [{ id: 'wf-1' } as any],
        selectedWorkflowId: 'wf-1',
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      expect(useWorkflowStore.getState().selectedWorkflowId).toBeNull()
    })

    it('preserves selectedWorkflowId if other deleted', async () => {
      useWorkflowStore.setState({
        workflows: [{ id: 'wf-1' } as any, { id: 'wf-2' } as any],
        selectedWorkflowId: 'wf-1',
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().deleteWorkflow('wf-2')

      expect(useWorkflowStore.getState().selectedWorkflowId).toBe('wf-1')
    })
  })

  // ── fetchRuns ──────────────────────────────────────────

  describe('fetchRuns', () => {
    it('stores runs by workflow ID', async () => {
      const runs = [{ id: 'run-1', status: 'completed' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ runs }),
      })

      await useWorkflowStore.getState().fetchRuns('wf-1')

      expect(useWorkflowStore.getState().runs['wf-1']).toEqual(runs)
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useWorkflowStore.getState().fetchRuns('wf-1')

      expect(useWorkflowStore.getState().error).toBe('Failed to fetch runs')
    })
  })

  // ── triggerRun ─────────────────────────────────────────

  describe('triggerRun', () => {
    it('triggers a run and adds to runs list', async () => {
      const run = { id: 'run-1', workflow_id: 'wf-1', status: 'running' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(run),
      })

      const result = await useWorkflowStore.getState().triggerRun('wf-1')

      expect(result).toEqual(run)
      expect(useWorkflowStore.getState().runs['wf-1']).toContainEqual(run)
      expect(useWorkflowStore.getState().activeRun).toEqual(run)
      expect(useWorkflowStore.getState().isRunning).toBe(false)
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Workflow inactive' }),
      })

      const result = await useWorkflowStore.getState().triggerRun('wf-1')

      expect(result).toBeNull()
      expect(useWorkflowStore.getState().error).toBe('Workflow inactive')
    })
  })

  // ── Secrets ────────────────────────────────────────────

  describe('secrets', () => {
    it('fetchSecrets stores secrets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ secrets: [{ id: 's-1', name: 'API_KEY' }] }),
      })

      await useWorkflowStore.getState().fetchSecrets()

      expect(useWorkflowStore.getState().secrets).toHaveLength(1)
    })

    it('deleteSecret removes from list', async () => {
      useWorkflowStore.setState({
        secrets: [
          { id: 's-1', name: 'A' } as any,
          { id: 's-2', name: 'B' } as any,
        ],
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().deleteSecret('s-1')

      expect(useWorkflowStore.getState().secrets).toHaveLength(1)
      expect(useWorkflowStore.getState().secrets[0].id).toBe('s-2')
    })
  })

  // ── Schedule ───────────────────────────────────────────

  describe('schedule', () => {
    it('fetchSchedule stores schedule', async () => {
      const schedule = { cron: '0 * * * *', timezone: 'UTC', is_active: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(schedule),
      })

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toEqual(schedule)
    })

    it('fetchSchedule sets null on not found', async () => {
      useWorkflowStore.setState({ schedule: { cron: '0 * * * *' } as any })
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toBeNull()
    })

    it('removeSchedule clears schedule', async () => {
      useWorkflowStore.setState({ schedule: { cron: '0 * * * *' } as any })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().removeSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toBeNull()
    })
  })

  // ── Webhooks ───────────────────────────────────────────

  describe('webhooks', () => {
    it('deleteWebhook removes from list', async () => {
      useWorkflowStore.setState({
        webhooks: [
          { id: 'wh-1', workflow_id: 'wf-1' } as any,
          { id: 'wh-2', workflow_id: 'wf-1' } as any,
        ],
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useWorkflowStore.getState().deleteWebhook('wf-1', 'wh-1')

      expect(useWorkflowStore.getState().webhooks).toHaveLength(1)
    })
  })

  // ── Templates ──────────────────────────────────────────

  describe('templates', () => {
    it('fetchTemplates stores templates', async () => {
      const templates = [{ id: 't-1', name: 'CI' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ templates }),
      })

      await useWorkflowStore.getState().fetchTemplates()

      expect(useWorkflowStore.getState().templates).toEqual(templates)
    })

    it('fetchTemplates passes category param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ templates: [] }),
      })

      await useWorkflowStore.getState().fetchTemplates('ci')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?category=ci')
      )
    })
  })
})
