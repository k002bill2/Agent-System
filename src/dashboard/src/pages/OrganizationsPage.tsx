import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, AlertCircle, Settings, Info, Users } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  useOrganizationsStore,
  OrganizationTab,
  OrganizationCreate,
  CreateOrganizationRequest,
} from '../stores/organizations'
import { useAuthStore } from '../stores/auth'
import {
  OrganizationCard,
  OrganizationFormModal,
  MemberList,
  InviteMemberModal,
  OrganizationStats,
} from '../components/organizations'

const tabs: { id: OrganizationTab; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function OrganizationsPage() {
  const {
    organizations,
    currentOrganization,
    members,
    stats,
    isLoading,
    error,
    modalMode,
    activeTab,
    setModalMode,
    setActiveTab,
    setCurrentOrganization,
    clearError,
    fetchOrganizations,
    // fetchOrganization - available but not used in this component
    createOrganization,
    updateOrganization,
    deleteOrganization,
    fetchMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
    fetchUserMemberships,
    getCurrentUserRole,
    fetchStats,
  } = useOrganizationsStore()

  const { user } = useAuthStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Initialize
  useEffect(() => {
    fetchOrganizations()
    if (user?.id) {
      fetchUserMemberships(user.id)
    }
  }, [fetchOrganizations, fetchUserMemberships, user?.id])

  // Load organization details when selected
  const handleSelectOrganization = useCallback(async (org: typeof organizations[0]) => {
    setCurrentOrganization(org)
    await Promise.all([fetchMembers(org.id), fetchStats(org.id)])
  }, [setCurrentOrganization, fetchMembers, fetchStats])

  // Auto-select first organization
  useEffect(() => {
    if (!currentOrganization && organizations.length > 0) {
      handleSelectOrganization(organizations[0])
    }
  }, [organizations, currentOrganization, handleSelectOrganization])

  // Get current user's role in the selected organization
  const currentUserRole = currentOrganization && user
    ? getCurrentUserRole(currentOrganization.id, user.id)
    : null

  const canManageOrg = currentUserRole === 'owner' || currentUserRole === 'admin'

  // Handle delete
  const handleDeleteClick = (orgId: string) => {
    setDeleteTarget(orgId)
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await deleteOrganization(deleteTarget)
      setShowDeleteConfirm(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Organization List */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Organizations</h2>
            <button
              onClick={() => setModalMode('create')}
              className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              title="Create Organization"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && organizations.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400 mb-3">
                No organizations yet
              </p>
              <button
                onClick={() => setModalMode('create')}
                className="text-primary-600 dark:text-primary-400 hover:underline text-sm"
              >
                Create your first organization
              </button>
            </div>
          ) : (
            organizations.map((org) => (
              <OrganizationCard
                key={org.id}
                organization={org}
                isSelected={currentOrganization?.id === org.id}
                onSelect={() => handleSelectOrganization(org)}
                onEdit={() => {
                  setCurrentOrganization(org)
                  setModalMode('edit')
                }}
                onDelete={() => handleDeleteClick(org.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Organization Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
            >
              ×
            </button>
          </div>
        )}

        {!currentOrganization ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">
                Select an organization to view details
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentOrganization.logo_url ? (
                    <img
                      src={currentOrganization.logo_url}
                      alt={currentOrganization.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: currentOrganization.primary_color || '#6366f1',
                      }}
                    >
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {currentOrganization.name}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      @{currentOrganization.slug}
                    </p>
                  </div>
                </div>

                {canManageOrg && (
                  <button
                    onClick={() => setModalMode('edit')}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {currentOrganization.description && (
                    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        About
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        {currentOrganization.description}
                      </p>
                    </div>
                  )}

                  <OrganizationStats
                    organization={currentOrganization}
                    stats={stats}
                    isLoading={isLoading}
                  />
                </div>
              )}

              {activeTab === 'members' && (
                <MemberList
                  members={members}
                  currentUserId={user?.id || ''}
                  currentUserRole={currentUserRole}
                  isLoading={isLoading}
                  onInvite={() => setModalMode('invite')}
                  onUpdateRole={(memberId, role) =>
                    updateMemberRole(currentOrganization.id, memberId, role)
                  }
                  onRemove={(memberId) => removeMember(currentOrganization.id, memberId)}
                />
              )}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  {/* Contact Info */}
                  <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Contact Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Contact Name</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.contact_name || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Contact Email</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.contact_email || '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Plan Limits */}
                  <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Plan Limits
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Max Members</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.max_members === -1 ? 'Unlimited' : currentOrganization.max_members}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Max Projects</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.max_projects === -1 ? 'Unlimited' : currentOrganization.max_projects}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Max Sessions/Day</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.max_sessions_per_day === -1 ? 'Unlimited' : currentOrganization.max_sessions_per_day.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Max Tokens/Month</span>
                        <p className="text-gray-900 dark:text-white">
                          {currentOrganization.max_tokens_per_month === -1 ? 'Unlimited' : currentOrganization.max_tokens_per_month.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  {canManageOrg && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
                      <h3 className="text-sm font-medium text-red-700 dark:text-red-400 mb-3">
                        Danger Zone
                      </h3>
                      <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                        Once you delete an organization, there is no going back. Please be certain.
                      </p>
                      <button
                        onClick={() => handleDeleteClick(currentOrganization.id)}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                      >
                        Delete Organization
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Organization Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <OrganizationFormModal
          mode={modalMode}
          organization={modalMode === 'edit' ? currentOrganization : null}
          isLoading={isLoading}
          onSubmit={async (data) => {
            if (modalMode === 'create') {
              // Include owner info from current user
              if (!user?.id || !user?.email) {
                return false
              }
              const request: CreateOrganizationRequest = {
                organization: data as OrganizationCreate,
                owner_user_id: user.id,
                owner_email: user.email,
                owner_name: user.name || undefined,
              }
              return createOrganization(request)
            } else if (currentOrganization) {
              return updateOrganization(
                currentOrganization.id,
                data as Parameters<typeof updateOrganization>[1]
              )
            }
            return false
          }}
          onClose={() => setModalMode(null)}
        />
      )}

      {/* Invite Member Modal */}
      {modalMode === 'invite' && currentOrganization && (
        <InviteMemberModal
          organizationName={currentOrganization.name}
          isLoading={isLoading}
          onSubmit={(data) => inviteMember(currentOrganization.id, data)}
          onClose={() => setModalMode(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Organization
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this organization? This action cannot be undone and will remove all associated data.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteTarget(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
