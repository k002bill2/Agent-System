import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatInput } from './components/ChatInput'
import { ApprovalBanner } from './components/ApprovalModal'
import { CostBadge } from './components/CostMonitor'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useOrchestrationStore } from './stores/orchestration'
import { useNavigationStore, isPublicView } from './stores/navigation'
import { useAuthStore } from './stores/auth'
import { useMenuVisibilityStore } from './stores/menuVisibility'
import { routes } from './routes'
import { analytics } from './services/analytics'
import {
  SidebarSkeleton,
  DashboardSkeleton,
} from './components/skeletons'
import { Skeleton } from './components/ui/Skeleton'
import { RotateCcw, Trash2 } from 'lucide-react'

// Eager-load login/register (needed before auth check)
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { InvitationAcceptPage } from './pages/InvitationAcceptPage'

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  sessions: 'Sessions',
  agents: 'Agents',
  monitor: 'Monitor',
  'claude-sessions': 'Claude Sessions',
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
  const { currentView, setView } = useNavigationStore()
  const {
    _hasHydrated: authHydrated,
    fetchCurrentUser,
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

  // Derived values
  const oauthEnabled = authStatus?.oauth_enabled ?? null
  const emailEnabled = authStatus?.email_enabled ?? true
  const anyAuthAvailable = oauthEnabled === true || emailEnabled

  // PostHog 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    analytics.init()
  }, [])

  // 페이지뷰 추적
  useEffect(() => {
    analytics.page(currentView)
  }, [currentView])

  // Check auth configuration on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
        const response = await fetch(`${API_BASE_URL}/auth/status`)
        if (response.ok) {
          const data = await response.json()
          setAuthStatus(data)
        } else {
          setAuthStatus({ oauth_enabled: false, google_enabled: false, github_enabled: false, email_enabled: true })
        }
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

  // Fetch current user on mount if authenticated but no user data
  useEffect(() => {
    if (authHydrated && (accessToken || refreshToken) && !user) {
      fetchCurrentUser()
    }
  }, [authHydrated, accessToken, refreshToken, user, fetchCurrentUser])

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

  // Show loading while hydrating or checking auth status
  if (!authHydrated || authStatus === null) {
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
    const { visibility } = useMenuVisibilityStore.getState()
    const userRole = user?.role || (user?.is_admin ? 'admin' : 'user')
    if (
      userRole !== 'admin' &&
      currentView !== 'dashboard' &&
      currentView !== 'settings' &&
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
