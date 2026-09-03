import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatInput } from './components/ChatInput'
import { ApprovalBanner } from './components/ApprovalModal'
import { CostBadge } from './components/CostMonitor'
import { HealthBadge } from './components/HealthBadge'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useOrchestrationStore } from './stores/orchestration'
import { useNavigationStore, isPublicView } from './stores/navigation'
import { useAuthStore, getAuthSessionKey } from './stores/auth'
import { useProjectsStore } from './stores/projects'
import { useMenuVisibilityStore } from './stores/menuVisibility'
import { useSettingsStore } from './stores/settings'
import { routes } from './routes'
import { analytics } from './services/analytics'
import { fetchBootstrap } from './services/bootstrap'
import { apiClient } from '@/services/apiClient'
import {
  SidebarSkeleton,
  DashboardSkeleton,
} from './components/skeletons'
import { Skeleton } from './components/ui/Skeleton'
import { RotateCcw, Trash2 } from 'lucide-react'

// AuthCallbackPage is eager-loaded because its provider prop is required.
import { AuthCallbackPage } from './pages/AuthCallbackPage'

const getPublicPage = (view: string): ComponentType => {
  const route = routes.find((candidate) => candidate.view === view && candidate.isPublic)
  if (!route) throw new Error(`Missing public route: ${view}`)
  return route.element as ComponentType
}

const LoginPage = getPublicPage('login')
const RegisterPage = getPublicPage('register')
const InvitationAcceptPage = getPublicPage('invitation-accept')

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  sessions: 'Sessions',
  agents: 'Agents',
  monitor: 'Monitor',
  'claude-sessions': 'Agent Sessions',
  'project-configs': 'Project Configs',
  'project-management': 'Project Registry',
  git: 'Git Management',
  organizations: 'Organizations',
  audit: 'Audit Trail',
  notifications: 'Notifications',
  analytics: 'Analytics',
  playground: 'Agent Playground',
  workflows: 'Workflows',
  'external-usage': 'External Usage',
  admin: 'Admin',
  settings: 'Settings',
}

