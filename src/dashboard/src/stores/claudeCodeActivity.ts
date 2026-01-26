/**
 * Claude Code Activity Store
 *
 * Manages activity events and tasks from external Claude Code sessions
 * for Dashboard integration with real-time SSE streaming.
 */

import { create } from 'zustand'
import {
  ActivityEvent,
  ActivityResponse,
  ClaudeCodeTask,
  TasksResponse,
  DataSource,
} from '../types/claudeCodeActivity'

const API_BASE = '/api'

interface ClaudeCodeActivityState {
  // Data source toggle
  dataSource: DataSource

  // Active session for Claude Code
  activeSessionId: string | null

  // Activity state
  activities: ActivityEvent[]
  activityTotalCount: number
  isLoadingActivity: boolean
  hasMoreActivity: boolean
  activityOffset: number

  // Tasks state
  tasks: Record<string, ClaudeCodeTask>
  rootTaskIds: string[]
  isLoadingTasks: boolean

  // SSE connection
  eventSource: EventSource | null

  // Error state
  error: string | null

  // Actions
  setDataSource: (source: DataSource) => void
  setActiveSession: (sessionId: string | null) => void
  fetchActivity: (sessionId: string, offset?: number, append?: boolean) => Promise<void>
  fetchTasks: (sessionId: string) => Promise<void>
  startStreaming: (sessionId: string) => void
  stopStreaming: () => void
  clearActivity: () => void
  clearTasks: () => void
  clearError: () => void
}

export const useClaudeCodeActivityStore = create<ClaudeCodeActivityState>((set, get) => ({
  // Initial state
  dataSource: 'aos',
  activeSessionId: null,

  // Activity initial state
  activities: [],
  activityTotalCount: 0,
  isLoadingActivity: false,
  hasMoreActivity: false,
  activityOffset: 0,

  // Tasks initial state
  tasks: {},
  rootTaskIds: [],
  isLoadingTasks: false,

  // SSE initial state
  eventSource: null,

  // Error initial state
  error: null,

  // Actions

  setDataSource: (source: DataSource) => {
    const { stopStreaming, clearActivity, clearTasks } = get()

    // Stop streaming and clear data when switching sources
    stopStreaming()
    clearActivity()
    clearTasks()

    set({
      dataSource: source,
      activeSessionId: null,
    })
  },

  setActiveSession: (sessionId: string | null) => {
    const { stopStreaming, clearActivity, clearTasks, fetchActivity, fetchTasks, startStreaming } = get()

    // Stop existing stream
    stopStreaming()

    if (sessionId === null) {
      clearActivity()
      clearTasks()
      set({ activeSessionId: null })
      return
    }

    set({ activeSessionId: sessionId })

    // Fetch initial data and start streaming
    Promise.all([
      fetchActivity(sessionId),
      fetchTasks(sessionId),
    ]).then(() => {
      startStreaming(sessionId)
    })
  },

  fetchActivity: async (sessionId: string, offset = 0, append = false) => {
    set({ isLoadingActivity: true, error: null })

    try {
      const params = new URLSearchParams()
      params.set('offset', offset.toString())
      params.set('limit', '100')

      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}/activity?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch activity: ${res.statusText}`)
      }

      const data: ActivityResponse = await res.json()

      set((state) => ({
        activities: append
          ? [...state.activities, ...data.events]
          : data.events,
        activityTotalCount: data.total_count,
        hasMoreActivity: data.has_more,
        activityOffset: data.offset,
        isLoadingActivity: false,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingActivity: false })
    }
  },

  fetchTasks: async (sessionId: string) => {
    set({ isLoadingTasks: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}/tasks`)
      if (!res.ok) {
        throw new Error(`Failed to fetch tasks: ${res.statusText}`)
      }

      const data: TasksResponse = await res.json()

      set({
        tasks: data.tasks,
        rootTaskIds: data.root_task_ids,
        isLoadingTasks: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingTasks: false })
    }
  },

  startStreaming: (sessionId: string) => {
    const { eventSource: existing, stopStreaming } = get()

    // Close existing connection
    if (existing) {
      stopStreaming()
    }

    const eventSource = new EventSource(
      `${API_BASE}/claude-sessions/${sessionId}/activity/stream`
    )

    // Handle initial batch of activity
    eventSource.addEventListener('activity_batch', (event) => {
      try {
        const events: ActivityEvent[] = JSON.parse(event.data)
        set({ activities: events })
      } catch (e) {
        console.error('Failed to parse activity batch:', e)
      }
    })

    // Handle new individual activity events
    eventSource.addEventListener('activity', (event) => {
      try {
        const activity: ActivityEvent = JSON.parse(event.data)
        set((state) => ({
          activities: [...state.activities, activity],
          activityTotalCount: state.activityTotalCount + 1,
        }))

        // If it's a TaskCreate or TaskUpdate tool call, refresh tasks
        if (activity.type === 'tool_use' &&
            activity.tool_name &&
            (activity.tool_name === 'TaskCreate' || activity.tool_name === 'TaskUpdate')) {
          get().fetchTasks(sessionId)
        }
      } catch (e) {
        console.error('Failed to parse activity event:', e)
      }
    })

    eventSource.addEventListener('session_completed', () => {
      // Session completed, but keep the data
      console.log('Claude Code session completed')
    })

    eventSource.addEventListener('error', (event) => {
      console.warn('SSE connection error:', event)
      // Attempt to reconnect after a short delay
      setTimeout(() => {
        const { activeSessionId, dataSource } = get()
        if (activeSessionId && dataSource === 'claude-code') {
          get().startStreaming(activeSessionId)
        }
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

  clearActivity: () => {
    set({
      activities: [],
      activityTotalCount: 0,
      hasMoreActivity: false,
      activityOffset: 0,
    })
  },

  clearTasks: () => {
    set({
      tasks: {},
      rootTaskIds: [],
    })
  },

  clearError: () => {
    set({ error: null })
  },
}))
