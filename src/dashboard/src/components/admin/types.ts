import type { UserRole } from '../../stores/auth'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  oauth_provider: string | null
  is_active: boolean
  is_admin: boolean
  role: UserRole
  created_at: string | null
  last_login_at: string | null
}

export interface UserListResponse {
  users: AdminUser[]
  total: number
}

export interface SystemInfo {
  version: string
  user_count: number
  active_user_count: number
  admin_count: number
  role_distribution?: {
    user: number
    manager: number
    admin: number
  }
  recent_signups?: Array<{ id: string; name: string | null; email: string; created_at: string }>
  recent_logins?: Array<{ id: string; name: string | null; email: string; last_login_at: string }>
}

export type MenuVisibility = Record<string, Record<string, boolean>>

export type AdminTab = 'users' | 'menu-settings' | 'system'

export const API_BASE = import.meta.env.VITE_API_URL || '/api'

export const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반',
  manager: '관리자',
  admin: '최고관리자',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  user: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  admin: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

export const MENU_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tasks: 'Tasks',
  agents: 'Task Analyzer',
  activity: 'Activity',
  monitor: 'Monitor',
  'claude-sessions': 'Claude Sessions',
  'project-configs': 'Project Configs',
  'project-management': 'Project Registry',
  git: 'Git',
  organizations: 'Organizations',
  audit: 'Audit Trail',
  notifications: 'Notifications',
  analytics: 'Analytics',
  playground: 'Playground',
  workflows: 'Workflows',
  'external-usage': 'External Usage',
  settings: 'Settings',
  admin: 'Admin',
}

// Menu categories for grouped display
export const MENU_CATEGORIES: { label: string; keys: string[] }[] = [
  {
    label: 'Core',
    keys: ['dashboard', 'projects', 'tasks'],
  },
  {
    label: 'Development',
    keys: ['agents', 'activity', 'playground'],
  },
  {
    label: 'Operations',
    keys: ['monitor', 'claude-sessions', 'project-configs', 'project-management', 'git', 'workflows'],
  },
  {
    label: 'Organization',
    keys: ['organizations', 'notifications'],
  },
  {
    label: 'Analytics & Admin',
    keys: ['audit', 'analytics', 'external-usage', 'settings', 'admin'],
  },
]
