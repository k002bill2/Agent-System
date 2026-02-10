import { useEffect, useState } from 'react'
import {
  useProjectAccessStore,
  type ProjectRole,
  type ProjectAccessMember,
} from '../../stores/projectAccess'

interface ProjectMembersPanelProps {
  projectId: string
}

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

export default function ProjectMembersPanel({ projectId }: ProjectMembersPanelProps) {
  const {
    members,
    myAccess,
    loading,
    error,
    fetchMembers,
    addMember,
    updateRole,
    removeMember,
    fetchMyAccess,
    clearError,
  } = useProjectAccessStore()

  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState<ProjectRole>('viewer')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchMembers(projectId)
    fetchMyAccess(projectId)
  }, [projectId, fetchMembers, fetchMyAccess])

  const isOwner = myAccess?.role === 'owner'

  const handleAdd = async () => {
    if (!newUserId.trim()) return
    await addMember(projectId, newUserId.trim(), newRole)
    setNewUserId('')
    setNewRole('viewer')
    setShowAddForm(false)
  }

  const handleRoleChange = async (member: ProjectAccessMember, role: ProjectRole) => {
    await updateRole(projectId, member.user_id, role)
  }

  const handleRemove = async (member: ProjectAccessMember) => {
    if (!confirm(`Remove ${member.user_email || member.user_id} from this project?`)) return
    await removeMember(projectId, member.user_id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Project Members
        </h3>
        {isOwner && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {showAddForm ? 'Cancel' : 'Add Member'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Add Member Form */}
      {showAddForm && isOwner && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex gap-3">
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="User ID"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as ProjectRole)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!newUserId.trim() || loading}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Members List */}
      {loading && members.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading members...
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No access control configured.</p>
          <p className="text-xs mt-1">All authenticated users can access this project.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800"
            >
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

              <div className="flex items-center gap-2 ml-4">
                {isOwner ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member, e.target.value as ProjectRole)}
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                ) : (
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${ROLE_COLORS[member.role as ProjectRole] || ROLE_COLORS.viewer}`}
                  >
                    {ROLE_LABELS[member.role as ProjectRole] || member.role}
                  </span>
                )}

                {isOwner && (
                  <button
                    onClick={() => handleRemove(member)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove member"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Access Info */}
      {myAccess && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Your role: <span className="font-medium">{myAccess.role || 'N/A'}</span>
        </div>
      )}
    </div>
  )
}
