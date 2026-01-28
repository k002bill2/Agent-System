import { Building2, Users, FolderKanban, MoreVertical, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import type { Organization, OrganizationPlan } from '../../stores/organizations'

interface OrganizationCardProps {
  organization: Organization
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

const planColors: Record<OrganizationPlan, string> = {
  free: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  professional: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const planLabels: Record<OrganizationPlan, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

export function OrganizationCard({
  organization,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: OrganizationCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {organization.logo_url ? (
            <img
              src={organization.logo_url}
              alt={organization.name}
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: organization.primary_color || '#6366f1',
              }}
            >
              <Building2 className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{organization.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">@{organization.slug}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                }}
              />
              <div className="absolute right-0 top-8 z-20 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    onEdit()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    onDelete()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {organization.description && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {organization.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-4">
        <span className={cn('px-2 py-0.5 text-xs font-medium rounded', planColors[organization.plan])}>
          {planLabels[organization.plan]}
        </span>
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Users className="w-3.5 h-3.5" />
          <span>
            {organization.current_members}/{organization.max_members === -1 ? '∞' : organization.max_members}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <FolderKanban className="w-3.5 h-3.5" />
          <span>
            {organization.current_projects}/{organization.max_projects === -1 ? '∞' : organization.max_projects}
          </span>
        </div>
      </div>
    </div>
  )
}
