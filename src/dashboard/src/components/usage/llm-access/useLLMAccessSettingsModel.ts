import { useEffect, useState } from 'react'

import { useAuthStore } from '@/stores/auth'
import {
  useLLMAccessStore,
  type LLMAccess,
  type LLMCLIProfile,
  type LLMCLIProfileUpdate,
  type LLMEntitlement,
  type LLMEntitlementUpdate,
} from '@/stores/llmAccess'
import {
  useLLMUsageStore,
  type LLMUsageBreakdown,
  type LLMUsageFilters,
  type LLMUsageSummary,
} from '@/stores/llmUsage'
import {
  useOrganizationsStore,
  type OrganizationMember,
} from '@/stores/organizations'
import { useSettingsStore, type LLMModel } from '@/stores/settings'

import {
  buildCLIProfileCreatePayload,
  canManageLLMAccess,
  CLI_PROVIDER_DEFAULTS,
  DEFAULT_CLI_ARGS,
  DEFAULT_CLI_COMMAND,
  uniqueOrganizationMemberships,
} from './utils'

const DEFAULT_CLI_PROVIDER = 'codex_cli'

type ProfileFormState = {
  name: string
  scope: string
  ownerUserId: string
  provider: string
  command: string
  args: string
  workingDirectory: string
  sandboxPreset: string
  setName: (value: string) => void
  setScope: (value: string) => void
  setOwnerUserId: (value: string) => void
  setProvider: (value: string) => void
  setCommand: (value: string) => void
  setArgs: (value: string) => void
  setWorkingDirectory: (value: string) => void
  setSandboxPreset: (value: string) => void
}

export type LLMAccessSettingsModel = {
  summary: LLMUsageSummary | null
  access: LLMAccess | null
  errorMessage?: string
  loading: boolean
  showLoading: boolean
  isManager: boolean
  totalTokens: number
  totalRequests: number
  cliRequests: number
  apiRequests: number
  primaryProfile: LLMCLIProfile | null
  entitlements: LLMEntitlement[]
  activeProvider: string
  organizationMemberships: OrganizationMember[]
  organizationMembers: OrganizationMember[]
  usageScope: string
  providerModels: LLMModel[]
  defaultModelId: string
  modelsLoading: boolean
  sourceEntries: Array<[string, LLMUsageBreakdown]>
  profileForm: ProfileFormState
  handleRefresh: () => void
  handleUsageScopeChange: (scope: string) => void
  handleCreateProfile: () => void
  handleDefaultModelChange: (modelId: string) => void
  handleProfileHealthCheck: (profileId: string) => void
  handleProfileUpdate: (profileId: string, patch: LLMCLIProfileUpdate) => void
  handleProfileDelete: (profileId: string) => void
  handleEntitlementUpdate: (
    entitlementId: string,
    patch: LLMEntitlementUpdate,
  ) => void
}

function useProfileFormState(): ProfileFormState {
  const [name, setName] = useState('')
  const [scope, setScope] = useState('personal')
  const [ownerUserId, setOwnerUserId] = useState('shared')
  const [provider, setProviderState] = useState(DEFAULT_CLI_PROVIDER)
  const [command, setCommand] = useState(DEFAULT_CLI_COMMAND)
  const [args, setArgs] = useState(DEFAULT_CLI_ARGS)
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [sandboxPreset, setSandboxPreset] = useState('none')

  // Switching provider resets command/args to that provider's CLI defaults so a
  // claude_cli profile can't silently inherit codex's command; still editable after.
  const setProvider = (value: string) => {
    setProviderState(value)
    const defaults = CLI_PROVIDER_DEFAULTS[value]
    if (defaults) {
      setCommand(defaults.command)
      setArgs(defaults.args)
    }
  }

  return {
    name,
    scope,
    ownerUserId,
    provider,
    command,
    args,
    workingDirectory,
    sandboxPreset,
    setName,
    setScope,
    setOwnerUserId,
    setProvider,
    setCommand,
    setArgs,
    setWorkingDirectory,
    setSandboxPreset,
  }
}

function useInitialLLMAccessLoad({
  isManager,
  userId,
  usageScope,
  fetchSummary,
  fetchAccess,
  fetchUserMemberships,
}: {
  isManager: boolean
  userId?: string
  usageScope: string
  fetchSummary: (filters?: LLMUsageFilters) => Promise<void>
  fetchAccess: () => Promise<void>
  fetchUserMemberships: (userId: string) => Promise<void>
}) {
  useEffect(() => {
    void fetchSummary(buildUsageScopeFilters(usageScope))
  }, [fetchSummary, usageScope])

  useEffect(() => {
    void fetchAccess()
  }, [fetchAccess])

  useEffect(() => {
    if (isManager && userId) {
      void fetchUserMemberships(userId)
    }
  }, [fetchUserMemberships, isManager, userId])
}

function useOrganizationMembersForProfileScope({
  isManager,
  scope,
  fetchMembers,
}: {
  isManager: boolean
  scope: string
  fetchMembers: (orgId: string) => Promise<void>
}) {
  useEffect(() => {
    if (isManager && scope !== 'personal') {
      void fetchMembers(scope)
    }
  }, [fetchMembers, isManager, scope])
}

function getSourceEntries(
  summary: LLMUsageSummary | null,
): Array<[string, LLMUsageBreakdown]> {
  return Object.entries(summary?.source_breakdown ?? {})
    .sort(([, a], [, b]) => b.total_tokens - a.total_tokens)
    .slice(0, 4)
}

function buildUsageScopeFilters(usageScope: string): LLMUsageFilters {
  return usageScope === 'all' ? {} : { organizationId: usageScope }
}

