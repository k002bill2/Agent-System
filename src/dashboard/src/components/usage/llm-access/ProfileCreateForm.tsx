import { Plus } from 'lucide-react'

import type { OrganizationMember } from '@/stores/organizations'

import { CLI_PROVIDER_OPTIONS, SANDBOX_PRESETS } from './utils'

type TextInputFieldProps = {
  label: string
  ariaLabel: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

type ProfileCreateFormProps = {
  name: string
  scope: string
  organizationMemberships: OrganizationMember[]
  organizationMembers: OrganizationMember[]
  ownerUserId: string
  provider: string
  command: string
  args: string
  workingDirectory: string
  sandboxPreset: string
  onNameChange: (value: string) => void
  onScopeChange: (value: string) => void
  onOwnerUserIdChange: (value: string) => void
  onProviderChange: (value: string) => void
  onCommandChange: (value: string) => void
  onArgsChange: (value: string) => void
  onWorkingDirectoryChange: (value: string) => void
  onSandboxPresetChange: (value: string) => void
  onCreate: () => void
}

function TextInputField({
  label,
  ariaLabel,
  value,
  placeholder,
  onChange,
}: TextInputFieldProps) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      />
    </label>
  )
}

function ProviderSelect({
  provider,
  onProviderChange,
}: {
  provider: string
  onProviderChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Provider
      </span>
      <select
        aria-label="New CLI profile provider"
        value={provider}
        onChange={event => onProviderChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {CLI_PROVIDER_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ScopeSelect({
  scope,
  memberships,
  onScopeChange,
}: {
  scope: string
  memberships: OrganizationMember[]
  onScopeChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Scope
      </span>
      <select
        aria-label="New CLI profile scope"
        value={scope}
        onChange={event => onScopeChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <option value="personal">Personal</option>
        {memberships.map(membership => (
          <option key={membership.organization_id} value={membership.organization_id}>
            Organization {membership.organization_id}
          </option>
        ))}
      </select>
    </label>
  )
}

function SandboxSelect({
  preset,
  onPresetChange,
}: {
  preset: string
  onPresetChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Sandbox
      </span>
      <select
        aria-label="New CLI sandbox preset"
        value={preset}
        onChange={event => onPresetChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {SANDBOX_PRESETS.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProfileOwnerSelect({
  scope,
  ownerUserId,
  members,
  onOwnerUserIdChange,
}: {
  scope: string
  ownerUserId: string
  members: OrganizationMember[]
  onOwnerUserIdChange: (value: string) => void
}) {
  if (scope === 'personal') return null

  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Owner
      </span>
      <select
        aria-label="New CLI profile owner"
        value={ownerUserId}
        onChange={event => onOwnerUserIdChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <option value="shared">Shared organization</option>
        {members.map(member => (
          <option key={member.id} value={member.user_id}>
            {member.name || member.email || member.user_id}
          </option>
        ))}
      </select>
    </label>
  )
}

function CreateProfileButton({
  disabled,
  onCreate,
}: {
  disabled: boolean
  onCreate: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={disabled}
      className="mt-5 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
    >
      <Plus className="h-3.5 w-3.5" />
      Create CLI profile
    </button>
  )
}

function ProfileIdentityFields({
  name,
  scope,
  organizationMemberships,
  organizationMembers,
  ownerUserId,
  provider,
  onNameChange,
  onScopeChange,
  onOwnerUserIdChange,
  onProviderChange,
}: Pick<
  ProfileCreateFormProps,
  | 'name'
  | 'scope'
  | 'organizationMemberships'
  | 'organizationMembers'
  | 'ownerUserId'
  | 'provider'
  | 'onNameChange'
  | 'onScopeChange'
  | 'onOwnerUserIdChange'
  | 'onProviderChange'
>) {
  return (
    <>
      <ProviderSelect provider={provider} onProviderChange={onProviderChange} />
      <TextInputField
        label="Profile name"
        ariaLabel="New CLI profile name"
        value={name}
        placeholder="Team Codex CLI"
        onChange={onNameChange}
      />
      <ScopeSelect
        scope={scope}
        memberships={organizationMemberships}
        onScopeChange={onScopeChange}
      />
      <ProfileOwnerSelect
        scope={scope}
        ownerUserId={ownerUserId}
        members={organizationMembers}
        onOwnerUserIdChange={onOwnerUserIdChange}
      />
    </>
  )
}

function ProfileCommandFields({
  command,
  args,
  onCommandChange,
  onArgsChange,
}: Pick<
  ProfileCreateFormProps,
  'command' | 'args' | 'onCommandChange' | 'onArgsChange'
>) {
  return (
    <>
      <TextInputField
        label="Command"
        ariaLabel="New CLI command"
        value={command}
        onChange={onCommandChange}
      />
      <TextInputField
        label="Args"
        ariaLabel="New CLI args"
        value={args}
        onChange={onArgsChange}
      />
    </>
  )
}

function ProfileRuntimeFields({
  name,
  workingDirectory,
  sandboxPreset,
  onWorkingDirectoryChange,
  onSandboxPresetChange,
  onCreate,
}: Pick<
  ProfileCreateFormProps,
  | 'name'
  | 'workingDirectory'
  | 'sandboxPreset'
  | 'onWorkingDirectoryChange'
  | 'onSandboxPresetChange'
  | 'onCreate'
>) {
  return (
    <>
      <TextInputField
        label="Working directory"
        ariaLabel="New CLI working directory"
        value={workingDirectory}
        placeholder="/workspace/project"
        onChange={onWorkingDirectoryChange}
      />
      <SandboxSelect
        preset={sandboxPreset}
        onPresetChange={onSandboxPresetChange}
      />
      <CreateProfileButton disabled={!name.trim()} onCreate={onCreate} />
    </>
  )
}

export function ProfileCreateForm(props: ProfileCreateFormProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ProfileBaseFields {...props} />
        <ProfileRuntimeFields {...props} />
      </div>
    </div>
  )
}

function ProfileBaseFields(props: ProfileCreateFormProps) {
  return (
    <>
      <ProfileIdentityFields {...props} />
      <ProfileCommandFields {...props} />
    </>
  )
}