export default function App() {
  const {
    connect,
    disconnect,
    reconnect,
    clearSession,
    sessionId,
    isInitialLoading,
    connected,
    connectionStatus,
    _hasHydrated: orchestrationHydrated,
  } = useOrchestrationStore()
  const {
    visibility,
    isLoaded: menuLoaded,
    isFallback,
  } = useMenuVisibilityStore()
  const { currentView, setView } = useNavigationStore()
  const {
    _hasHydrated: authHydrated,
    user,
  } = useAuthStore()

  // Track if we've initialized connection
  const hasInitialized = useRef(false)

  // Auth configuration state
  const [authStatus, setAuthStatus] = useState<{
    oauth_enabled: boolean
    google_enabled: boolean
    github_enabled: boolean
    email_enabled: boolean
  } | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  // Derived values
  const oauthEnabled = authStatus?.oauth_enabled ?? null
  const emailEnabled = authStatus?.email_enabled ?? true
  const anyAuthAvailable = oauthEnabled === true || emailEnabled

  // PostHog 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    analytics.init()
  }, [])

  // Keep the legacy public model lookup for installations with auth disabled.
  useEffect(() => {
    if (authStatus === null || anyAuthAvailable) return
    const { availableModels, modelsLoading, fetchModels } = useSettingsStore.getState()
    if (availableModels.length === 0 && !modelsLoading) void fetchModels()
    if (!useMenuVisibilityStore.getState().isLoaded) {
      void useMenuVisibilityStore.getState().fetchVisibility()
    }
  }, [authStatus, anyAuthAvailable])

  // 페이지뷰 추적
  useEffect(() => {
    analytics.page(currentView)
  }, [currentView])

  // Check auth configuration on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setAuthStatus(await apiClient.get('/api/auth/status'))
      } catch {
        setAuthStatus({ oauth_enabled: false, google_enabled: false, github_enabled: false, email_enabled: true })
      }
    }
    checkAuthStatus()
  }, [])

  // Get accessToken directly for dependency tracking
  const { accessToken, refreshToken } = useAuthStore()

  // Redirect to login if not authenticated (after hydration)
  useEffect(() => {
    const isAuthCallbackView = currentView === 'auth-callback-google' || currentView === 'auth-callback-github'
    const isInvitationView = currentView === 'invitation-accept'

    if (isAuthCallbackView || isInvitationView) return
    if (!anyAuthAvailable) return

    if (authHydrated && !accessToken && !refreshToken && !isPublicView(currentView)) {
      setView('login')
    }
  }, [authHydrated, accessToken, refreshToken, currentView, setView, anyAuthAvailable])

  const bootstrapGeneration = useRef(0)
  const sessionKeyRef = useRef<string | null>(null)
  const sessionKey = getAuthSessionKey()

  // Reset user-scoped startup state whenever the authenticated session changes.
  // This runs before the bootstrap effect below, so no response can cross users.
  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) return
    sessionKeyRef.current = sessionKey
    bootstrapGeneration.current += 1
    useAuthStore.setState({ user: null, error: null })
    useProjectsStore.getState().reset()
    useSettingsStore.getState().resetModels()
    useMenuVisibilityStore.getState().reset()
  }, [sessionKey])

  // Load authenticated startup data in one request, then seed existing stores.
  useEffect(() => {
    if (!authHydrated || !sessionKey) return

    const generation = ++bootstrapGeneration.current
    setBootstrapLoading(true)
    fetchBootstrap(sessionKey)
      .then((payload) => {
        if (generation !== bootstrapGeneration.current || getAuthSessionKey() !== sessionKey) return

        useAuthStore.getState().hydrateUser(payload.user)
        useProjectsStore.getState().hydrateProjects(payload.projects)
        useSettingsStore.getState().hydrateModels(payload.models)
        if (payload.menu) {
          useMenuVisibilityStore.getState().hydrateVisibility(payload.menu)
        } else {
          void useMenuVisibilityStore.getState().fetchVisibility()
        }
        setBootstrapError(null)
      })
      .catch((error: unknown) => {
        if (generation !== bootstrapGeneration.current || getAuthSessionKey() !== sessionKey) return

        const message = error instanceof Error ? error.message : 'Failed to load startup data'
        setBootstrapError(message)
        // Preserve the previous startup behavior if the aggregate request fails.
        void Promise.all([
          useAuthStore.getState().fetchCurrentUser(),
          useProjectsStore.getState().fetchProjects(),
          useSettingsStore.getState().fetchModels(),
          useMenuVisibilityStore.getState().fetchVisibility(),
        ]).catch(() => undefined)
      })
      .finally(() => {
        if (generation === bootstrapGeneration.current && getAuthSessionKey() === sessionKey) {
          setBootstrapLoading(false)
        }
      })
  }, [authHydrated, sessionKey])

  // Check if authenticated (or if no auth method available, skip auth check)
  const isLoggedIn = !anyAuthAvailable || !!(accessToken || refreshToken)

  // Auto-reconnect on page load if session exists (only for authenticated users)
  useEffect(() => {
    const initSession = async () => {
      if (orchestrationHydrated && authHydrated && isLoggedIn && !hasInitialized.current) {
        hasInitialized.current = true
        if (sessionId && !connected) {
          reconnect()
        } else if (!sessionId) {
          connect()
        }
      }
    }
    initSession()
    return () => {
      if (hasInitialized.current) {
        disconnect()
      }
    }
  }, [orchestrationHydrated, authHydrated, isLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // If reconnect failed and no session, create new one
  useEffect(() => {
    const shouldCreateNewSession =
      orchestrationHydrated &&
      authHydrated &&
      isLoggedIn &&
      hasInitialized.current &&
      !sessionId &&
      !connected &&
      connectionStatus === 'disconnected'

    if (shouldCreateNewSession) {
      connect()
    }
  }, [orchestrationHydrated, authHydrated, isLoggedIn, sessionId, connected, connectionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading while hydrating, checking auth, or loading the first user payload.
  if (!authHydrated || authStatus === null || (isLoggedIn && bootstrapLoading && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Handle public views (login, register, OAuth callbacks)
  if (currentView === 'login' || currentView === 'register') {
    if (!anyAuthAvailable) {
      setView('dashboard')
      return null
    }
    return currentView === 'login' ? <LoginPage /> : <RegisterPage />
  }

  if (currentView === 'auth-callback-google') {
    return <AuthCallbackPage provider="google" />
  }

  if (currentView === 'auth-callback-github') {
    return <AuthCallbackPage provider="github" />
  }

  if (currentView === 'invitation-accept') {
    return <InvitationAcceptPage />
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    return <LoginPage />
  }

  // --- Render route content ---
  const renderContent = () => {
    if (isInitialLoading) {
      return <DashboardSkeleton />
    }

    // 역할 기반 접근 제어
    const userRole = user?.role || (user?.is_admin ? 'admin' : 'user')
    if (anyAuthAvailable && userRole !== 'admin' && currentView !== 'dashboard' && (!menuLoaded || isFallback)) {
      setView('dashboard')
      return null
    }
    if (
      userRole !== 'admin' &&
      currentView !== 'dashboard' &&
      visibility[currentView]
    ) {
      const allowed = visibility[currentView][userRole]
      if (allowed === false) {
        setView('dashboard')
        return null
      }
    }

    // Find matching route and render its lazy component
    const route = routes.find((r) => r.view === currentView && !r.isPublic)
    if (route) {
      const PageComponent = route.element
      return <PageComponent />
    }

    // Fallback: dashboard
    const dashboardRoute = routes.find((r) => r.view === 'dashboard')
    if (dashboardRoute) {
      const DashboardComponent = dashboardRoute.element
      return <DashboardComponent />
    }

    return null
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        {isInitialLoading ? <SidebarSkeleton /> : <Sidebar />}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-6">
            {isInitialLoading ? (
              <>
                <Skeleton className="h-6 w-32" />
                <div className="ml-auto flex items-center gap-4">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="w-2 h-2 rounded-full" />
                </div>
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {viewTitles[currentView] || 'Agent Orchestration Service'}
                </h1>
                <div className="ml-auto flex items-center gap-4">
                  <HealthBadge />
                  <CostBadge />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Session: {sessionId ? sessionId.slice(0, 8) : 'Not connected'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : sessionId ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                  {/* Session control buttons */}
                  {sessionId && !connected && (
                    <button
                      onClick={() => reconnect()}
                      className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="세션 재연결"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {sessionId && (
                    <button
                      onClick={() => {
                        if (confirm('현재 세션의 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) {
                          clearSession()
                          connect()
                        }
                      }}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="세션 초기화"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </header>

          {/* HITL Approval Banner */}
          {!isInitialLoading && <ApprovalBanner />}
          {bootstrapError && (
            <div role="alert" className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Startup data could not be loaded in one request. Using individual requests instead.
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {renderContent()}
          </div>

          {/* Chat Input - only show on dashboard, tasks, and activity views */}
          {!isInitialLoading && ['dashboard', 'sessions'].includes(currentView) && <ChatInput />}
        </div>
      </div>
    </ErrorBoundary>
  )
}
