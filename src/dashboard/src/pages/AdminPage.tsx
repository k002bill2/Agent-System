import { useState } from 'react'
import { Users, ShieldOff, Server, Menu, FolderTree } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import {
  UserManagementTab,
  MenuSettingsTab,
  SystemInfoTab,
  ExternalSourcesTab,
} from '../components/admin'
import type { AdminTab } from '../components/admin'

export function AdminPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  const isAdmin = user?.role === 'admin' || user?.is_admin

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ShieldOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            접근 권한 없음
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            최고관리자 권한이 필요합니다.
          </p>
        </div>
      </div>
    )
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'menu-settings', label: 'Menu Settings', icon: Menu },
    { id: 'system', label: 'System', icon: Server },
    { id: 'external-sources', label: 'External Sources', icon: FolderTree },
  ]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserManagementTab currentUserId={user.id} />}
      {activeTab === 'menu-settings' && <MenuSettingsTab />}
      {activeTab === 'system' && <SystemInfoTab />}
      {activeTab === 'external-sources' && <ExternalSourcesTab />}
    </div>
  )
}
