import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  ListTodo,
  Users,
  Settings,
  Activity,
  FolderKanban,
  Monitor,
  Code2,
  FolderCog,
  LogOut,
  FileText,
  Bell,
  BarChart3,
  FlaskConical,
  GitBranch,
  Building2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore, ViewType } from '../stores/navigation'
import { useAuthStore } from '../stores/auth'

const navigation: { name: string; icon: typeof LayoutDashboard; view: ViewType }[] = [
  { name: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { name: 'Projects', icon: FolderKanban, view: 'projects' },
  { name: 'Tasks', icon: ListTodo, view: 'tasks' },
  { name: 'Agents', icon: Users, view: 'agents' },
  { name: 'Activity', icon: Activity, view: 'activity' },
  { name: 'Monitor', icon: Monitor, view: 'monitor' },
  { name: 'Claude Sessions', icon: Code2, view: 'claude-sessions' },
  { name: 'Project Configs', icon: FolderCog, view: 'project-configs' },
  { name: 'Git', icon: GitBranch, view: 'git' },
  { name: 'Organizations', icon: Building2, view: 'organizations' },
  { name: 'Audit Trail', icon: FileText, view: 'audit' },
  { name: 'Notifications', icon: Bell, view: 'notifications' },
  { name: 'Analytics', icon: BarChart3, view: 'analytics' },
  { name: 'Playground', icon: FlaskConical, view: 'playground' },
]

export function Sidebar() {
  const { fetchProjects } = useOrchestrationStore()
  const { currentView, setView } = useNavigationStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AOS</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            Orchestration Service
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <button
            key={item.name}
            onClick={() => setView(item.view)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              currentView === item.view
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </button>
        ))}
      </nav>

      {/* Settings and User Section */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <button
          onClick={() => setView('settings')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            currentView === 'settings'
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          )}
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>

        {/* User Info + Logout */}
        {user ? (
          <UserAvatar user={user} />
        ) : (
          <LogoutButton />
        )}
      </div>
    </aside>
  )
}

function LogoutButton() {
  const { logout } = useAuthStore()
  const { setView } = useNavigationStore()

  const handleLogout = () => {
    logout()
    setView('login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-gray-700 transition-colors"
    >
      <LogOut className="w-5 h-5" />
      로그아웃
    </button>
  )
}

function UserAvatar({ user }: { user: { name: string | null; email: string; avatar_url?: string | null } }) {
  const [imageError, setImageError] = useState(false)
  const { logout } = useAuthStore()
  const { setView } = useNavigationStore()

  const handleLogout = () => {
    logout()
    setView('login')
  }

  const showFallback = !user.avatar_url || imageError

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-200 dark:border-gray-700 mt-2 pt-3">
      {!showFallback && user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.name || user.email}
          className="w-8 h-8 rounded-full"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <span className="text-primary-700 dark:text-primary-400 font-medium text-sm">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {user.name || user.email}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {user.email}
        </p>
      </div>
      <button
        onClick={handleLogout}
        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="Logout"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  )
}
