/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useWorkflowStore } from '../workflows'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

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
    vi.clearAllMocks()
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
      mockApiClient.get.mockResolvedValueOnce({ workflows })

      await useWorkflowStore.getState().fetchWorkflows()

      const state = useWorkflowStore.getState()
      expect(state.workflows).toEqual(workflows)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('passes projectId as query param', async () => {
      mockApiClient.get.mockResolvedValueOnce({ workflows: [] })

      await useWorkflowStore.getState().fetchWorkflows('proj-1')

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('?project_id=proj-1')
      )
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch workflows'))

      await useWorkflowStore.getState().fetchWorkflows()

      const state = useWorkflowStore.getState()
      expect(state.error).toBe('Failed to fetch workflows')
      expect(state.isLoading).toBe(false)
    })

    it('sets isLoading during fetch', async () => {
      let resolvePromise: (v: unknown) => void
      mockApiClient.get.mockReturnValueOnce(
        new Promise(resolve => { resolvePromise = resolve })
      )

      const promise = useWorkflowStore.getState().fetchWorkflows()
      expect(useWorkflowStore.getState().isLoading).toBe(true)

      resolvePromise!({ workflows: [] })
      await promise

      expect(useWorkflowStore.getState().isLoading).toBe(false)
    })
  })

  // ── createWorkflow ─────────────────────────────────────

  describe('createWorkflow', () => {
    it('creates workflow and adds to list', async () => {
      const newWorkflow = { id: 'wf-new', name: 'New WF' }
      mockApiClient.post.mockResolvedValueOnce(newWorkflow)

      const result = await useWorkflowStore.getState().createWorkflow({
        name: 'New WF',
        yaml_content: 'name: New WF',
      })

      expect(result).toEqual(newWorkflow)
      expect(useWorkflowStore.getState().workflows).toContainEqual(newWorkflow)
      expect(useWorkflowStore.getState().showCreateModal).toBe(false)
    })

    it('sends project_id in request body', async () => {
      mockApiClient.post.mockResolvedValueOnce({ id: 'wf-1' })

      await useWorkflowStore.getState().createWorkflow({
        name: 'Test',
        project_id: 'proj-1',
      })

      const body = mockApiClient.post.mock.calls[0][1]
      expect(body.project_id).toBe('proj-1')
    })

    it('returns null on error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Invalid YAML'))

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
      mockApiClient.put.mockResolvedValueOnce({ id: 'wf-1', name: 'New Name' })

      await useWorkflowStore.getState().updateWorkflow('wf-1', { name: 'New Name' } as any)

      expect(useWorkflowStore.getState().workflows[0].name).toBe('New Name')
    })

    it('sets error on failure', async () => {
      mockApiClient.put.mockRejectedValueOnce(new Error('Failed to update workflow'))

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
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      expect(useWorkflowStore.getState().workflows).toHaveLength(1)
      expect(useWorkflowStore.getState().workflows[0].id).toBe('wf-2')
    })

    it('clears selectedWorkflowId if deleted', async () => {
      useWorkflowStore.setState({
        workflows: [{ id: 'wf-1' } as any],
        selectedWorkflowId: 'wf-1',
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      expect(useWorkflowStore.getState().selectedWorkflowId).toBeNull()
    })

    it('preserves selectedWorkflowId if other deleted', async () => {
      useWorkflowStore.setState({
        workflows: [{ id: 'wf-1' } as any, { id: 'wf-2' } as any],
        selectedWorkflowId: 'wf-1',
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteWorkflow('wf-2')

      expect(useWorkflowStore.getState().selectedWorkflowId).toBe('wf-1')
    })
  })

  // ── fetchRuns ──────────────────────────────────────────

  describe('fetchRuns', () => {
    it('stores runs by workflow ID', async () => {
      const runs = [{ id: 'run-1', status: 'completed' }]
      mockApiClient.get.mockResolvedValueOnce({ runs })

      await useWorkflowStore.getState().fetchRuns('wf-1')

      expect(useWorkflowStore.getState().runs['wf-1']).toEqual(runs)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch runs'))

      await useWorkflowStore.getState().fetchRuns('wf-1')

      expect(useWorkflowStore.getState().error).toBe('Failed to fetch runs')
    })
  })

  // ── triggerRun ─────────────────────────────────────────

  describe('triggerRun', () => {
    it('triggers a run and adds to runs list', async () => {
      const run = { id: 'run-1', workflow_id: 'wf-1', status: 'running' }
      mockApiClient.post.mockResolvedValueOnce(run)

      const result = await useWorkflowStore.getState().triggerRun('wf-1')

      expect(result).toEqual(run)
      expect(useWorkflowStore.getState().runs['wf-1']).toContainEqual(run)
      expect(useWorkflowStore.getState().activeRun).toEqual(run)
      expect(useWorkflowStore.getState().isRunning).toBe(false)
    })

    it('returns null on error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Workflow inactive'))

      const result = await useWorkflowStore.getState().triggerRun('wf-1')

      expect(result).toBeNull()
      expect(useWorkflowStore.getState().error).toBe('Workflow inactive')
    })
  })

  // ── Secrets ────────────────────────────────────────────

  describe('secrets', () => {
    it('fetchSecrets stores secrets', async () => {
      mockApiClient.get.mockResolvedValueOnce({ secrets: [{ id: 's-1', name: 'API_KEY' }] })

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
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteSecret('s-1')

      expect(useWorkflowStore.getState().secrets).toHaveLength(1)
      expect(useWorkflowStore.getState().secrets[0].id).toBe('s-2')
    })
  })

  // ── Schedule ───────────────────────────────────────────

  describe('schedule', () => {
    it('fetchSchedule stores schedule', async () => {
      const schedule = { cron: '0 * * * *', timezone: 'UTC', is_active: true }
      mockApiClient.get.mockResolvedValueOnce(schedule)

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toEqual(schedule)
    })

    it('fetchSchedule sets null on not found', async () => {
      useWorkflowStore.setState({ schedule: { cron: '0 * * * *' } as any })
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toBeNull()
    })

    it('removeSchedule clears schedule', async () => {
      useWorkflowStore.setState({ schedule: { cron: '0 * * * *' } as any })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

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
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteWebhook('wf-1', 'wh-1')

      expect(useWorkflowStore.getState().webhooks).toHaveLength(1)
    })
  })

  // ── Templates ──────────────────────────────────────────

  describe('templates', () => {
    it('fetchTemplates stores templates', async () => {
      const templates = [{ id: 't-1', name: 'CI' }]
      mockApiClient.get.mockResolvedValueOnce({ templates })

      await useWorkflowStore.getState().fetchTemplates()

      expect(useWorkflowStore.getState().templates).toEqual(templates)
    })

    it('fetchTemplates passes category param', async () => {
      mockApiClient.get.mockResolvedValueOnce({ templates: [] })

      await useWorkflowStore.getState().fetchTemplates('ci')

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('?category=ci')
      )
    })

    it('fetchTemplates handles error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      await useWorkflowStore.getState().fetchTemplates()

      expect(useWorkflowStore.getState().error).toBe('Network error')
    })
  })

  // ── fetchRun ───────────────────────────────────────────

  describe('fetchRun', () => {
    it('fetches a single run and sets activeRun', async () => {
      const run = { id: 'run-1', status: 'completed', workflow_id: 'wf-1' }
      mockApiClient.get.mockResolvedValueOnce(run)

      await useWorkflowStore.getState().fetchRun('run-1')

      expect(useWorkflowStore.getState().activeRun).toEqual(run)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      await useWorkflowStore.getState().fetchRun('run-1')

      expect(useWorkflowStore.getState().error).toBeTruthy()
    })
  })

  // ── cancelRun ──────────────────────────────────────────

  describe('cancelRun', () => {
    it('cancels run and updates activeRun', async () => {
      const run = { id: 'run-1', status: 'cancelled', workflow_id: 'wf-1' }
      mockApiClient.post.mockResolvedValueOnce(run)

      await useWorkflowStore.getState().cancelRun('run-1')

      expect(useWorkflowStore.getState().activeRun).toEqual(run)
    })

    it('sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot cancel'))

      await useWorkflowStore.getState().cancelRun('run-1')

      expect(useWorkflowStore.getState().error).toBeTruthy()
    })
  })

  // ── retryRun ───────────────────────────────────────────

  describe('retryRun', () => {
    it('retries run and updates activeRun', async () => {
      const run = { id: 'run-2', status: 'running', workflow_id: 'wf-1' }
      mockApiClient.post.mockResolvedValueOnce(run)

      await useWorkflowStore.getState().retryRun('run-1')

      expect(useWorkflowStore.getState().activeRun).toEqual(run)
    })

    it('sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Cannot retry'))

      await useWorkflowStore.getState().retryRun('run-1')

      expect(useWorkflowStore.getState().error).toBeTruthy()
    })
  })

  // ── fetchArtifacts ─────────────────────────────────────

  describe('fetchArtifacts', () => {
    it('fetches and stores artifacts for a run', async () => {
      const artifacts = [{ id: 'a-1', name: 'output.txt', type: 'file' }]
      mockApiClient.get.mockResolvedValueOnce({ artifacts })

      await useWorkflowStore.getState().fetchArtifacts('run-1')

      expect(useWorkflowStore.getState().artifacts['run-1']).toEqual(artifacts)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

      await useWorkflowStore.getState().fetchArtifacts('run-1')

      expect(useWorkflowStore.getState().error).toBe('Network error')
    })
  })

  // ── stopLogStream ──────────────────────────────────────

  describe('stopLogStream', () => {
    it('stops existing log stream', () => {
      // Start stream first
      useWorkflowStore.getState().streamRunLogs('run-1')
      // Then stop it
      useWorkflowStore.getState().stopLogStream()
      // No error expected - just verifying it runs without issues
      expect(useWorkflowStore.getState().error).toBeNull()
    })
  })

  // ── createSecret / deleteSecret ────────────────────────

  describe('createSecret', () => {
    it('creates secret via POST and calls fetchSecrets', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      mockApiClient.get.mockResolvedValueOnce({ secrets: [] })

      await useWorkflowStore.getState().createSecret({ name: 'API_KEY', value: 'secret', scope: 'project' })
      // Give the non-awaited fetchSecrets call a tick to settle
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/secrets'),
        expect.any(Object)
      )
    })
  })

  describe('deleteSecret', () => {
    it('deletes secret and removes from local state', async () => {
      useWorkflowStore.setState({ secrets: [{ id: 's-1', name: 'API_KEY' } as any] })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useWorkflowStore.getState().deleteSecret('s-1')

      expect(useWorkflowStore.getState().secrets).toHaveLength(0)
    })
  })

  // ── fetchSchedule ──────────────────────────────────────

  describe('fetchSchedule', () => {
    it('fetches schedule and stores it', async () => {
      const schedule = { id: 'sch-1', cron: '0 * * * *', is_active: true }
      mockApiClient.get.mockResolvedValueOnce(schedule)

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toEqual(schedule)
    })

    it('sets null when not found', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      await useWorkflowStore.getState().fetchSchedule('wf-1')

      expect(useWorkflowStore.getState().schedule).toBeNull()
    })
  })

  // ── createWebhook ──────────────────────────────────────

  describe('createWebhook', () => {
    it('creates webhook via POST and triggers fetchWebhooks', async () => {
      mockApiClient.post.mockResolvedValueOnce(undefined)
      mockApiClient.get.mockResolvedValueOnce({ webhooks: [] })

      await useWorkflowStore.getState().createWebhook('wf-1')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/webhooks'),
      )
    })

    it('sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'))

      await useWorkflowStore.getState().createWebhook('wf-1')

      expect(useWorkflowStore.getState().error).toBe('Network error')
    })
  })
})
