import type {
  LLMCLIProfile,
  LLMCLIProfileCreate,
  LLMCLIProfileUpdate,
  LLMEntitlement,
} from '@/stores/llmAccess'
import type {
  LLMUsageBreakdown,
  LLMUsageSummary,
} from '@/stores/llmUsage'
import type { OrganizationMember } from '@/stores/organizations'

export const MODE_ORDER = ['cli', 'api', 'local'] as const
export const SANDBOX_PRESETS = [
  'none',
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const
export const DEFAULT_CLI_COMMAND = 'codex'
export const DEFAULT_CLI_ARGS = 'exec --color never'

// CLI execution providers selectable when creating a profile. The `value` is the
// backend enum literal (snake_case) sent verbatim as the profile `provider`.
export const CLI_PROVIDER_OPTIONS = [
  { value: 'codex_cli', label: 'Codex CLI' },
  { value: 'claude_cli', label: 'Claude CLI' },
] as const

// Per-provider default command/args prefilled into the create form. Mirrors each
// provider's backend env defaults (CODEX_CLI_* / CLAUDE_CLI_*) so a new profile is
// coherent with its provider; the user can still override before creating.
export const CLI_PROVIDER_DEFAULTS: Record<string, { command: string; args: string }> = {
  codex_cli: { command: DEFAULT_CLI_COMMAND, args: DEFAULT_CLI_ARGS },
  claude_cli: { command: 'claude', args: '-p --output-format text' },
}

export type SandboxPreset = (typeof SANDBOX_PRESETS)[number]

export function formatCompactNumber(value: number | null | undefined): string {
  const safeValue = value ?? 0
  if (safeValue >= 1_000_000) {
    return `${(safeValue / 1_000_000).toFixed(safeValue >= 10_000_000 ? 0 : 1)}M`
  }
  if (safeValue >= 1_000) {
    return `${(safeValue / 1_000).toFixed(safeValue >= 10_000 ? 0 : 1)}K`
  }
  return safeValue.toLocaleString()
}

export function formatCost(value: number | null | undefined): string {
  return `$${(value ?? 0).toFixed(2)}`
}

export function isPersistedEntitlement(entitlement: LLMEntitlement): boolean {
  return !entitlement.id.startsWith('default-')
}

export function canManageLLMAccess(user: {
  role?: string
  is_admin?: boolean
  is_org_admin?: boolean
} | null): boolean {
  return Boolean(
    user &&
      (user.is_admin ||
        user.is_org_admin ||
        user.role === 'admin' ||
        user.role === 'manager'),
  )
}

export function splitArgs(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function applySandboxPreset(args: string[], preset: string): string[] {
  const cleaned: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--sandbox') {
      index += 1
      continue
    }
    if (token.startsWith('--sandbox=')) continue
    cleaned.push(token)
  }
  return preset === 'none' ? cleaned : [...cleaned, '--sandbox', preset]
}

export function getProfileSandboxPreset(profile: LLMCLIProfile): string {
  const metadataPreset = profile.metadata.sandbox_preset
  if (
    typeof metadataPreset === 'string' &&
    SANDBOX_PRESETS.includes(metadataPreset as SandboxPreset)
  ) {
    return metadataPreset
  }

  for (let index = 0; index < profile.args_json.length; index += 1) {
    const token = profile.args_json[index]
    if (token === '--sandbox') {
      return profile.args_json[index + 1] ?? 'none'
    }
    if (token.startsWith('--sandbox=')) {
      return token.slice('--sandbox='.length) || 'none'
    }
  }
  return 'none'
}

export function uniqueOrganizationMemberships(
  memberships: OrganizationMember[],
): OrganizationMember[] {
  const seen = new Set<string>()
  return memberships.filter(membership => {
    if (seen.has(membership.organization_id)) return false
    seen.add(membership.organization_id)
    return true
  })
}

export function getBreakdown(
  summary: LLMUsageSummary | null,
  key: string,
): LLMUsageBreakdown {
  return (
    summary?.mode_breakdown[key] ?? {
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
    }
  )
}

export function buildCLIProfileCreatePayload({
  activeProvider,
  profileName,
  command,
  args,
  sandboxPreset,
  scope,
  ownerUserId,
  workingDirectory,
}: {
  activeProvider: string
  profileName: string
  command: string
  args: string
  sandboxPreset: string
  scope: string
  ownerUserId: string | null
  workingDirectory: string
}): LLMCLIProfileCreate {
  const payload: LLMCLIProfileCreate = {
    provider: activeProvider,
    profile_name: profileName,
    command,
    args_json: applySandboxPreset(splitArgs(args), sandboxPreset),
  }
  if (scope === 'personal') {
    if (ownerUserId) {
      payload.owner_user_id = ownerUserId
    }
  } else {
    payload.organization_id = scope
    if (ownerUserId) {
      payload.owner_user_id = ownerUserId
    }
  }
  if (workingDirectory) {
    payload.working_directory = workingDirectory
  }
  if (sandboxPreset !== 'none') {
    payload.metadata = { sandbox_preset: sandboxPreset }
  }
  return payload
}

export function buildCLIProfileRuntimeUpdatePayload({
  profile,
  workingDirectory,
  sandboxPreset,
}: {
  profile: LLMCLIProfile
  workingDirectory: string
  sandboxPreset: string
}): LLMCLIProfileUpdate {
  const metadata = { ...profile.metadata }
  if (sandboxPreset === 'none') {
    delete metadata.sandbox_preset
  } else {
    metadata.sandbox_preset = sandboxPreset
  }

  return {
    working_directory: workingDirectory.trim() || null,
    args_json: applySandboxPreset(profile.args_json, sandboxPreset),
    metadata,
  }
}
