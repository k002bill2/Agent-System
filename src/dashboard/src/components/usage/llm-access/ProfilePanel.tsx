import { RefreshCw, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import type { LLMCLIProfile, LLMCLIProfileUpdate } from '@/stores/llmAccess'
import type { LLMModel } from '@/stores/settings'

import {
  buildCLIProfileRuntimeUpdatePayload,
  getProfileSandboxPreset,
  SANDBOX_PRESETS,
} from './utils'

const DEFAULT_CODEX_PROFILE_ID = 'default-codex-cli'

function canDeleteProfile(profile: LLMCLIProfile): boolean {
  return profile.id !== DEFAULT_CODEX_PROFILE_ID && profile.metadata.source !== 'env-default'
}

function getHealthCheckMessage(metadata: Record<string, unknown>): string | null {
  const healthCheck = metadata.health_check
  if (!healthCheck || typeof healthCheck !== 'object') return null

  const message = (healthCheck as Record<string, unknown>).message
  return typeof message === 'string' && message.trim() ? message : null
}

function AuthStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'px-2 py-1 rounded text-xs font-medium flex-shrink-0',
        status === 'connected'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      )}
    >
      {status}
    </span>
  )
}

function ProfileActionStack({
  profile,
  isManager,
  onHealthCheck,
  onDeleteProfile,
}: {
  profile: LLMCLIProfile
  isManager: boolean
  onHealthCheck: (profileId: string) => void
  onDeleteProfile: (profileId: string) => void
}) {
  const handleDelete = () => {
    if (
      window.confirm(
        `Delete CLI profile "${profile.profile_name}"? Entitlements using it will be unassigned.`,
      )
    ) {
      onDeleteProfile(profile.id)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <AuthStatusBadge status={profile.auth_status} />
      {isManager && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onHealthCheck(profile.id)}
            aria-label={`Check CLI auth for ${profile.profile_name}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-600 hover:border-blue-200 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-blue-800 dark:hover:text-blue-400"
          >
            <RefreshCw className="h-3 w-3" />
            Check auth
          </button>
          {canDeleteProfile(profile) && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`Delete CLI profile ${profile.profile_name}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-200 px-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProfileSummary({
  profile,
  healthCheckMessage,
}: {
  profile: LLMCLIProfile
  healthCheckMessage: string | null
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        Profile
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
        {profile.profile_name}
      </p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
        {profile.command} {profile.args_json.join(' ')}
      </p>
      {healthCheckMessage && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
          {healthCheckMessage}
        </p>
      )}
    </div>
  )
}

function ProfileHeader({
  profile,
  isManager,
  onHealthCheck,
  onDeleteProfile,
}: {
  profile: LLMCLIProfile
  isManager: boolean
  onHealthCheck: (profileId: string) => void
  onDeleteProfile: (profileId: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <ProfileSummary
        profile={profile}
        healthCheckMessage={getHealthCheckMessage(profile.metadata)}
      />
      <ProfileActionStack
        profile={profile}
        isManager={isManager}
        onHealthCheck={onHealthCheck}
        onDeleteProfile={onDeleteProfile}
      />
    </div>
  )
}

function DefaultModelSelect({
  activeProvider,
  providerModels,
  defaultModelId,
  isManager,
  modelsLoading,
  onDefaultModelChange,
}: {
  activeProvider: string
  providerModels: LLMModel[]
  defaultModelId: string
  isManager: boolean
  modelsLoading: boolean
  onDefaultModelChange: (modelId: string) => void
}) {
  if (providerModels.length === 0) return null

  return (
    <div className="mt-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Default model
        </span>
        <select
          aria-label={`Default model for ${activeProvider}`}
          value={defaultModelId}
          disabled={!isManager || modelsLoading}
          onChange={event => onDefaultModelChange(event.target.value)}
          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
        >
          {!defaultModelId && <option value="">Select model</option>}
          {providerModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.display_name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function WorkingDirectoryField({
  profileName,
  value,
  disabled,
  onChange,
}: {
  profileName: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Working directory
      </span>
      <input
        aria-label={`Working directory for ${profileName}`}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
      />
    </label>
  )
}

function SandboxPresetField({
  profileName,
  value,
  disabled,
  onChange,
}: {
  profileName: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Sandbox
      </span>
      <select
        aria-label={`Sandbox preset for ${profileName}`}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
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

function SaveProfileButton({ onSave }: { onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 sm:col-span-2"
    >
      <Save className="h-3.5 w-3.5" />
      Save profile
    </button>
  )
}

function ProfileRuntimeEditor({
  profile,
  isManager,
  onUpdateProfile,
}: {
  profile: LLMCLIProfile
  isManager: boolean
  onUpdateProfile: (profileId: string, patch: LLMCLIProfileUpdate) => void
}) {
  const [workingDirectory, setWorkingDirectory] = useState(
    profile.working_directory ?? '',
  )
  const [sandboxPreset, setSandboxPreset] = useState(
    getProfileSandboxPreset(profile),
  )

  useEffect(() => {
    setWorkingDirectory(profile.working_directory ?? '')
    setSandboxPreset(getProfileSandboxPreset(profile))
  }, [profile])

  const handleSave = () => {
    onUpdateProfile(
      profile.id,
      buildCLIProfileRuntimeUpdatePayload({
        profile,
        workingDirectory,
        sandboxPreset,
      }),
    )
  }

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <WorkingDirectoryField
        profileName={profile.profile_name}
        value={workingDirectory}
        disabled={!isManager}
        onChange={setWorkingDirectory}
      />
      <SandboxPresetField
        profileName={profile.profile_name}
        value={sandboxPreset}
        disabled={!isManager}
        onChange={setSandboxPreset}
      />
      {isManager && <SaveProfileButton onSave={handleSave} />}
    </div>
  )
}

export function ProfilePanel({
  profile,
  activeProvider,
  providerModels,
  defaultModelId,
  isManager,
  modelsLoading,
  showDefaultModel,
  onDefaultModelChange,
  onHealthCheck,
  onUpdateProfile,
  onDeleteProfile,
}: {
  profile: LLMCLIProfile
  activeProvider: string
  providerModels: LLMModel[]
  defaultModelId: string
  isManager: boolean
  modelsLoading: boolean
  showDefaultModel?: boolean
  onDefaultModelChange: (modelId: string) => void
  onHealthCheck: (profileId: string) => void
  onUpdateProfile: (profileId: string, patch: LLMCLIProfileUpdate) => void
  onDeleteProfile: (profileId: string) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <ProfileHeader
        profile={profile}
        isManager={isManager}
        onHealthCheck={onHealthCheck}
        onDeleteProfile={onDeleteProfile}
      />
      {showDefaultModel !== false && (
        <DefaultModelSelect
          activeProvider={activeProvider}
          providerModels={providerModels}
          defaultModelId={defaultModelId}
          isManager={isManager}
          modelsLoading={modelsLoading}
          onDefaultModelChange={onDefaultModelChange}
        />
      )}
      <ProfileRuntimeEditor
        profile={profile}
        isManager={isManager}
        onUpdateProfile={onUpdateProfile}
      />
    </div>
  )
}
