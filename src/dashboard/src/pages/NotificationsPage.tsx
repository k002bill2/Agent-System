/**
 * Notifications Page
 * Configure notification rules and channel settings
 */

import { Bell } from 'lucide-react'
import { NotificationRuleEditor } from '../components/notifications'

export function NotificationsPage() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Notification Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Configure notification channels and rules for alerts
        </p>
      </div>

      {/* Notification Rule Editor */}
      <NotificationRuleEditor />
    </div>
  )
}

export default NotificationsPage
