import { describe, it, expect, beforeEach } from 'vitest'
import { useNavigationStore, isPublicView, PUBLIC_VIEWS } from '../navigation'

describe('navigation store', () => {
  beforeEach(() => {
    // Reset store to default state
    useNavigationStore.setState({
      currentView: 'dashboard',
      projectFilter: null,
    })
  })

  describe('initial state', () => {
    it('has default currentView as dashboard', () => {
      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('dashboard')
    })

    it('has default projectFilter as null', () => {
      const state = useNavigationStore.getState()
      expect(state.projectFilter).toBeNull()
    })
  })

  describe('setView', () => {
    it('updates currentView', () => {
      const { setView } = useNavigationStore.getState()

      setView('tasks')
      expect(useNavigationStore.getState().currentView).toBe('tasks')

      setView('agents')
      expect(useNavigationStore.getState().currentView).toBe('agents')
    })

    it('can set to login view', () => {
      const { setView } = useNavigationStore.getState()
      setView('login')
      expect(useNavigationStore.getState().currentView).toBe('login')
    })
  })

  describe('setProjectFilter', () => {
    it('sets project filter to a project id', () => {
      const { setProjectFilter } = useNavigationStore.getState()

      setProjectFilter('project-123')
      expect(useNavigationStore.getState().projectFilter).toBe('project-123')
    })

    it('clears project filter when set to null', () => {
      const { setProjectFilter } = useNavigationStore.getState()

      setProjectFilter('project-123')
      setProjectFilter(null)
      expect(useNavigationStore.getState().projectFilter).toBeNull()
    })
  })
})

describe('isPublicView', () => {
  it('returns true for login', () => {
    expect(isPublicView('login')).toBe(true)
  })

  it('returns true for register', () => {
    expect(isPublicView('register')).toBe(true)
  })

  it('returns true for auth-callback-google', () => {
    expect(isPublicView('auth-callback-google')).toBe(true)
  })

  it('returns true for auth-callback-github', () => {
    expect(isPublicView('auth-callback-github')).toBe(true)
  })

  it('returns false for dashboard', () => {
    expect(isPublicView('dashboard')).toBe(false)
  })

  it('returns false for tasks', () => {
    expect(isPublicView('tasks')).toBe(false)
  })

  it('returns false for settings', () => {
    expect(isPublicView('settings')).toBe(false)
  })
})

describe('PUBLIC_VIEWS', () => {
  it('contains login view', () => {
    expect(PUBLIC_VIEWS).toContain('login')
  })

  it('contains register view', () => {
    expect(PUBLIC_VIEWS).toContain('register')
  })

  it('has exactly 5 public views', () => {
    expect(PUBLIC_VIEWS).toHaveLength(5)
  })
})
