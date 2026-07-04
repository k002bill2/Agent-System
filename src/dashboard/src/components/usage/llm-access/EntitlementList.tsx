import type { LLMCLIProfile, LLMEntitlement } from '@/stores/llmAccess'

import { isPersistedEntitlement } from './utils'

function EnabledToggle({
  label,
  checked,
  disabled,
  onUpdate,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onUpdate: (patch: Partial<LLMEntitlement>) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 flex-shrink-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">Enabled</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={`Toggle ${label} access`}
        onChange={event => onUpdate({ enabled: event.target.checked })}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
      />
    </label>
  )
}

function ProfileSelect({
  label,
  value,
  disabled,
  profiles,
  onUpdate,
}: {
  label: string
  value: string | null
  disabled: boolean
  profiles: LLMCLIProfile[]
  onUpdate: (patch: Partial<LLMEntitlement>) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">Profile</span>
      <select
        aria-label={`CLI profile for ${label}`}
        value={value ?? ''}
        disabled={disabled || profiles.length === 0}
        onChange={event => onUpdate({ cli_profile_id: event.target.value || null })}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
      >
        <option value="">No profile</option>
        {profiles.map(profile => (
          <option key={profile.id} value={profile.id}>
            {profile.profile_name}
          </option>
        ))}
      </select>
    </label>
  )
}

function ApiFallbackToggle({
  label,
  checked,
  disabled,
  onUpdate,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onUpdate: (patch: Partial<LLMEntitlement>) => void
}) {
  return (
    <label className="mt-6 inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={`Allow API fallback for ${label}`}
        onChange={event => onUpdate({ allow_api_fallback: event.target.checked })}
        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">API fallback</span>
    </label>
  )
}

function EntitlementRow({
  entitlement,
  profiles,
  isManager,
  onUpdate,
}: {
  entitlement: LLMEntitlement
  profiles: LLMCLIProfile[]
  isManager: boolean
  onUpdate: (id: string, patch: Partial<LLMEntitlement>) => void
}) {
  const canEdit = isManager && isPersistedEntitlement(entitlement)
  const label = `${entitlement.provider} ${entitlement.source_scope}`
  const profileOptions = profiles.filter(profile => profile.provider === entitlement.provider)
  const update = (patch: Partial<LLMEntitlement>) => onUpdate(entitlement.id, patch)

  return (
    <div className="py-2">
      <EntitlementHeader
        entitlement={entitlement}
        label={label}
        canEdit={canEdit}
        onUpdate={update}
      />
      <EntitlementControls
        entitlement={entitlement}
        label={label}
        canEdit={canEdit}
        profileOptions={profileOptions}
        onUpdate={update}
      />
    </div>
  )
}

function EntitlementHeader({
  entitlement,
  label,
  canEdit,
  onUpdate,
}: {
  entitlement: LLMEntitlement
  label: string
  canEdit: boolean
  onUpdate: (patch: Partial<LLMEntitlement>) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {entitlement.provider}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {entitlement.mode} / {entitlement.source_scope}
          {entitlement.allow_api_fallback ? ' / API fallback' : ''}
        </p>
      </div>
      <EnabledToggle
        label={label}
        checked={entitlement.enabled}
        disabled={!canEdit}
        onUpdate={onUpdate}
      />
    </div>
  )
}

function EntitlementControls({
  entitlement,
  label,
  canEdit,
  profileOptions,
  onUpdate,
}: {
  entitlement: LLMEntitlement
  label: string
  canEdit: boolean
  profileOptions: LLMCLIProfile[]
  onUpdate: (patch: Partial<LLMEntitlement>) => void
}) {
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <ProfileSelect
        label={label}
        value={entitlement.cli_profile_id}
        disabled={!canEdit}
        profiles={profileOptions}
        onUpdate={onUpdate}
      />
      <ApiFallbackToggle
        label={label}
        checked={entitlement.allow_api_fallback}
        disabled={!canEdit}
        onUpdate={onUpdate}
      />
    </div>
  )
}

export function EntitlementList({
  entitlements,
  profiles,
  isManager,
  onUpdate,
}: {
  entitlements: LLMEntitlement[]
  profiles: LLMCLIProfile[]
  isManager: boolean
  onUpdate: (id: string, patch: Partial<LLMEntitlement>) => void
}) {
  if (entitlements.length === 0) return null

  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400 mb-1">
        Access
      </p>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {entitlements.slice(0, 3).map(entitlement => (
          <EntitlementRow
            key={entitlement.id}
            entitlement={entitlement}
            profiles={profiles}
            isManager={isManager}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  )
}