function useLLMAccessStoreBindings() {
  const { user } = useAuthStore()
  const { summary, isLoading, error, fetchSummary } = useLLMUsageStore()
  const accessStore = useLLMAccessStore()
  const settingsStore = useSettingsStore()
  const organizationStore = useOrganizationsStore()

  return {
    user,
    summary,
    isLoading,
    error,
    fetchSummary,
    accessStore,
    settingsStore,
    organizationStore,
  }
}

type StoreBindings = ReturnType<typeof useLLMAccessStoreBindings>

function getLLMAccessLoadState(stores: StoreBindings) {
  const access = stores.accessStore.access
  const accessLoading = stores.accessStore.isLoading

  return {
    summary: stores.summary,
    access,
    errorMessage: stores.error ?? stores.accessStore.error ?? undefined,
    loading: stores.isLoading || accessLoading,
    showLoading:
      (stores.isLoading && !stores.summary) || (accessLoading && !access),
  }
}

function getDerivedAccessState(stores: StoreBindings, profileScope: string) {
  const access = stores.accessStore.access
  const summary = stores.summary
  const primaryProfile = access?.profiles[0] ?? null
  const entitlements = access?.entitlements ?? []
  const activeProvider = primaryProfile?.provider ?? entitlements[0]?.provider ?? 'codex_cli'
  const providerModels = stores.settingsStore.availableModels.filter(
    model => model.provider === activeProvider,
  )

  return {
    totalTokens: summary?.total_tokens ?? 0,
    totalRequests: summary?.total_requests ?? 0,
    cliRequests: summary?.mode_breakdown.cli?.total_requests ?? 0,
    apiRequests: summary?.mode_breakdown.api?.total_requests ?? 0,
    primaryProfile,
    entitlements,
    activeProvider,
    organizationMemberships: uniqueOrganizationMemberships(
      stores.organizationStore.userMemberships,
    ),
    organizationMembers: stores.organizationStore.members.filter(
      member => member.organization_id === profileScope && member.is_active !== false,
    ),
    providerModels,
    defaultModelId: providerModels.find(model => model.is_default)?.id ?? '',
    modelsLoading: stores.settingsStore.modelsLoading,
    sourceEntries: getSourceEntries(summary),
  }
}

function createProfileFromForm({
  stores,
  profileForm,
  isManager,
}: {
  stores: StoreBindings
  profileForm: ProfileFormState
  isManager: boolean
}) {
  const access = stores.accessStore.access
  const profileName = profileForm.name.trim()
  const command = profileForm.command.trim() || DEFAULT_CLI_COMMAND
  if (!isManager || !profileName || !access) return
  const ownerUserId =
    profileForm.scope === 'personal'
      ? access.user_id
      : profileForm.ownerUserId === 'shared'
        ? null
        : profileForm.ownerUserId

  void stores.accessStore.createProfile(
    buildCLIProfileCreatePayload({
      activeProvider: profileForm.provider,
      profileName,
      command,
      args: profileForm.args,
      sandboxPreset: profileForm.sandboxPreset,
      scope: profileForm.scope,
      ownerUserId,
      workingDirectory: profileForm.workingDirectory.trim(),
    }),
  )
  profileForm.setName('')
}

function createLLMAccessActions({
  stores,
  profileForm,
  usageScope,
  setUsageScope,
  isManager,
}: {
  stores: StoreBindings
  profileForm: ProfileFormState
  usageScope: string
  setUsageScope: (scope: string) => void
  isManager: boolean
}) {
  return {
    handleRefresh: () => {
      void stores.fetchSummary(buildUsageScopeFilters(usageScope))
      void stores.accessStore.fetchAccess()
    },
    handleUsageScopeChange: (scope: string) => setUsageScope(scope),
    handleCreateProfile: () =>
      createProfileFromForm({
        stores,
        profileForm,
        isManager,
      }),
    handleDefaultModelChange: (modelId: string) => {
      void stores.settingsStore.setDefaultModel(modelId)
    },
    handleProfileHealthCheck: (profileId: string) => {
      void stores.accessStore.checkProfileHealth(profileId)
    },
    handleProfileUpdate: (profileId: string, patch: LLMCLIProfileUpdate) => {
      void stores.accessStore.updateProfile(profileId, patch)
    },
    handleProfileDelete: (profileId: string) => {
      void stores.accessStore.deleteProfile(profileId)
    },
    handleEntitlementUpdate: (
      entitlementId: string,
      patch: LLMEntitlementUpdate,
    ) => {
      void stores.accessStore.updateEntitlement(entitlementId, patch)
    },
  }
}

export function useLLMAccessSettingsModel(): LLMAccessSettingsModel {
  const stores = useLLMAccessStoreBindings()
  const profileForm = useProfileFormState()
  const [usageScope, setUsageScope] = useState('all')
  const isManager = canManageLLMAccess(stores.user)

  useInitialLLMAccessLoad({
    isManager,
    userId: stores.user?.id,
    usageScope,
    fetchSummary: stores.fetchSummary,
    fetchAccess: stores.accessStore.fetchAccess,
    fetchUserMemberships: stores.organizationStore.fetchUserMemberships,
  })
  useOrganizationMembersForProfileScope({
    isManager,
    scope: profileForm.scope,
    fetchMembers: stores.organizationStore.fetchMembers,
  })

  const loadState = getLLMAccessLoadState(stores)
  const derivedState = getDerivedAccessState(stores, profileForm.scope)
  const actions = createLLMAccessActions({
    stores,
    profileForm,
    usageScope,
    setUsageScope,
    isManager,
  })

  return {
    ...loadState,
    isManager,
    ...derivedState,
    usageScope,
    profileForm,
    ...actions,
  }
}
