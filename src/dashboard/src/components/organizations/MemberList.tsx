import { memo } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { MemberCard } from './MemberCard'
import type { OrganizationMember, MemberRole } from '../../stores/organizations'

interface MemberListProps {
  members: OrganizationMember[]
  currentUserId: string
  currentUserRole: MemberRole | null
  isLoading: boolean
  onInvite: () => void
  onSelectMember?: (userId: string) => void
  onUpdateRole: (memberId: string, role: MemberRole) => void
  onRemove: (memberId: string) => void
}

export const MemberList = memo(function MemberList({
  members,
  currentUserId,
  currentUserRole,
  isLoading,
  onInvite,
  onSelectMember,
  onUpdateRole,
  onRemove,
}: MemberListProps) {
  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin'

  // Sort: owner first, then admin, member, viewer
  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 }
    return roleOrder[a.role] - roleOrder[b.role]
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Members ({members.length})
          </h3>
        </div>
        {canManageMembers && (
          <button
            onClick={onInvite}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No members yet</p>
          {canManageMembers && (
            <button
              onClick={onInvite}
              className="mt-3 text-primary-600 dark:text-primary-400 hover:underline"
            >
              Invite your first member
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              currentUserId={currentUserId}
              canManage={canManageMembers}
              onClick={onSelectMember ? () => onSelectMember(member.user_id) : undefined}
              onUpdateRole={(role) => onUpdateRole(member.id, role)}
              onRemove={() => onRemove(member.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

MemberList.displayName = 'MemberList'
