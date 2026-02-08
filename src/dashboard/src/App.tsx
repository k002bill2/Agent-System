import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatInput } from './components/ChatInput'
import { ApprovalBanner } from './components/ApprovalModal'
import { CostBadge } from './components/CostMonitor'
import { useOrchestrationStore } from './stores/orchestration'
import { useNavigationStore, isPublicView } from './stores/navigation'
import { useAuthStore } from './stores/auth'
import { useMenuVisibilityStore } from './stores/menuVisibility'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TasksPage } from './pages/TasksPage'
import { AgentsPage } from './pages/AgentsPage'
import { ActivityPage } from './pages/ActivityPage'
import { MonitorPage } from './pages/MonitorPage'
import { SettingsPage } from './pages/SettingsPage'
import { ClaudeSessionsPage } from './pages/ClaudeSessionsPage'
import { ProjectConfigsPage } from './pages/ProjectConfigsPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AuditPage } from './pages/AuditPage'
import { GitPage } from './pages/GitPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { AdminPage } from './pages/AdminPage'
import { InvitationAcceptPage } from './pages/InvitationAcceptPage'
import {
  SidebarSkeleton,
  DashboardSkeleton,
  ProjectsSkeleton,
  TasksSkeleton,
  AgentsSkeleton,
  ActivitySkeleton,
  MonitorSkeleton,
  SettingsSkeleton,
  ClaudeSessionsSkeleton,
} from './components/skeletons'
import { Skeleton } from './components/ui/Skeleton'
import { RotateCcw, Trash2 } from 'lucide-react'

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tasks: 'Tasks',
  agents: 'Agents',
  activity: 'Activity',
  monitor: 'Monitor',
  'claude-sessions': 'Claude Sessions',
  'project-configs': 'Project Configs',
  git: 'Git Management',
  organizations: 'Organizations',
  audit: 'Audit Trail',
  notifications: 'Notifications',
  analytics: 'Analytics',
  playground: 'Agent Playground',
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
  // Email auth is always available (frontend form + backend endpoints exist)
  const emailEnabled = authStatus?.email_enabled ?? true
  const anyAuthAvailable = oauthEnabled === true || emailEnabled

  // Check auth configuration on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
        const response = await fetch(`${API_BASE_URL}/auth/status`)
        if (response.ok) {
          const data = await response.json()
          setAuthStatus(data)
          // Auth status loaded
        } else {
          // If endpoint doesn't exist, assume no auth configured
          setAuthStatus({ oauth_enabled: false, google_enabled: false, github_enabled: false, email_enabled: true })
        }
      } catch {
        // Auth status check failed, assuming email-only
        setAuthStatus({ oauth_enabled: false, google_enabled: false, github_enabled: false, email_enabled: true })
      }
    }
    checkAuthStatus()
  }, [])

  // Handle special URL paths on initial load
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/auth/callback/google') {
      setView('auth-callback-google')
    } else if (path === '/auth/callback/github') {
      setView('auth-callback-github')
    } else if (path === '/invitations/accept') {
      setView('invitation-accept')
    }
  }, [setView])

  // Get accessToken directly for dependency tracking
  const { accessToken, refreshToken } = useAuthStore()

  // Redirect to login if not authenticated (after hydration)
  // Skip login if OAuth is not configured
  useEffect(() => {
    // Skip redirect check for special views (they handle their own flow)
    // Check both currentView state AND URL path to handle initial load race condition
    const path = window.location.pathname
    const isAuthCallbackPath = path === '/auth/callback/google' || path === '/auth/callback/github'
    const isAuthCallbackView = currentView === 'auth-callback-google' || currentView === 'auth-callback-github'
    const isInvitationPath = path === '/invitations/accept'
    const isInvitationView = currentView === 'invitation-accept'

    if (isAuthCallbackPath || isAuthCallbackView || isInvitationPath || isInvitationView) {
      return
    }

    // Skip login redirect if no auth method is configured
    if (!anyAuthAvailable) {
      return
    }

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
          // Existing session found, try to reconnect
          reconnect()
        } else if (!sessionId) {
          // No session, create new one
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

  // If reconnect failed and no session, create new one (avoid infinite loop by checking connectionStatus)
  useEffect(() => {
    const shouldCreateNewSession =
      orchestrationHydrated &&
      authHydrated &&
      isLoggedIn &&
      hasInitialized.current &&
      !sessionId &&
      !connected &&
      connectionStatus === 'disconnected' // Only when fully disconnected, not during connecting/reconnecting

    if (shouldCreateNewSession) {
      // Session lost after reconnect, creating new session
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
  // If no auth method is available, skip login/register and go to dashboard
  if (currentView === 'login' || currentView === 'register') {
    if (!anyAuthAvailable) {
      // No auth available, redirect to dashboard
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

  const renderContent = () => {
    if (isInitialLoading) {
      return renderSkeletonContent()
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
        // 권한 없는 메뉴 접근 시 Dashboard로 리다이렉트
        setView('dashboard')
        return <DashboardPage />
      }
    }

    switch (currentView) {
      case 'dashboard':
        return <DashboardPage />
      case 'projects':
        return <ProjectsPage />
      case 'tasks':
        return <TasksPage />
      case 'agents':
        return <AgentsPage />
      case 'activity':
        return <ActivityPage />
      case 'monitor':
        return <MonitorPage />
      case 'claude-sessions':
        return <ClaudeSessionsPage />
      case 'project-configs':
        return <ProjectConfigsPage />
      case 'git':
        return <GitPage />
      case 'organizations':
        return <OrganizationsPage />
      case 'audit':
        return <AuditPage />
      case 'notifications':
        return <NotificationsPage />
      case 'analytics':
        return <AnalyticsPage />
      case 'playground':
        return <PlaygroundPage />
      case 'admin':
        return <AdminPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <DashboardPage />
    }
  }

  const renderSkeletonContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardSkeleton />
      case 'projects':
        return <ProjectsSkeleton />
      case 'tasks':
        return <TasksSkeleton />
      case 'agents':
        return <AgentsSkeleton />
      case 'activity':
        return <ActivitySkeleton />
      case 'monitor':
        return <MonitorSkeleton />
      case 'claude-sessions':
        return <ClaudeSessionsSkeleton />
      case 'project-configs':
        return <MonitorSkeleton />
      case 'git':
        return <MonitorSkeleton />
      case 'organizations':
        return <MonitorSkeleton />
      case 'audit':
        return <MonitorSkeleton />
      case 'notifications':
        return <SettingsSkeleton />
      case 'analytics':
        return <MonitorSkeleton />
      case 'playground':
        return <MonitorSkeleton />
      case 'admin':
        return <MonitorSkeleton />
      case 'settings':
        return <SettingsSkeleton />
      default:
        return <DashboardSkeleton />
    }
  }

  return (
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
        {!isInitialLoading && ['dashboard', 'tasks', 'activity'].includes(currentView) && <ChatInput />}
      </div>
    </div>
  )
}
