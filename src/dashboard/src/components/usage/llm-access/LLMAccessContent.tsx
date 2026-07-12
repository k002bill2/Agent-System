import { ModeBreakdown, SourceBreakdown } from './BreakdownSections'
import { EntitlementList } from './EntitlementList'
import { LLMAccessError, LLMAccessLoading } from './LLMAccessCard'
import { MetricGrid } from './MetricGrid'
import { ProfileCreateForm } from './ProfileCreateForm'
import { ProfilePanel } from './ProfilePanel'
import { StatusBadges } from './StatusBadges'
import type { LLMAccessSettingsModel } from './useLLMAccessSettingsModel'

function UsageScopeSelect({ model }: { model: LLMAccessSettingsModel }) {
  if (!model.isManager || model.organizationMemberships.length === 0) return null

  return (
    <label className="block max-w-xs">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Usage scope
      </span>
      <select
        aria-label="LLM usage organization scope"
        value={model.usageScope}
        onChange={event => model.handleUsageScopeChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <option value="all">All accessible usage</option>
        {model.organizationMemberships.map(membership => (
          <option key={membership.organization_id} value={membership.organization_id}>
            Organization {membership.organization_id}
          </option>
        ))}
      </select>
    </label>
  )
}

function LLMAccessLoadedContent({ model }: { model: LLMAccessSettingsModel }) {
  return (
    <>
      <UsageScopeSelect model={model} />
      <MetricGrid
        totalTokens={model.totalTokens}
        totalRequests={model.totalRequests}
        estimatedCost={model.summary?.estimated_cost_usd}
      />
      {(model.access?.profiles ?? []).length > 0 && (
        <div className="space-y-3">
          {(model.access?.profiles ?? []).map((profile, index) => (
            <ProfilePanel
              key={profile.id}
              profile={profile}
              activeProvider={profile.provider}
              providerModels={model.providerModels.filter(
                model => model.provider === profile.provider,
              )}
              defaultModelId={model.defaultModelId}
              isManager={model.isManager}
              modelsLoading={model.modelsLoading}
              showDefaultModel={index === 0}
              onDefaultModelChange={model.handleDefaultModelChange}
              onHealthCheck={model.handleProfileHealthCheck}
              onUpdateProfile={model.handleProfileUpdate}
              onDeleteProfile={model.handleProfileDelete}
            />
          ))}
        </div>
      )}
      {model.isManager && model.access && (
        <ProfileCreateForm
          name={model.profileForm.name}
          scope={model.profileForm.scope}
          organizationMemberships={model.organizationMemberships}
          organizationMembers={model.organizationMembers}
          ownerUserId={model.profileForm.ownerUserId}
          provider={model.profileForm.provider}
          command={model.profileForm.command}
          args={model.profileForm.args}
          workingDirectory={model.profileForm.workingDirectory}
          sandboxPreset={model.profileForm.sandboxPreset}
          onNameChange={model.profileForm.setName}
          onScopeChange={model.profileForm.setScope}
          onOwnerUserIdChange={model.profileForm.setOwnerUserId}
          onProviderChange={model.profileForm.setProvider}
          onCommandChange={model.profileForm.setCommand}
          onArgsChange={model.profileForm.setArgs}
          onWorkingDirectoryChange={model.profileForm.setWorkingDirectory}
          onSandboxPresetChange={model.profileForm.setSandboxPreset}
          onCreate={model.handleCreateProfile}
        />
      )}
      <EntitlementList
        entitlements={model.entitlements}
        profiles={model.access?.profiles ?? []}
        isManager={model.isManager}
        onUpdate={model.handleEntitlementUpdate}
      />
      <ModeBreakdown summary={model.summary} cliRequests={model.cliRequests} />
      <SourceBreakdown entries={model.sourceEntries} />
    </>
  )
}

export function LLMAccessContent({ model }: { model: LLMAccessSettingsModel }) {
  return (
    <div className="p-4 space-y-4">
      <StatusBadges apiRequests={model.apiRequests} />
      <LLMAccessError message={model.errorMessage} />
      {model.showLoading ? (
        <LLMAccessLoading />
      ) : (
        <LLMAccessLoadedContent model={model} />
      )}
    </div>
  )
}
