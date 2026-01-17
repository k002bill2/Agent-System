import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  ListTodo,
  Users,
  Settings,
  Activity,
  FolderKanban,
  Monitor,
} from 'lucide-react'
import { useEffect } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore, ViewType } from '../stores/navigation'

const navigation: { name: string; icon: typeof LayoutDashboard; view: ViewType }[] = [
  { name: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { name: 'Projects', icon: FolderKanban, view: 'projects' },
  { name: 'Tasks', icon: ListTodo, view: 'tasks' },
  { name: 'Agents', icon: Users, view: 'agents' },
  { name: 'Activity', icon: Activity, view: 'activity' },
  { name: 'Monitor', icon: Monitor, view: 'monitor' },
]

export function Sidebar() {
  const { fetchProjects } = useOrchestrationStore()
  const { currentView, setView } = useNavigationStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AO</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            Orchestrator
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

      {/* Settings */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
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
      </div>
    </aside>
  )
}
