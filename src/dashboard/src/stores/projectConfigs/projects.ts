/** 프로젝트 목록·선택·전역 설정·SSE 스트리밍·탭/에러 등 스토어 전반의 액션. */
import { apiClient } from '../../services/apiClient'
import { getApiUrl } from '../../config/api'
import { createAuthenticatedSseClient } from '../../services/authenticatedSse'
import type { ConfigChangeEvent, GlobalConfigSummary, ProjectConfigSummary, ProjectConfigsState, ProjectInfo, TabType } from './types'

/** `git/` 도메인 모듈과 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<ProjectConfigsState> | ((state: ProjectConfigsState) => Partial<ProjectConfigsState>)) => void
type GetFn = () => ProjectConfigsState

export async function fetchProjects(set: SetFn, get: GetFn) {
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
}

export function selectProject(set: SetFn, get: GetFn, projectId: string | null) {
  set({ selectedProjectId: projectId, selectedProject: null })
  if (projectId) {
    get().fetchProjectSummary(projectId)
  }
}

export async function fetchProjectSummary(set: SetFn, _get: GetFn, projectId: string) {
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
}

export async function fetchGlobalConfigs(set: SetFn, _get: GetFn) {
  set({ isLoadingGlobal: true })

  try {
    const data = await apiClient.get<GlobalConfigSummary>('/api/project-configs/global')
    set({ globalConfigs: data, isLoadingGlobal: false })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    set({ error: errorMessage, isLoadingGlobal: false })
  }
}

export async function addExternalPath(set: SetFn, get: GetFn, path: string) {
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
}

export async function removeExternalPath(set: SetFn, get: GetFn, path: string) {
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
}

export async function removeProject(set: SetFn, get: GetFn, projectId: string) {
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
}

export function startStreaming(set: SetFn, get: GetFn) {
  const { eventSource: existing, stopStreaming } = get()

  if (existing) {
    stopStreaming()
  }

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleReconnect = () => {
    if (reconnectTimer !== null) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (get().eventSource === eventSource) {
        get().startStreaming()
      }
    }, 5000)
  }

  const eventSource = createAuthenticatedSseClient(getApiUrl('/api/project-configs/stream'), {
    onStatus: (status) => {
      if (status === 'authentication-failed') {
        set({ eventSource: null, error: 'Authentication required for config stream' })
      } else if (status === 'permission-denied') {
        set({ eventSource: null, error: 'You do not have permission to view config changes' })
      } else if (status === 'error') {
        // The authenticated client owns transport status. Do not also use a
        // legacy EventSource error listener, which would schedule duplicates.
        scheduleReconnect()
      }
    },
  })

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

  set({ eventSource })
}

export function stopStreaming(set: SetFn, get: GetFn) {
  const { eventSource } = get()
  if (eventSource) {
    eventSource.close()
    set({ eventSource: null })
  }
}

export function setActiveTab(set: SetFn, _get: GetFn, tab: TabType) {
  set({ activeTab: tab })
}

export function clearError(set: SetFn, _get: GetFn) {
  set({ error: null })
}

export async function refresh(_set: SetFn, get: GetFn) {
  const { selectedProjectId, fetchProjects, fetchProjectSummary } = get()
  await fetchProjects()
  if (selectedProjectId) {
    await fetchProjectSummary(selectedProjectId)
  }
}
