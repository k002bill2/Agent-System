import { useState } from 'react'
import { MoreVertical, Shield, ShieldCheck, Eye, User, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OrganizationMember, MemberRole } from '../../stores/organizations'

interface MemberCardProps {
  member: OrganizationMember
  currentUserId: string
  canManage: boolean
  onUpdateRole: (role: MemberRole) => void
  onRemove: () => void
}

const roleIcons: Record<MemberRole, typeof Shield> = {
  owner: ShieldCheck,
  admin: Shield,
  member: User,
  viewer: Eye,
}

const roleColors: Record<MemberRole, string> = {
  owner: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  admin: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  member: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  viewer: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
}

const roleLabels: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

export function MemberCard({
  member,
  currentUserId,
  canManage,
  onUpdateRole,
  onRemove,
}: MemberCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const isCurrentUser = member.user_id === currentUserId
  const RoleIcon = roleIcons[member.role]

  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {(member.name || member.email).charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {member.name || member.email}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-gray-500 dark:text-gray-400">(You)</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full',
            roleColors[member.role]
          )}
        >
          <RoleIcon className="w-3.5 h-3.5" />
          {roleLabels[member.role]}
        </span>

        {canManage && !isCurrentUser && member.role !== 'owner' && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-8 z-20 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Change Role
                  </div>
                  {(['admin', 'member', 'viewer'] as MemberRole[]).map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        setShowMenu(false)
                        if (role !== member.role) {
                          onUpdateRole(role)
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
                        role === member.role
                          ? 'text-primary-600 dark:text-primary-400 font-medium'
                          : 'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      {React.createElement(roleIcons[role], { className: 'w-4 h-4' })}
                      {roleLabels[role]}
                    </button>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        onRemove()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Need to import React for createElement
import React from 'react'
