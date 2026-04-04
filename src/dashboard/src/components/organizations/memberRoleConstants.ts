import { Shield, ShieldCheck, Eye, User } from 'lucide-react'
import type { MemberRole } from '../../stores/organizations'

export const roleIcons: Record<MemberRole, typeof Shield> = {
  owner: ShieldCheck,
  admin: Shield,
  member: User,
  viewer: Eye,
}

export const roleColors: Record<MemberRole, string> = {
  owner: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  admin: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  member: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  viewer: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
}

export const roleLabels: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}
