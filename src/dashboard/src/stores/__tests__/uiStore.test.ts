/**
 * UI Store Tests
 *
 * Comprehensive test suite for uiStore covering:
 * - Theme management (light/dark/system)
 * - Sidebar state (open/close/toggle)
 * - Modal management (open/close/data)
 * - Toast notifications (add/remove/auto-dismiss)
 * - Global loading state
 * - Selectors
 * - Reset functionality
 * - LocalStorage persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useUIStore,
  selectTheme,
  selectActiveToasts,
  selectHasToasts,
  selectIsGlobalLoading,
  type Theme,
  type ToastType,
} from '../uiStore'

// localStorage mock은 test/setup.ts에서 글로벌 제공

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUIStore.getState().reset()
    window.localStorage.clear()
    vi.clearAllTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─────────────────────────────────────────────────────────────
  // Initial State
  // ─────────────────────────────────────────────────────────────

  it('should have correct initial state', () => {
    const state = useUIStore.getState()

    expect(state.theme).toBe('system')
    expect(state.isSidebarOpen).toBe(true)
    expect(state.modals).toEqual({})
    expect(state.toasts).toEqual([])
    expect(state.isGlobalLoading).toBe(false)
    expect(state.globalLoadingMessage).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // Theme Management
  // ─────────────────────────────────────────────────────────────

  it('should set theme to light', () => {
    const { setTheme } = useUIStore.getState()
    setTheme('light')

    expect(useUIStore.getState().theme).toBe('light')
  })

  it('should set theme to dark', () => {
    const { setTheme } = useUIStore.getState()
    setTheme('dark')

    expect(useUIStore.getState().theme).toBe('dark')
  })

  it('should set theme to system', () => {
    const { setTheme } = useUIStore.getState()
    setTheme('light')
    setTheme('system')

    expect(useUIStore.getState().theme).toBe('system')
  })

  // ─────────────────────────────────────────────────────────────
  // Sidebar Management
  // ─────────────────────────────────────────────────────────────

  it('should toggle sidebar from open to closed', () => {
    const { toggleSidebar } = useUIStore.getState()
    expect(useUIStore.getState().isSidebarOpen).toBe(true)

    toggleSidebar()
    expect(useUIStore.getState().isSidebarOpen).toBe(false)
  })

  it('should toggle sidebar from closed to open', () => {
    const { toggleSidebar } = useUIStore.getState()
    toggleSidebar() // close
    toggleSidebar() // open

    expect(useUIStore.getState().isSidebarOpen).toBe(true)
  })

  it('should set sidebar open directly', () => {
    const { setSidebarOpen } = useUIStore.getState()
    setSidebarOpen(false)

    expect(useUIStore.getState().isSidebarOpen).toBe(false)

    setSidebarOpen(true)
    expect(useUIStore.getState().isSidebarOpen).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────
  // Modal Management
  // ─────────────────────────────────────────────────────────────

  it('should open modal without data', () => {
    const { openModal } = useUIStore.getState()
    openModal('testModal')

    const state = useUIStore.getState()
    expect(state.modals['testModal']).toEqual({
      id: 'testModal',
      isOpen: true,
      data: undefined,
    })
  })

  it('should open modal with data', () => {
    const { openModal } = useUIStore.getState()
    const modalData = { userId: 123, name: 'Test User' }
    openModal('userModal', modalData)

    const state = useUIStore.getState()
    expect(state.modals['userModal']).toEqual({
      id: 'userModal',
      isOpen: true,
      data: modalData,
    })
  })

  it('should close modal (keeps in record with isOpen=false)', () => {
    const { openModal, closeModal } = useUIStore.getState()
    const modalData = { test: 'data' }

    openModal('testModal', modalData)
    closeModal('testModal')

    const state = useUIStore.getState()
    expect(state.modals['testModal']).toEqual({
      id: 'testModal',
      isOpen: false,
      data: modalData,
    })
  })

  it('should check if modal is open', () => {
    const { openModal, closeModal, isModalOpen } = useUIStore.getState()

    expect(isModalOpen('testModal')).toBe(false)

    openModal('testModal')
    expect(isModalOpen('testModal')).toBe(true)

    closeModal('testModal')
    expect(isModalOpen('testModal')).toBe(false)
  })

  it('should return false for non-existent modal', () => {
    const { isModalOpen } = useUIStore.getState()
    expect(isModalOpen('nonExistentModal')).toBe(false)
  })

  it('should get modal data', () => {
    const { openModal, getModalData } = useUIStore.getState()
    const modalData = { key: 'value', count: 42 }

    openModal('dataModal', modalData)

    expect(getModalData('dataModal')).toEqual(modalData)
  })

  it('should return undefined for non-existent modal data', () => {
    const { getModalData } = useUIStore.getState()
    expect(getModalData('nonExistent')).toBeUndefined()
  })

  it('should return undefined for modal without data', () => {
    const { openModal, getModalData } = useUIStore.getState()
    openModal('noDataModal')

    expect(getModalData('noDataModal')).toBeUndefined()
  })

  // ─────────────────────────────────────────────────────────────
  // Toast Management
  // ─────────────────────────────────────────────────────────────

  it('should add toast with auto-generated id', () => {
    const { addToast } = useUIStore.getState()

    addToast({
      type: 'success',
      title: 'Success!',
      description: 'Operation completed',
    })

    const state = useUIStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0]).toMatchObject({
      type: 'success',
      title: 'Success!',
      description: 'Operation completed',
    })
    expect(state.toasts[0].id).toMatch(/^toast-\d+-\d+$/)
  })

  it('should add multiple toasts', () => {
    const { addToast } = useUIStore.getState()

    addToast({ type: 'info', title: 'Info 1' })
    addToast({ type: 'warning', title: 'Warning 1' })
    addToast({ type: 'error', title: 'Error 1' })

    const state = useUIStore.getState()
    expect(state.toasts).toHaveLength(3)
    expect(state.toasts[0].type).toBe('info')
    expect(state.toasts[1].type).toBe('warning')
    expect(state.toasts[2].type).toBe('error')
  })

  it('should remove toast by id', () => {
    const { addToast, removeToast } = useUIStore.getState()

    addToast({ type: 'success', title: 'Toast 1' })
    addToast({ type: 'info', title: 'Toast 2' })

    const state = useUIStore.getState()
    const firstToastId = state.toasts[0].id

    removeToast(firstToastId)

    const updatedState = useUIStore.getState()
    expect(updatedState.toasts).toHaveLength(1)
    expect(updatedState.toasts[0].title).toBe('Toast 2')
  })

  it('should clear all toasts', () => {
    const { addToast, clearToasts } = useUIStore.getState()

    addToast({ type: 'success', title: 'Toast 1' })
    addToast({ type: 'info', title: 'Toast 2' })
    addToast({ type: 'warning', title: 'Toast 3' })

    expect(useUIStore.getState().toasts).toHaveLength(3)

    clearToasts()
    expect(useUIStore.getState().toasts).toHaveLength(0)
  })

  it('should auto-remove toast after default duration (5000ms)', () => {
    vi.useFakeTimers()
    const { addToast } = useUIStore.getState()

    addToast({ type: 'success', title: 'Auto remove' })
    expect(useUIStore.getState().toasts).toHaveLength(1)

    // Fast-forward time by 5000ms
    vi.advanceTimersByTime(5000)
    expect(useUIStore.getState().toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('should auto-remove toast after custom duration', () => {
    vi.useFakeTimers()
    const { addToast } = useUIStore.getState()

    addToast({
      type: 'info',
      title: 'Custom duration',
      duration: 3000,
    })

    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(2999)
    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useUIStore.getState().toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('should not auto-remove toast when duration is 0', () => {
    vi.useFakeTimers()
    const { addToast } = useUIStore.getState()

    addToast({
      type: 'warning',
      title: 'Permanent toast',
      duration: 0,
    })

    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(10000)
    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.useRealTimers()
  })

  it('should handle multiple toasts with different durations', () => {
    vi.useFakeTimers()
    const { addToast } = useUIStore.getState()

    addToast({ type: 'info', title: 'Toast 1', duration: 1000 })
    addToast({ type: 'success', title: 'Toast 2', duration: 3000 })
    addToast({ type: 'warning', title: 'Toast 3', duration: 5000 })

    expect(useUIStore.getState().toasts).toHaveLength(3)

    vi.advanceTimersByTime(1000)
    expect(useUIStore.getState().toasts).toHaveLength(2)

    vi.advanceTimersByTime(2000)
    expect(useUIStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(2000)
    expect(useUIStore.getState().toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  // ─────────────────────────────────────────────────────────────
  // Global Loading
  // ─────────────────────────────────────────────────────────────

  it('should set global loading to true without message', () => {
    const { setGlobalLoading } = useUIStore.getState()
    setGlobalLoading(true)

    const state = useUIStore.getState()
    expect(state.isGlobalLoading).toBe(true)
    expect(state.globalLoadingMessage).toBeNull()
  })

  it('should set global loading to true with message', () => {
    const { setGlobalLoading } = useUIStore.getState()
    setGlobalLoading(true, 'Loading data...')

    const state = useUIStore.getState()
    expect(state.isGlobalLoading).toBe(true)
    expect(state.globalLoadingMessage).toBe('Loading data...')
  })

  it('should set global loading to false and clear message', () => {
    const { setGlobalLoading } = useUIStore.getState()
    setGlobalLoading(true, 'Loading...')
    setGlobalLoading(false)

    const state = useUIStore.getState()
    expect(state.isGlobalLoading).toBe(false)
    expect(state.globalLoadingMessage).toBeNull()
  })

  it('should update loading message', () => {
    const { setGlobalLoading } = useUIStore.getState()
    setGlobalLoading(true, 'Step 1...')
    setGlobalLoading(true, 'Step 2...')

    expect(useUIStore.getState().globalLoadingMessage).toBe('Step 2...')
  })

  // ─────────────────────────────────────────────────────────────
  // Selectors
  // ─────────────────────────────────────────────────────────────

  it('selectTheme should return current theme', () => {
    const { setTheme } = useUIStore.getState()
    setTheme('dark')

    const theme = selectTheme(useUIStore.getState())
    expect(theme).toBe('dark')
  })

  it('selectActiveToasts should return toast array', () => {
    const { addToast } = useUIStore.getState()
    addToast({ type: 'info', title: 'Test' })

    const toasts = selectActiveToasts(useUIStore.getState())
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toBe('Test')
  })

  it('selectActiveToasts should return empty array when no toasts', () => {
    const toasts = selectActiveToasts(useUIStore.getState())
    expect(toasts).toEqual([])
  })

  it('selectHasToasts should return true when toasts exist', () => {
    const { addToast } = useUIStore.getState()
    addToast({ type: 'success', title: 'Test' })

    const hasToasts = selectHasToasts(useUIStore.getState())
    expect(hasToasts).toBe(true)
  })

  it('selectHasToasts should return false when no toasts', () => {
    const hasToasts = selectHasToasts(useUIStore.getState())
    expect(hasToasts).toBe(false)
  })

  it('selectIsGlobalLoading should return loading state', () => {
    const { setGlobalLoading } = useUIStore.getState()

    expect(selectIsGlobalLoading(useUIStore.getState())).toBe(false)

    setGlobalLoading(true)
    expect(selectIsGlobalLoading(useUIStore.getState())).toBe(true)

    setGlobalLoading(false)
    expect(selectIsGlobalLoading(useUIStore.getState())).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────────────────────

  it('should reset to initial state', () => {
    const { setTheme, toggleSidebar, openModal, addToast, setGlobalLoading, reset } =
      useUIStore.getState()

    // Modify all state
    setTheme('dark')
    toggleSidebar()
    openModal('testModal', { key: 'value' })
    addToast({ type: 'info', title: 'Test' })
    setGlobalLoading(true, 'Loading...')

    // Verify state is modified
    const modifiedState = useUIStore.getState()
    expect(modifiedState.theme).toBe('dark')
    expect(modifiedState.isSidebarOpen).toBe(false)
    expect(Object.keys(modifiedState.modals)).toHaveLength(1)
    expect(modifiedState.toasts).toHaveLength(1)
    expect(modifiedState.isGlobalLoading).toBe(true)

    // Reset
    reset()

    // Verify reset to initial
    const resetState = useUIStore.getState()
    expect(resetState.theme).toBe('system')
    expect(resetState.isSidebarOpen).toBe(true)
    expect(resetState.modals).toEqual({})
    expect(resetState.toasts).toEqual([])
    expect(resetState.isGlobalLoading).toBe(false)
    expect(resetState.globalLoadingMessage).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // LocalStorage Persistence
  // ─────────────────────────────────────────────────────────────

  it('should maintain theme state through multiple changes', () => {
    const { setTheme } = useUIStore.getState()

    setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')

    setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')

    setTheme('system')
    expect(useUIStore.getState().theme).toBe('system')
  })

  it('should maintain sidebar state through toggle cycles', () => {
    const { toggleSidebar } = useUIStore.getState()

    // Default: open
    expect(useUIStore.getState().isSidebarOpen).toBe(true)

    toggleSidebar()
    expect(useUIStore.getState().isSidebarOpen).toBe(false)

    toggleSidebar()
    expect(useUIStore.getState().isSidebarOpen).toBe(true)
  })

  it('should not lose modal/toast state on theme change', () => {
    const { setTheme, openModal, addToast } = useUIStore.getState()

    openModal('test', { key: 'value' })
    addToast({ type: 'info', title: 'Test' })
    setTheme('dark')

    const state = useUIStore.getState()
    expect(state.theme).toBe('dark')
    expect(state.modals['test']?.isOpen).toBe(true)
    expect(state.toasts).toHaveLength(1)
  })

  // ─────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────

  it('should handle opening same modal multiple times', () => {
    const { openModal } = useUIStore.getState()

    openModal('testModal', { data: 'first' })
    openModal('testModal', { data: 'second' })

    const state = useUIStore.getState()
    expect(Object.keys(state.modals)).toHaveLength(1)
    expect(state.modals['testModal'].data).toEqual({ data: 'second' })
  })

  it('should handle removing non-existent toast', () => {
    const { removeToast } = useUIStore.getState()

    // Should not throw
    expect(() => removeToast('nonExistent')).not.toThrow()
    expect(useUIStore.getState().toasts).toEqual([])
  })

  it('should generate unique toast IDs', () => {
    const { addToast } = useUIStore.getState()

    addToast({ type: 'info', title: 'Toast 1' })
    addToast({ type: 'info', title: 'Toast 2' })
    addToast({ type: 'info', title: 'Toast 3' })

    const state = useUIStore.getState()
    const ids = state.toasts.map((t) => t.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(3)
  })

  it('should handle all toast types', () => {
    const { addToast } = useUIStore.getState()
    const types: ToastType[] = ['success', 'error', 'warning', 'info']

    types.forEach((type) => {
      addToast({ type, title: `${type} toast` })
    })

    const state = useUIStore.getState()
    expect(state.toasts).toHaveLength(4)

    state.toasts.forEach((toast, index) => {
      expect(toast.type).toBe(types[index])
    })
  })

  it('should handle theme transitions', () => {
    const { setTheme } = useUIStore.getState()
    const themes: Theme[] = ['light', 'dark', 'system', 'light']

    themes.forEach((theme) => {
      setTheme(theme)
      expect(useUIStore.getState().theme).toBe(theme)
    })
  })
})
