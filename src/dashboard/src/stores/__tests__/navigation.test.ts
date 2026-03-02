import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useNavigationStore, isPublicView, PUBLIC_VIEWS } from '../navigation'

describe('navigation store', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset store to default state
    useNavigationStore.setState({
      currentView: 'dashboard',
      projectFilter: null,
      pendingTaskInput: null,
    })

    // Spy on pushState so we can assert whether it was called
    pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})

    // Default pathname to '/'
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/' },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

    it('has default pendingTaskInput as null', () => {
      const state = useNavigationStore.getState()
      expect(state.pendingTaskInput).toBeNull()
    })
  })

  describe('setView', () => {
    it('updates currentView', () => {
      const { setView } = useNavigationStore.getState()

      setView('sessions')
      expect(useNavigationStore.getState().currentView).toBe('sessions')

      setView('agents')
      expect(useNavigationStore.getState().currentView).toBe('agents')
    })

    it('can set to login view', () => {
      const { setView } = useNavigationStore.getState()
      setView('login')
      expect(useNavigationStore.getState().currentView).toBe('login')
    })

    it('calls pushState when navigating to a different path', () => {
      // Current pathname is '/' (dashboard), navigate to sessions → '/sessions'
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      })

      const { setView } = useNavigationStore.getState()
      setView('sessions')

      expect(pushStateSpy).toHaveBeenCalledWith({ view: 'sessions' }, '', '/sessions')
    })

    it('does NOT call pushState when path is already the same', () => {
      // Set pathname to '/sessions' so navigating to sessions is a no-op for history
      Object.defineProperty(window, 'location', {
        value: { pathname: '/sessions' },
        writable: true,
        configurable: true,
      })

      const { setView } = useNavigationStore.getState()
      setView('sessions')

      expect(pushStateSpy).not.toHaveBeenCalled()
      // But currentView should still be updated
      expect(useNavigationStore.getState().currentView).toBe('sessions')
    })

    it('maps dashboard view to "/" path via pushState', () => {
      // Start from a non-root path so pushState is triggered
      Object.defineProperty(window, 'location', {
        value: { pathname: '/sessions' },
        writable: true,
        configurable: true,
      })

      const { setView } = useNavigationStore.getState()
      setView('dashboard')

      expect(pushStateSpy).toHaveBeenCalledWith({ view: 'dashboard' }, '', '/')
    })

    it('maps non-dashboard views to "/<view>" path via pushState', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      })

      const { setView } = useNavigationStore.getState()
      setView('agents')

      expect(pushStateSpy).toHaveBeenCalledWith({ view: 'agents' }, '', '/agents')
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

  describe('setPendingTaskInput', () => {
    it('sets pending task input to a string value', () => {
      const { setPendingTaskInput } = useNavigationStore.getState()

      setPendingTaskInput('Build me a landing page')
      expect(useNavigationStore.getState().pendingTaskInput).toBe('Build me a landing page')
    })

    it('clears pending task input when set to null', () => {
      const { setPendingTaskInput } = useNavigationStore.getState()

      setPendingTaskInput('some input')
      setPendingTaskInput(null)
      expect(useNavigationStore.getState().pendingTaskInput).toBeNull()
    })

    it('overwrites previous pending task input', () => {
      const { setPendingTaskInput } = useNavigationStore.getState()

      setPendingTaskInput('first input')
      setPendingTaskInput('second input')
      expect(useNavigationStore.getState().pendingTaskInput).toBe('second input')
    })
  })

  describe('syncFromUrl', () => {
    it('syncs currentView to dashboard when pathname is "/"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.setState({ currentView: 'sessions' })
      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('dashboard')
    })

    it('syncs currentView to sessions when pathname is "/sessions"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/sessions' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('sessions')
    })

    it('syncs currentView to agents when pathname is "/agents"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/agents' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('agents')
    })

    it('syncs currentView to auth-callback-google when pathname is "/auth/callback/google"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/auth/callback/google' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('auth-callback-google')
    })

    it('syncs currentView to auth-callback-github when pathname is "/auth/callback/github"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/auth/callback/github' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('auth-callback-github')
    })

    it('syncs currentView to invitation-accept when pathname is "/invitations/accept"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/invitations/accept' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('invitation-accept')
    })

    it('strips leading slash for generic view paths', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/settings' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.getState().syncFromUrl()

      expect(useNavigationStore.getState().currentView).toBe('settings')
    })
  })

  describe('popstate event listener', () => {
    it('calls syncFromUrl when a popstate event fires', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/monitor' },
        writable: true,
        configurable: true,
      })

      window.dispatchEvent(new PopStateEvent('popstate'))

      expect(useNavigationStore.getState().currentView).toBe('monitor')
    })

    it('updates currentView to dashboard on popstate when pathname is "/"', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      })

      useNavigationStore.setState({ currentView: 'settings' })
      window.dispatchEvent(new PopStateEvent('popstate'))

      expect(useNavigationStore.getState().currentView).toBe('dashboard')
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

  it('returns true for invitation-accept', () => {
    expect(isPublicView('invitation-accept')).toBe(true)
  })

  it('returns false for dashboard', () => {
    expect(isPublicView('dashboard')).toBe(false)
  })

  it('returns false for sessions', () => {
    expect(isPublicView('sessions')).toBe(false)
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

  it('contains invitation-accept view', () => {
    expect(PUBLIC_VIEWS).toContain('invitation-accept')
  })

  it('has exactly 5 public views', () => {
    expect(PUBLIC_VIEWS).toHaveLength(5)
  })
})
