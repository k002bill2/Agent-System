/**
 * Task Store Tests
 *
 * Zustand taskStore의 모든 기능을 검증하는 종합 테스트 파일.
 * - State: tasks, selectedTaskId, isLoading, error
 * - Actions: setTasks, addTask, updateTask, removeTask, selectTask, setLoading, setError, reset
 * - Computed: getStats(), getActiveTasks()
 * - Selectors: selectTaskById, selectTasksByStatus, selectRootTasks, selectSelectedTask, selectActiveTaskCount
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useTaskStore,
  type TaskItem,
  selectTaskById,
  selectTasksByStatus,
  selectRootTasks,
  selectSelectedTask,
  selectActiveTaskCount,
} from '../taskStore'

// ─────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────

const mockTasks: Record<string, TaskItem> = {
  'task-1': {
    id: 'task-1',
    title: 'Pending Task',
    description: 'A pending task',
    status: 'pending',
    parentId: null,
    children: ['task-2'],
    createdAt: '2024-01-01T00:00:00Z',
  },
  'task-2': {
    id: 'task-2',
    title: 'In Progress Task',
    description: 'A task in progress',
    status: 'in_progress',
    parentId: 'task-1',
    children: [],
    createdAt: '2024-01-01T01:00:00Z',
  },
  'task-3': {
    id: 'task-3',
    title: 'Completed Task',
    description: 'A completed task',
    status: 'completed',
    parentId: null,
    children: [],
    result: { output: 'success' },
    createdAt: '2024-01-01T02:00:00Z',
  },
  'task-4': {
    id: 'task-4',
    title: 'Failed Task',
    description: 'A failed task',
    status: 'failed',
    parentId: null,
    children: [],
    error: 'Something went wrong',
    createdAt: '2024-01-01T03:00:00Z',
  },
  'task-5': {
    id: 'task-5',
    title: 'Cancelled Task',
    description: 'A cancelled task',
    status: 'cancelled',
    parentId: null,
    children: [],
    createdAt: '2024-01-01T04:00:00Z',
  },
  'task-6': {
    id: 'task-6',
    title: 'Deleted Task',
    description: 'A deleted task',
    status: 'completed',
    parentId: null,
    children: [],
    isDeleted: true,
    createdAt: '2024-01-01T05:00:00Z',
  },
  'task-7': {
    id: 'task-7',
    title: 'Paused Task',
    description: 'A paused task',
    status: 'paused',
    parentId: null,
    children: [],
    createdAt: '2024-01-01T06:00:00Z',
  },
}

// ─────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset store before each test
  useTaskStore.getState().reset()
})

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('TaskStore - Initial State', () => {
  it('should have correct initial state', () => {
    const state = useTaskStore.getState()

    expect(state.tasks).toEqual({})
    expect(state.selectedTaskId).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })
})

describe('TaskStore - setTasks', () => {
  it('should replace all tasks', () => {
    const { setTasks } = useTaskStore.getState()

    setTasks(mockTasks)

    const state = useTaskStore.getState()
    expect(state.tasks).toEqual(mockTasks)
    expect(Object.keys(state.tasks)).toHaveLength(7)
  })

  it('should clear error when setting tasks', () => {
    const { setError, setTasks } = useTaskStore.getState()

    setError('Previous error')
    expect(useTaskStore.getState().error).toBe('Previous error')

    setTasks(mockTasks)
    expect(useTaskStore.getState().error).toBeNull()
  })

  it('should overwrite existing tasks completely', () => {
    const { setTasks } = useTaskStore.getState()

    setTasks(mockTasks)
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(7)

    const newTasks = {
      'task-new': {
        id: 'task-new',
        title: 'New Task',
        description: 'A brand new task',
        status: 'pending' as const,
        parentId: null,
        children: [],
      },
    }

    setTasks(newTasks)
    const state = useTaskStore.getState()
    expect(Object.keys(state.tasks)).toHaveLength(1)
    expect(state.tasks['task-new']).toBeDefined()
    expect(state.tasks['task-1']).toBeUndefined()
  })
})

describe('TaskStore - addTask', () => {
  it('should add a new task to the store', () => {
    const { addTask } = useTaskStore.getState()

    const newTask: TaskItem = {
      id: 'task-new',
      title: 'New Task',
      description: 'A new task',
      status: 'pending',
      parentId: null,
      children: [],
    }

    addTask(newTask)

    const state = useTaskStore.getState()
    expect(state.tasks['task-new']).toEqual(newTask)
    expect(Object.keys(state.tasks)).toHaveLength(1)
  })

  it('should add task without overwriting existing tasks', () => {
    const { setTasks, addTask } = useTaskStore.getState()

    setTasks(mockTasks)
    const initialCount = Object.keys(mockTasks).length

    const newTask: TaskItem = {
      id: 'task-new',
      title: 'New Task',
      description: 'A new task',
      status: 'pending',
      parentId: null,
      children: [],
    }

    addTask(newTask)

    const state = useTaskStore.getState()
    expect(Object.keys(state.tasks)).toHaveLength(initialCount + 1)
    expect(state.tasks['task-1']).toBeDefined()
    expect(state.tasks['task-new']).toBeDefined()
  })

  it('should overwrite task if id already exists', () => {
    const { setTasks, addTask } = useTaskStore.getState()

    setTasks(mockTasks)

    const updatedTask: TaskItem = {
      id: 'task-1',
      title: 'Updated Title',
      description: 'Updated description',
      status: 'completed',
      parentId: null,
      children: [],
    }

    addTask(updatedTask)

    const state = useTaskStore.getState()
    expect(state.tasks['task-1'].title).toBe('Updated Title')
    expect(state.tasks['task-1'].status).toBe('completed')
    expect(Object.keys(state.tasks)).toHaveLength(7) // Same count
  })
})

describe('TaskStore - updateTask', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  it('should update existing task with new fields', () => {
    const { updateTask } = useTaskStore.getState()

    updateTask('task-1', { status: 'completed', result: { data: 'test' } })

    const state = useTaskStore.getState()
    expect(state.tasks['task-1'].status).toBe('completed')
    expect(state.tasks['task-1'].result).toEqual({ data: 'test' })
  })

  it('should add updatedAt timestamp when updating', () => {
    const { updateTask } = useTaskStore.getState()
    const beforeUpdate = new Date().toISOString()

    updateTask('task-1', { status: 'in_progress' })

    const state = useTaskStore.getState()
    expect(state.tasks['task-1'].updatedAt).toBeDefined()
    expect(state.tasks['task-1'].updatedAt! >= beforeUpdate).toBe(true)
  })

  it('should return unchanged state if task not found', () => {
    const { updateTask } = useTaskStore.getState()
    const stateBefore = useTaskStore.getState()

    updateTask('non-existent-id', { status: 'completed' })

    const stateAfter = useTaskStore.getState()
    expect(stateAfter).toBe(stateBefore) // Same reference = unchanged
  })

  it('should preserve fields not included in updates', () => {
    const { updateTask } = useTaskStore.getState()
    const originalTask = { ...mockTasks['task-1'] }

    updateTask('task-1', { status: 'completed' })

    const state = useTaskStore.getState()
    expect(state.tasks['task-1'].title).toBe(originalTask.title)
    expect(state.tasks['task-1'].description).toBe(originalTask.description)
    expect(state.tasks['task-1'].parentId).toBe(originalTask.parentId)
    expect(state.tasks['task-1'].children).toEqual(originalTask.children)
  })

  it('should handle partial updates', () => {
    const { updateTask } = useTaskStore.getState()

    updateTask('task-3', { error: 'New error message' })

    const state = useTaskStore.getState()
    expect(state.tasks['task-3'].error).toBe('New error message')
    expect(state.tasks['task-3'].status).toBe('completed') // Unchanged
  })
})

describe('TaskStore - removeTask', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  it('should remove task from store', () => {
    const { removeTask } = useTaskStore.getState()

    removeTask('task-1')

    const state = useTaskStore.getState()
    expect(state.tasks['task-1']).toBeUndefined()
    expect(Object.keys(state.tasks)).toHaveLength(6)
  })

  it('should clear selectedTaskId if removed task was selected', () => {
    const { selectTask, removeTask } = useTaskStore.getState()

    selectTask('task-1')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-1')

    removeTask('task-1')

    const state = useTaskStore.getState()
    expect(state.selectedTaskId).toBeNull()
    expect(state.tasks['task-1']).toBeUndefined()
  })

  it('should not clear selectedTaskId if different task was selected', () => {
    const { selectTask, removeTask } = useTaskStore.getState()

    selectTask('task-2')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-2')

    removeTask('task-1')

    const state = useTaskStore.getState()
    expect(state.selectedTaskId).toBe('task-2') // Still selected
  })

  it('should handle removing non-existent task gracefully', () => {
    const { removeTask } = useTaskStore.getState()
    const initialCount = Object.keys(mockTasks).length

    removeTask('non-existent-id')

    const state = useTaskStore.getState()
    expect(Object.keys(state.tasks)).toHaveLength(initialCount)
  })
})

describe('TaskStore - selectTask', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  it('should set selectedTaskId', () => {
    const { selectTask } = useTaskStore.getState()

    selectTask('task-3')

    expect(useTaskStore.getState().selectedTaskId).toBe('task-3')
  })

  it('should allow selecting null', () => {
    const { selectTask } = useTaskStore.getState()

    selectTask('task-1')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-1')

    selectTask(null)
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('should allow selecting different tasks sequentially', () => {
    const { selectTask } = useTaskStore.getState()

    selectTask('task-1')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-1')

    selectTask('task-2')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-2')

    selectTask('task-3')
    expect(useTaskStore.getState().selectedTaskId).toBe('task-3')
  })
})

describe('TaskStore - setLoading', () => {
  it('should set isLoading to true', () => {
    const { setLoading } = useTaskStore.getState()

    setLoading(true)

    expect(useTaskStore.getState().isLoading).toBe(true)
  })

  it('should set isLoading to false', () => {
    const { setLoading } = useTaskStore.getState()

    setLoading(true)
    expect(useTaskStore.getState().isLoading).toBe(true)

    setLoading(false)
    expect(useTaskStore.getState().isLoading).toBe(false)
  })
})

describe('TaskStore - setError', () => {
  it('should set error message', () => {
    const { setError } = useTaskStore.getState()

    setError('Something went wrong')

    expect(useTaskStore.getState().error).toBe('Something went wrong')
  })

  it('should set isLoading to false when setting error', () => {
    const { setLoading, setError } = useTaskStore.getState()

    setLoading(true)
    expect(useTaskStore.getState().isLoading).toBe(true)

    setError('Error occurred')

    const state = useTaskStore.getState()
    expect(state.error).toBe('Error occurred')
    expect(state.isLoading).toBe(false)
  })

  it('should allow clearing error by setting null', () => {
    const { setError } = useTaskStore.getState()

    setError('Error message')
    expect(useTaskStore.getState().error).toBe('Error message')

    setError(null)
    expect(useTaskStore.getState().error).toBeNull()
  })
})

describe('TaskStore - reset', () => {
  it('should reset all state to initial values', () => {
    const { setTasks, selectTask, setLoading, setError, reset } = useTaskStore.getState()

    // Modify state (note: setError also sets isLoading=false, so set it last)
    setTasks(mockTasks)
    selectTask('task-1')
    setError('Some error')
    setLoading(true)

    // Verify state was modified
    let state = useTaskStore.getState()
    expect(Object.keys(state.tasks).length).toBeGreaterThan(0)
    expect(state.selectedTaskId).toBe('task-1')
    expect(state.isLoading).toBe(true)
    expect(state.error).toBe('Some error')

    // Reset
    reset()

    // Verify state is reset
    state = useTaskStore.getState()
    expect(state.tasks).toEqual({})
    expect(state.selectedTaskId).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })
})

describe('TaskStore - getStats (computed)', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  it('should compute correct stats for all tasks', () => {
    const { getStats } = useTaskStore.getState()

    const stats = getStats()

    expect(stats).toEqual({
      total: 6, // Excludes deleted task-6
      pending: 1, // task-1
      inProgress: 1, // task-2
      completed: 1, // task-3 (task-6 is deleted)
      failed: 1, // task-4
      cancelled: 1, // task-5
    })
  })

  it('should exclude deleted tasks from stats', () => {
    const { getStats } = useTaskStore.getState()

    const stats = getStats()

    // task-6 is deleted and completed, but should not count
    expect(stats.completed).toBe(1) // Only task-3
    expect(stats.total).toBe(6) // Excludes task-6
  })

  it('should return empty stats for empty store', () => {
    useTaskStore.getState().reset()
    const { getStats } = useTaskStore.getState()

    const stats = getStats()

    expect(stats).toEqual({
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    })
  })

  it('should not count paused tasks in main categories', () => {
    const { getStats } = useTaskStore.getState()

    const stats = getStats()

    // task-7 is paused, should be in total but not in specific categories
    expect(stats.total).toBe(6)
    expect(stats.pending + stats.inProgress + stats.completed + stats.failed + stats.cancelled).toBe(5)
  })

  it('should update stats dynamically when tasks change', () => {
    const { updateTask, getStats } = useTaskStore.getState()

    const initialStats = getStats()
    expect(initialStats.pending).toBe(1)
    expect(initialStats.completed).toBe(1)

    // Change task-1 from pending to completed
    updateTask('task-1', { status: 'completed' })

    const updatedStats = getStats()
    expect(updatedStats.pending).toBe(0)
    expect(updatedStats.completed).toBe(2)
  })
})

describe('TaskStore - getActiveTasks (computed)', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  it('should return all non-deleted tasks', () => {
    const { getActiveTasks } = useTaskStore.getState()

    const activeTasks = getActiveTasks()

    expect(activeTasks).toHaveLength(6)
    expect(activeTasks.find((t) => t.id === 'task-6')).toBeUndefined() // Deleted task excluded
  })

  it('should include all status types except deleted', () => {
    const { getActiveTasks } = useTaskStore.getState()

    const activeTasks = getActiveTasks()

    const statuses = activeTasks.map((t) => t.status)
    expect(statuses).toContain('pending')
    expect(statuses).toContain('in_progress')
    expect(statuses).toContain('completed')
    expect(statuses).toContain('failed')
    expect(statuses).toContain('cancelled')
    expect(statuses).toContain('paused')
  })

  it('should return empty array for empty store', () => {
    useTaskStore.getState().reset()
    const { getActiveTasks } = useTaskStore.getState()

    const activeTasks = getActiveTasks()

    expect(activeTasks).toEqual([])
  })

  it('should return empty array when all tasks are deleted', () => {
    const { setTasks, getActiveTasks } = useTaskStore.getState()

    const deletedTasks: Record<string, TaskItem> = {
      'task-del-1': { ...mockTasks['task-1'], isDeleted: true },
      'task-del-2': { ...mockTasks['task-2'], isDeleted: true },
    }

    setTasks(deletedTasks)

    const activeTasks = getActiveTasks()

    expect(activeTasks).toEqual([])
  })
})

describe('TaskStore - Selectors', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks(mockTasks)
  })

  describe('selectTaskById', () => {
    it('should return task by id', () => {
      const state = useTaskStore.getState()

      const task = selectTaskById(state, 'task-1')

      expect(task).toBeDefined()
      expect(task?.id).toBe('task-1')
      expect(task?.title).toBe('Pending Task')
    })

    it('should return undefined for non-existent id', () => {
      const state = useTaskStore.getState()

      const task = selectTaskById(state, 'non-existent')

      expect(task).toBeUndefined()
    })

    it('should return deleted task (selector does not filter)', () => {
      const state = useTaskStore.getState()

      const task = selectTaskById(state, 'task-6')

      expect(task).toBeDefined()
      expect(task?.isDeleted).toBe(true)
    })
  })

  describe('selectTasksByStatus', () => {
    it('should filter tasks by pending status', () => {
      const state = useTaskStore.getState()

      const tasks = selectTasksByStatus(state, 'pending')

      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-1')
    })

    it('should filter tasks by in_progress status', () => {
      const state = useTaskStore.getState()

      const tasks = selectTasksByStatus(state, 'in_progress')

      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-2')
    })

    it('should exclude deleted tasks from status filter', () => {
      const state = useTaskStore.getState()

      const tasks = selectTasksByStatus(state, 'completed')

      // task-3 is completed and not deleted
      // task-6 is completed but deleted
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-3')
    })

    it('should return empty array for status with no tasks', () => {
      useTaskStore.getState().reset()
      const state = useTaskStore.getState()

      const tasks = selectTasksByStatus(state, 'pending')

      expect(tasks).toEqual([])
    })
  })

  describe('selectRootTasks', () => {
    it('should return only tasks with parentId === null', () => {
      const state = useTaskStore.getState()

      const rootTasks = selectRootTasks(state)

      expect(rootTasks).toHaveLength(5) // All except task-2 (has parent) and task-6 (deleted)
      expect(rootTasks.find((t) => t.id === 'task-2')).toBeUndefined() // Has parent
      expect(rootTasks.find((t) => t.id === 'task-6')).toBeUndefined() // Deleted
    })

    it('should exclude deleted root tasks', () => {
      const state = useTaskStore.getState()

      const rootTasks = selectRootTasks(state)

      expect(rootTasks.find((t) => t.id === 'task-6')).toBeUndefined()
    })

    it('should return empty array when no root tasks exist', () => {
      const { setTasks } = useTaskStore.getState()

      const childOnlyTasks: Record<string, TaskItem> = {
        'child-1': { ...mockTasks['task-2'], parentId: 'some-parent' },
        'child-2': { ...mockTasks['task-2'], id: 'child-2', parentId: 'another-parent' },
      }

      setTasks(childOnlyTasks)

      const state = useTaskStore.getState()
      const rootTasks = selectRootTasks(state)

      expect(rootTasks).toEqual([])
    })
  })

  describe('selectSelectedTask', () => {
    it('should return selected task object', () => {
      const { selectTask } = useTaskStore.getState()

      selectTask('task-3')

      const state = useTaskStore.getState()
      const selectedTask = selectSelectedTask(state)

      expect(selectedTask).toBeDefined()
      expect(selectedTask?.id).toBe('task-3')
      expect(selectedTask?.title).toBe('Completed Task')
    })

    it('should return undefined when no task is selected', () => {
      const state = useTaskStore.getState()

      const selectedTask = selectSelectedTask(state)

      expect(selectedTask).toBeUndefined()
    })

    it('should return undefined when selected task does not exist', () => {
      const { selectTask } = useTaskStore.getState()

      selectTask('non-existent-id')

      const state = useTaskStore.getState()
      const selectedTask = selectSelectedTask(state)

      expect(selectedTask).toBeUndefined()
    })

    it('should return deleted task if it is selected (selector does not filter)', () => {
      const { selectTask } = useTaskStore.getState()

      selectTask('task-6')

      const state = useTaskStore.getState()
      const selectedTask = selectSelectedTask(state)

      expect(selectedTask).toBeDefined()
      expect(selectedTask?.isDeleted).toBe(true)
    })
  })

  describe('selectActiveTaskCount', () => {
    it('should count all non-deleted tasks', () => {
      const state = useTaskStore.getState()

      const count = selectActiveTaskCount(state)

      expect(count).toBe(6) // 7 total - 1 deleted
    })

    it('should return 0 for empty store', () => {
      useTaskStore.getState().reset()
      const state = useTaskStore.getState()

      const count = selectActiveTaskCount(state)

      expect(count).toBe(0)
    })

    it('should exclude all deleted tasks', () => {
      const { updateTask } = useTaskStore.getState()

      // Mark more tasks as deleted
      updateTask('task-1', { isDeleted: true })
      updateTask('task-2', { isDeleted: true })

      const state = useTaskStore.getState()
      const count = selectActiveTaskCount(state)

      expect(count).toBe(4) // 7 total - 3 deleted
    })
  })
})

describe('TaskStore - Edge Cases & Integration', () => {
  it('should handle rapid successive updates', () => {
    const { addTask, updateTask } = useTaskStore.getState()

    const task: TaskItem = {
      id: 'rapid-task',
      title: 'Rapid Task',
      description: 'Testing rapid updates',
      status: 'pending',
      parentId: null,
      children: [],
    }

    addTask(task)
    updateTask('rapid-task', { status: 'in_progress' })
    updateTask('rapid-task', { status: 'completed', result: { data: 'done' } })

    const state = useTaskStore.getState()
    expect(state.tasks['rapid-task'].status).toBe('completed')
    expect(state.tasks['rapid-task'].result).toEqual({ data: 'done' })
  })

  it('should maintain referential integrity when updating nested structures', () => {
    const { addTask, updateTask } = useTaskStore.getState()

    const parentTask: TaskItem = {
      id: 'parent',
      title: 'Parent Task',
      description: 'Parent',
      status: 'pending',
      parentId: null,
      children: ['child-1', 'child-2'],
    }

    addTask(parentTask)

    updateTask('parent', { children: ['child-1', 'child-2', 'child-3'] })

    const state = useTaskStore.getState()
    expect(state.tasks['parent'].children).toEqual(['child-1', 'child-2', 'child-3'])
  })

  it('should handle complex error scenarios', () => {
    const { addTask, updateTask, setError } = useTaskStore.getState()

    const task: TaskItem = {
      id: 'error-task',
      title: 'Error Task',
      description: 'Testing error handling',
      status: 'pending',
      parentId: null,
      children: [],
    }

    addTask(task)

    // Simulate task failure
    updateTask('error-task', {
      status: 'failed',
      error: 'Task execution failed',
      retryCount: 3,
    })

    // Set global error
    setError('Global error occurred')

    const state = useTaskStore.getState()
    expect(state.tasks['error-task'].status).toBe('failed')
    expect(state.tasks['error-task'].error).toBe('Task execution failed')
    expect(state.tasks['error-task'].retryCount).toBe(3)
    expect(state.error).toBe('Global error occurred')
  })
})
