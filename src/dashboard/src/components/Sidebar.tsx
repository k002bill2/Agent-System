import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  Users,
  Settings,
  Activity,
  FolderKanban,
  Monitor,
  Code2,
  FolderCog,
  Database,
  LogOut,
  FileText,
  Bell,
  BarChart3,
  FlaskConical,
  GitBranch,
  Building2,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore, ViewType } from '../stores/navigation'
import { useAuthStore } from '../stores/auth'
import { useMenuVisibilityStore } from '../stores/menuVisibility'
import { MENU_LABELS } from './admin/types'

// 아이콘 매핑 (메뉴명은 MENU_LABELS에서 가져옴)
const navigation: { icon: typeof LayoutDashboard; view: ViewType }[] = [
  { icon: LayoutDashboard, view: 'dashboard' },
  { icon: FolderKanban, view: 'projects' },
  { icon: Activity, view: 'sessions' },
  { icon: Users, view: 'agents' },
  { icon: Monitor, view: 'monitor' },
  { icon: Code2, view: 'claude-sessions' },
  { icon: FolderCog, view: 'project-configs' },
  { icon: Database, view: 'project-management' },
  { icon: GitBranch, view: 'git' },
  { icon: Building2, view: 'organizations' },
  { icon: FileText, view: 'audit' },
  { icon: Bell, view: 'notifications' },
  { icon: BarChart3, view: 'analytics' },
  { icon: FlaskConical, view: 'playground' },
  { icon: GitBranch, view: 'workflows' },
  { icon: Wallet, view: 'external-usage' },
]

export function Sidebar() {
  const fetchProjects = useOrchestrationStore(s => s.fetchProjects)
  const currentView = useNavigationStore(s => s.currentView)
  const setView = useNavigationStore(s => s.setView)
  const user = useAuthStore(s => s.user)
  const visibility = useMenuVisibilityStore(s => s.visibility)
  const menuOrder = useMenuVisibilityStore(s => s.menuOrder)
  const fetchVisibility = useMenuVisibilityStore(s => s.fetchVisibility)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // 사용자 변경 시 메뉴 가시성 재로딩 (다른 계정으로 전환 시 stale data 방지)
  useEffect(() => {
    if (user?.id) {
      useMenuVisibilityStore.setState({ isLoaded: false })
      fetchVisibility()
    }
  }, [user?.id, fetchVisibility])

  const userRole = user?.role || (user?.is_admin ? 'admin' : 'user')

  // 역할 기반 메뉴 필터링 + 순서 적용
  const filteredNavigation = useMemo(() => {
    // menuOrder가 있으면 해당 순서로 정렬
    let sorted = navigation
    if (menuOrder.length > 0) {
      sorted = [...navigation].sort((a, b) => {
        const aIdx = menuOrder.indexOf(a.view)
        const bIdx = menuOrder.indexOf(b.view)
        // menuOrder에 없는 항목은 뒤로
        const aOrder = aIdx === -1 ? 999 : aIdx
        const bOrder = bIdx === -1 ? 999 : bIdx
        return aOrder - bOrder
      })
    }

    if (userRole === 'admin') return sorted // admin은 모든 메뉴 접근 가능

    return sorted.filter((item) => {
      const menuVisibility = visibility[item.view]
      if (!menuVisibility) return true // 설정 없으면 기본 표시
      return menuVisibility[userRole] !== false
    })
  }, [visibility, menuOrder, userRole])

  // Admin 메뉴 표시 여부
  const showAdmin = userRole === 'admin' || (visibility['admin']?.[userRole] ?? false)

  // Settings 메뉴 표시 여부
  const showSettings = userRole === 'admin' || (visibility['settings']?.[userRole] ?? true)

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
        {filteredNavigation.map((item) => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              currentView === item.view
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            <item.icon className="w-5 h-5" />
            {MENU_LABELS[item.view] || item.view}
          </button>
        ))}
      </nav>

      {/* Settings and User Section */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {showAdmin && (
          <button
            onClick={() => setView('admin')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              currentView === 'admin'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            Admin
          </button>
        )}
        {showSettings && (
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
        )}

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
  const logout = useAuthStore(s => s.logout)
  const setView = useNavigationStore(s => s.setView)

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
  const logout = useAuthStore(s => s.logout)
  const setView = useNavigationStore(s => s.setView)

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
            {(user.name || user.email || '?').charAt(0).toUpperCase()}
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
