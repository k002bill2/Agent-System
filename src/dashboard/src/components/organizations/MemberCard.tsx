import { memo, useState } from 'react'
import { MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { roleIcons, roleColors, roleLabels } from './memberRoleConstants'
import type { OrganizationMember, MemberRole } from '../../stores/organizations'

interface MemberCardProps {
  /** 멤버 정보 */
  member: OrganizationMember
  /** 현재 로그인한 사용자 ID */
  currentUserId: string
  /** 역할 변경/제거 권한 여부 */
  canManage: boolean
  /** 카드 클릭 핸들러 */
  onClick?: () => void
  /** 역할 변경 */
  onUpdateRole: (role: MemberRole) => void
  /** 멤버 제거 */
  onRemove: () => void
}

export const MemberCard = memo(function MemberCard({
  member,
  currentUserId,
  canManage,
  onClick,
  onUpdateRole,
  onRemove,
}: MemberCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const isCurrentUser = member.user_id === currentUserId
  const RoleIcon = roleIcons[member.role]

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg',
        onClick && 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors'
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View details for ${member.name || member.email}` : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
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
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Member actions menu"
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
                      {(() => { const Icon = roleIcons[role]; return <Icon className="w-4 h-4" /> })()}
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
})

MemberCard.displayName = 'MemberCard'
