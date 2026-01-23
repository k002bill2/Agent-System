import { useEffect, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatInput } from './components/ChatInput'
import { ApprovalBanner } from './components/ApprovalModal'
import { CostBadge } from './components/CostMonitor'
import { useOrchestrationStore } from './stores/orchestration'
import { useNavigationStore, isPublicView } from './stores/navigation'
import { useAuthStore } from './stores/auth'
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
import { AuthCallbackPage } from './pages/AuthCallbackPage'
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

  // Handle OAuth callback URL detection on initial load
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/auth/callback/google') {
      setView('auth-callback-google')
    } else if (path === '/auth/callback/github') {
      setView('auth-callback-github')
    }
  }, [setView])

  // Get accessToken directly for dependency tracking
  const { accessToken, refreshToken } = useAuthStore()

  // Redirect to login if not authenticated (after hydration)
  useEffect(() => {
    // Skip redirect check for auth callback views (they handle their own flow)
    // Check both currentView state AND URL path to handle initial load race condition
    const path = window.location.pathname
    const isAuthCallbackPath = path === '/auth/callback/google' || path === '/auth/callback/github'
    const isAuthCallbackView = currentView === 'auth-callback-google' || currentView === 'auth-callback-github'

    if (isAuthCallbackPath || isAuthCallbackView) {
      return
    }
    if (authHydrated && !accessToken && !refreshToken && !isPublicView(currentView)) {
      setView('login')
    }
  }, [authHydrated, accessToken, refreshToken, currentView, setView])

  // Fetch current user on mount if authenticated but no user data
  useEffect(() => {
    if (authHydrated && (accessToken || refreshToken) && !user) {
      fetchCurrentUser()
    }
  }, [authHydrated, accessToken, refreshToken, user, fetchCurrentUser])

  // Check if authenticated
  const isLoggedIn = !!(accessToken || refreshToken)

  // Debug logging
  console.log('[App] Auth state:', {
    authHydrated,
    currentView,
    isLoggedIn,
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    hasUser: !!user
  })

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
      console.log('[App] Session lost after reconnect, creating new session')
      connect()
    }
  }, [orchestrationHydrated, authHydrated, isLoggedIn, sessionId, connected, connectionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading while hydrating
  if (!authHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Handle public views (login, OAuth callbacks)
  if (currentView === 'login') {
    return <LoginPage />
  }

  if (currentView === 'auth-callback-google') {
    return <AuthCallbackPage provider="google" />
  }

  if (currentView === 'auth-callback-github') {
    return <AuthCallbackPage provider="github" />
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    return <LoginPage />
  }

  const renderContent = () => {
    if (isInitialLoading) {
      return renderSkeletonContent()
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
