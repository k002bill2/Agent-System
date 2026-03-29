import { useEffect, useState } from 'react'
import { X, UserPlus, Loader2, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useProjectAccessStore,
  type ProjectRole,
  type ProjectAccessMember,
  type OrgMemberForProject,
} from '../../stores/projectAccess'
import { useAuthStore } from '../../stores/auth'

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<ProjectRole, string> = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

interface ProjectMembersContentProps {
  projectId: string
  projectName?: string
}

export function ProjectMembersContent({
  projectId,
}: ProjectMembersContentProps) {
  const {
    members,
    myAccess,
    loading,
    error,
    availableOrgMembers,
    isLoadingAvailableMembers,
    fetchMembers,
    addMember,
    updateRole,
    removeMember,
    fetchMyAccess,
    clearError,
    fetchAvailableOrgMembers,
  } = useProjectAccessStore()

  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false)

  // Add member form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRole, setNewRole] = useState<ProjectRole>('viewer')
  const [selectedOrgMember, setSelectedOrgMember] = useState<OrgMemberForProject | null>(null)

  const isOwner = myAccess?.role === 'owner'
  const canManage = isAdmin || isOwner

  useEffect(() => {
    fetchMembers(projectId)
    fetchMyAccess(projectId)
    fetchAvailableOrgMembers(projectId)
  }, [projectId, fetchMembers, fetchMyAccess, fetchAvailableOrgMembers])

  const handleAdd = async () => {
    if (!selectedOrgMember) return
    await addMember(projectId, selectedOrgMember.user_id, newRole)
    setSelectedOrgMember(null)
    setNewRole('viewer')
    setShowAddForm(false)
    fetchAvailableOrgMembers(projectId)
  }

  const handleRoleChange = async (member: ProjectAccessMember, role: ProjectRole) => {
    await updateRole(projectId, member.user_id, role)
  }

  const handleRemove = async (member: ProjectAccessMember) => {
    const label = member.user_email || member.user_id
    if (!confirm(`Remove ${label} from this project?`)) return
    await removeMember(projectId, member.user_id)
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-start justify-between gap-2">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Section: Current Members */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            멤버 ({members.length})
          </h4>
          {canManage && (
            <button
              onClick={() => {
                setShowAddForm(!showAddForm)
                clearError()
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                showAddForm
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              )}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {showAddForm ? '취소' : '추가'}
            </button>
          )}
        </div>

        {/* Add Member Form — Org Member Picker */}
        {showAddForm && canManage && (
          <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              조직 멤버에서 선택
            </p>

            {isLoadingAvailableMembers ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>로딩 중...</span>
              </div>
            ) : availableOrgMembers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                추가 가능한 조직 멤버가 없습니다.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                {availableOrgMembers.map((orgMember) => (
                  <button
                    key={orgMember.user_id}
                    onClick={() =>
                      setSelectedOrgMember(
                        selectedOrgMember?.user_id === orgMember.user_id ? null : orgMember
                      )
                    }
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      selectedOrgMember?.user_id === orgMember.user_id
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {(orgMember.name || orgMember.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {orgMember.name || orgMember.email}
                      </p>
                      {orgMember.name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {orgMember.email}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {orgMember.org_role}
                    </span>
                    {selectedOrgMember?.user_id === orgMember.user_id && (
                      <span className="text-primary-600 dark:text-primary-400 text-xs font-medium shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedOrgMember && (
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as ProjectRole)}
                  className="flex-1 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '추가'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Members List */}
        {loading && members.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">로딩 중...</span>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">멤버가 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {(member.user_name || member.user_email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {member.user_name || member.user_email || member.user_id}
                  </p>
                  {member.user_email && member.user_name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {member.user_email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {canManage ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(member, e.target.value as ProjectRole)
                      }
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="owner">Owner</option>
                    </select>
                  ) : (
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full',
                        ROLE_COLORS[member.role as ProjectRole] ?? ROLE_COLORS.viewer
                      )}
                    >
                      {ROLE_LABELS[member.role as ProjectRole] ?? member.role}
                    </span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleRemove(member)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="멤버 제거"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer: my role */}
      {myAccess && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            내 역할:{' '}
            <span
              className={cn(
                'px-1.5 py-0.5 rounded-full font-medium',
                myAccess.role
                  ? ROLE_COLORS[myAccess.role]
                  : 'text-gray-500'
              )}
            >
              {myAccess.role
                ? ROLE_LABELS[myAccess.role]
                : 'No access'}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
