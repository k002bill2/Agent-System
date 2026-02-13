/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectsStore } from '../projects'

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useProjectsStore.setState({
    projects: [],
    templates: [],
    isLoading: false,
    error: null,
    modalMode: null,
    editingProject: null,
    searchQuery: '',
    selectedProjectId: null,
  })
}

const mockProject = (id: string, name: string) => ({
  id,
  name,
  path: `/projects/${id}`,
  description: `${name} project`,
  has_claude_md: true,
  vector_store_initialized: false,
  indexed_at: null,
  git_path: null,
  git_enabled: false,
  sort_order: 0,
})

describe('projects store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty projects', () => {
      expect(useProjectsStore.getState().projects).toEqual([])
    })

    it('has no modal open', () => {
      expect(useProjectsStore.getState().modalMode).toBeNull()
    })

    it('has empty search query', () => {
      expect(useProjectsStore.getState().searchQuery).toBe('')
    })

    it('has no selected project', () => {
      expect(useProjectsStore.getState().selectedProjectId).toBeNull()
    })
  })

  // ── Modal Actions ──────────────────────────────────────

  describe('modal actions', () => {
    it('openCreateModal sets create mode', () => {
      useProjectsStore.getState().openCreateModal()
      expect(useProjectsStore.getState().modalMode).toBe('create')
      expect(useProjectsStore.getState().editingProject).toBeNull()
    })

    it('openLinkModal sets link mode', () => {
      useProjectsStore.getState().openLinkModal()
      expect(useProjectsStore.getState().modalMode).toBe('link')
    })

    it('openEditModal sets edit mode with project', () => {
      const project = mockProject('p-1', 'Test')
      useProjectsStore.getState().openEditModal(project as any)
      expect(useProjectsStore.getState().modalMode).toBe('edit')
      expect(useProjectsStore.getState().editingProject).toEqual(project)
    })

    it('closeModal clears modal state', () => {
      useProjectsStore.setState({
        modalMode: 'edit',
        editingProject: mockProject('p-1', 'Test') as any,
        error: 'some error',
      })

      useProjectsStore.getState().closeModal()

      const state = useProjectsStore.getState()
      expect(state.modalMode).toBeNull()
      expect(state.editingProject).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  // ── Search & Selection ─────────────────────────────────

  describe('search and selection', () => {
    it('setSearchQuery updates query', () => {
      useProjectsStore.getState().setSearchQuery('test')
      expect(useProjectsStore.getState().searchQuery).toBe('test')
    })

    it('selectProject sets selectedProjectId', () => {
      useProjectsStore.getState().selectProject('p-1')
      expect(useProjectsStore.getState().selectedProjectId).toBe('p-1')
    })

    it('selectProject with null clears selection', () => {
      useProjectsStore.setState({ selectedProjectId: 'p-1' })
      useProjectsStore.getState().selectProject(null)
      expect(useProjectsStore.getState().selectedProjectId).toBeNull()
    })
  })

  // ── filteredProjects ───────────────────────────────────

  describe('filteredProjects', () => {
    beforeEach(() => {
      useProjectsStore.setState({
        projects: [
          mockProject('agent-system', 'Agent System'),
          mockProject('web-app', 'Web Application'),
          mockProject('cli-tool', 'CLI Tool'),
        ] as any[],
      })
    })

    it('returns all projects when no search query', () => {
      expect(useProjectsStore.getState().filteredProjects()).toHaveLength(3)
    })

    it('filters by name', () => {
      useProjectsStore.setState({ searchQuery: 'agent' })
      const filtered = useProjectsStore.getState().filteredProjects()
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('agent-system')
    })

    it('filters by id', () => {
      useProjectsStore.setState({ searchQuery: 'cli' })
      const filtered = useProjectsStore.getState().filteredProjects()
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('cli-tool')
    })

    it('filters case-insensitively', () => {
      useProjectsStore.setState({ searchQuery: 'WEB' })
      expect(useProjectsStore.getState().filteredProjects()).toHaveLength(1)
    })

    it('filters by description', () => {
      useProjectsStore.setState({ searchQuery: 'project' })
      expect(useProjectsStore.getState().filteredProjects()).toHaveLength(3)
    })

    it('returns empty for no match', () => {
      useProjectsStore.setState({ searchQuery: 'nonexistent' })
      expect(useProjectsStore.getState().filteredProjects()).toHaveLength(0)
    })
  })

  // ── getSelectedProject ─────────────────────────────────

  describe('getSelectedProject', () => {
    it('returns selected project', () => {
      useProjectsStore.setState({
        projects: [mockProject('p-1', 'Test')] as any[],
        selectedProjectId: 'p-1',
      })

      expect(useProjectsStore.getState().getSelectedProject()?.id).toBe('p-1')
    })

    it('returns null when no selection', () => {
      expect(useProjectsStore.getState().getSelectedProject()).toBeNull()
    })

    it('returns null when selected project not found', () => {
      useProjectsStore.setState({
        projects: [mockProject('p-1', 'Test')] as any[],
        selectedProjectId: 'p-nonexistent',
      })

      expect(useProjectsStore.getState().getSelectedProject()).toBeNull()
    })
  })

  // ── fetchProjects ──────────────────────────────────────

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      const projects = [mockProject('p-1', 'Test')]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(projects),
      })

      await useProjectsStore.getState().fetchProjects()

      const state = useProjectsStore.getState()
      expect(state.projects).toEqual(projects)
      expect(state.isLoading).toBe(false)
    })

    it('auto-selects first project if none selected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockProject('p-1', 'Test')]),
      })

      await useProjectsStore.getState().fetchProjects()

      expect(useProjectsStore.getState().selectedProjectId).toBe('p-1')
    })

    it('preserves existing selection', async () => {
      useProjectsStore.setState({ selectedProjectId: 'p-2' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockProject('p-1', 'Test'), mockProject('p-2', 'Other')]),
      })

      await useProjectsStore.getState().fetchProjects()

      expect(useProjectsStore.getState().selectedProjectId).toBe('p-2')
    })

    it('sets error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      })

      await useProjectsStore.getState().fetchProjects()

      expect(useProjectsStore.getState().error).toContain('Failed to fetch projects')
    })
  })

  // ── createProject ──────────────────────────────────────

  describe('createProject', () => {
    it('creates project and refreshes list', async () => {
      // First call: create. Second call: fetchProjects
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'new-proj' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([mockProject('new-proj', 'New')]),
        })

      const result = await useProjectsStore.getState().createProject(
        'new-proj', 'New', 'desc', 'default'
      )

      expect(result).toBe(true)
      expect(useProjectsStore.getState().modalMode).toBeNull()
    })

    it('returns false on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Project already exists' }),
      })

      const result = await useProjectsStore.getState().createProject(
        'dup', 'Dup', 'desc', 'default'
      )

      expect(result).toBe(false)
      expect(useProjectsStore.getState().error).toBe('Project already exists')
    })
  })

  // ── deleteProject ──────────────────────────────────────

  describe('deleteProject', () => {
    it('deletes project and refreshes list', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })

      const result = await useProjectsStore.getState().deleteProject('p-1')

      expect(result).toBe(true)
    })

    it('returns false on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const result = await useProjectsStore.getState().deleteProject('p-x')

      expect(result).toBe(false)
      expect(useProjectsStore.getState().error).toBe('Not found')
    })
  })

  // ── reorderProjects ────────────────────────────────────

  describe('reorderProjects', () => {
    it('reorders and updates projects list', async () => {
      const reordered = [mockProject('p-2', 'B'), mockProject('p-1', 'A')]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(reordered),
      })

      const result = await useProjectsStore.getState().reorderProjects(['p-2', 'p-1'])

      expect(result).toBe(true)
      expect(useProjectsStore.getState().projects).toEqual(reordered)
    })
  })
})
