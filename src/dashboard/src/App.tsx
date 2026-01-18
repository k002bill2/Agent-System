import { useEffect, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatInput } from './components/ChatInput'
import { ApprovalBanner } from './components/ApprovalModal'
import { CostBadge } from './components/CostMonitor'
import { useOrchestrationStore } from './stores/orchestration'
import { useNavigationStore } from './stores/navigation'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TasksPage } from './pages/TasksPage'
import { AgentsPage } from './pages/AgentsPage'
import { ActivityPage } from './pages/ActivityPage'
import { MonitorPage } from './pages/MonitorPage'
import { SettingsPage } from './pages/SettingsPage'
import { ClaudeSessionsPage } from './pages/ClaudeSessionsPage'
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
    _hasHydrated,
  } = useOrchestrationStore()
  const { currentView } = useNavigationStore()

  // Track if we've initialized connection
  const hasInitialized = useRef(false)

  // Auto-reconnect on page load if session exists
  useEffect(() => {
    if (_hasHydrated && !hasInitialized.current) {
      hasInitialized.current = true
      if (sessionId && !connected) {
        // Existing session found, try to reconnect
        reconnect()
      } else if (!sessionId) {
        // No session, create new one
        connect()
      }
    }
    return () => {
      if (hasInitialized.current) {
        disconnect()
      }
    }
  }, [_hasHydrated]) // eslint-disable-line react-hooks/exhaustive-deps

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
