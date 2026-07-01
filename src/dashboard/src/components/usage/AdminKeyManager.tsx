import { memo, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import {
  useDeploymentUsageKeyStore,
  type DeploymentUsageKey,
  type DeploymentUsageKeySource,
  type DeploymentUsageKeyVerifyResult,
  type ExternalProvider,
} from '@/stores/deploymentUsageKeys'

// ─────────────────────────────────────────────────────────────
// Static config (usage-capable providers only — no Gemini collector)
// ─────────────────────────────────────────────────────────────

const PROVIDERS: ExternalProvider[] = ['openai', 'anthropic', 'github_copilot']

const PROVIDER_LABELS: Record<ExternalProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  github_copilot: 'GitHub Copilot',
}

const PROVIDER_BADGE: Record<ExternalProvider, string> = {
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  anthropic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  github_copilot: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
}

/** Environment variable consulted as fallback per provider (for the operator hint). */
const PROVIDER_ENV_VAR: Record<ExternalProvider, string> = {
  openai: 'EXTERNAL_OPENAI_ADMIN_KEY',
  anthropic: 'EXTERNAL_ANTHROPIC_ADMIN_KEY',
  github_copilot: 'EXTERNAL_GITHUB_TOKEN',
}

const SOURCE_BADGE: Record<DeploymentUsageKeySource, string> = {
  db: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  env: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400',
}

const SOURCE_LABEL: Record<DeploymentUsageKeySource, string> = {
  db: 'DB key',
  env: 'Env fallback',
  none: 'Not configured',
}

const API_KEY_MIN = 10
const API_KEY_MAX = 1024
const LABEL_MAX = 255

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Look up a provider's key row, defaulting to a "none" state when absent. */
function resolveKey(keys: DeploymentUsageKey[], provider: ExternalProvider): DeploymentUsageKey {
  const found = keys.find((k) => k.provider === provider)
  if (found) return found
  return {
    provider,
    has_db_key: false,
    is_active: false,
    source: 'none',
    api_key_masked: null,
    label: null,
    last_verified_at: null,
    created_at: null,
    updated_at: null,
  }
}

const ProviderBadge = memo(({ provider }: { provider: ExternalProvider }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      PROVIDER_BADGE[provider]
    )}
  >
    {PROVIDER_LABELS[provider]}
  </span>
))
ProviderBadge.displayName = 'ProviderBadge'

const SourceBadge = memo(({ source }: { source: DeploymentUsageKeySource }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      SOURCE_BADGE[source]
    )}
    aria-label={`Key source: ${SOURCE_LABEL[source]}`}
  >
    {SOURCE_LABEL[source]}
  </span>
))
SourceBadge.displayName = 'SourceBadge'

/** Clickable active/inactive toggle for an existing DB key (design A5: toggle
 * collection on/off without re-entering the key). */
const ActiveToggle = memo(
  ({
    provider,
    isActive,
    disabled,
    onToggle,
  }: {
    provider: ExternalProvider
    isActive: boolean
    disabled: boolean
    onToggle: () => void
  }) => (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={`${PROVIDER_LABELS[provider]} 키 ${isActive ? '비활성화' : '활성화'}`}
      aria-pressed={isActive}
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        isActive
          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400'
      )}
    >
      {isActive ? '활성' : '비활성'}
    </button>
  )
)
ActiveToggle.displayName = 'ActiveToggle'

/** Map a verify result to an icon + message + tone (keeps the view render tiny). */
function describeVerify(
  result: DeploymentUsageKeyVerifyResult
): { icon: typeof ShieldCheck; text: string; tone: string; suffix: string | null } {
  if (result.is_valid && result.usage_capable) {
    return {
      icon: ShieldCheck,
      text: '사용 가능',
      tone: 'text-emerald-600 dark:text-emerald-400',
      suffix: result.latency_ms !== null ? `(${Math.round(result.latency_ms)}ms)` : null,
    }
  }
  if (result.is_valid && !result.usage_capable) {
    return {
      icon: AlertCircle,
      text: '키는 유효하나 usage 권한 없음',
      tone: 'text-yellow-700 dark:text-yellow-400',
      suffix: null,
    }
  }
  return {
    icon: XCircle,
    text: result.error_message ?? '검증 실패',
    tone: 'text-red-600 dark:text-red-400',
    suffix: result.status_code !== null ? `(${result.status_code})` : null,
  }
}

const VerifyResultView = memo(
  ({
    result,
    isVerifying,
  }: {
    result: DeploymentUsageKeyVerifyResult | null
    isVerifying: boolean
  }) => {
    if (isVerifying) {
      return (
        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          검증 중...
        </span>
      )
    }
    if (result === null) return null
    const { icon: Icon, text, tone, suffix } = describeVerify(result)
    return (
      <span role="status" className={cn('flex items-center gap-1 text-xs', tone)}>
        <Icon className="w-3.5 h-3.5" />
        {text}
        {suffix && <span className="text-gray-400 dark:text-gray-500">{suffix}</span>}
      </span>
    )
  }
)
VerifyResultView.displayName = 'VerifyResultView'

// ─────────────────────────────────────────────────────────────
// Add / edit form
// ─────────────────────────────────────────────────────────────

interface ProviderKeyFormProps {
  provider: ExternalProvider
  current: DeploymentUsageKey
  onClose: () => void
}

const KeyField = memo(
  ({
    provider,
    current,
    apiKey,
    setApiKey,
  }: {
    provider: ExternalProvider
    current: DeploymentUsageKey
    apiKey: string
    setApiKey: (v: string) => void
  }) => {
    const [showKey, setShowKey] = useState(false)
    const fieldId = `admin-key-${provider}-key`
    return (
      <div>
        <label htmlFor={fieldId} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
          API Key
          {current.has_db_key && (
            <span className="text-gray-400 dark:text-gray-500"> (비워두면 현재 키 유지)</span>
          )}
        </label>
        <div className="relative">
          <input
            id={fieldId}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={current.api_key_masked ?? 'sk-...'}
            autoComplete="off"
            aria-label={`${PROVIDER_LABELS[provider]} API key`}
            className="w-full px-2.5 py-1.5 pr-8 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? 'API 키 숨기기' : 'API 키 표시'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    )
  }
)
KeyField.displayName = 'KeyField'

const LabelField = memo(
  ({
    provider,
    label,
    setLabel,
  }: {
    provider: ExternalProvider
    label: string
    setLabel: (v: string) => void
  }) => {
    const fieldId = `admin-key-${provider}-label`
    return (
      <div>
        <label htmlFor={fieldId} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
          Label <span className="text-gray-400">(선택)</span>
        </label>
        <input
          id={fieldId}
          type="text"
          value={label}
          maxLength={LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. org-admin-key"
          aria-label={`${PROVIDER_LABELS[provider]} key label`}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }
)
LabelField.displayName = 'LabelField'

const FormActions = memo(({ isSaving, onClose }: { isSaving: boolean; onClose: () => void }) => (
  <div className="flex items-center justify-end gap-2 mt-3">
    <button
      type="button"
      onClick={onClose}
      disabled={isSaving}
      aria-label="취소"
      className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
    >
      <X className="w-3 h-3" />
      취소
    </button>
    <button
      type="submit"
      disabled={isSaving}
      aria-label="키 저장"
      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      저장
    </button>
  </div>
))
FormActions.displayName = 'FormActions'

/** Validate the api_key box: '' is allowed only when a key already exists (A5). */
function validateKeyInput(hasDbKey: boolean, trimmedKey: string): string | null {
  if (!hasDbKey && trimmedKey === '') return '새 키에는 API 키가 필요합니다'
  if (trimmedKey !== '' && (trimmedKey.length < API_KEY_MIN || trimmedKey.length > API_KEY_MAX)) {
    return `API 키는 ${API_KEY_MIN}~${API_KEY_MAX}자여야 합니다`
  }
  return null
}

function useProviderKeyForm(provider: ExternalProvider, current: DeploymentUsageKey, onClose: () => void) {
  const upsertKey = useDeploymentUsageKeyStore((s) => s.upsertKey)
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState(current.label ?? '')
  const [isActive, setIsActive] = useState(current.has_db_key ? current.is_active : true)
  const [isSaving, setIsSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedKey = apiKey.trim()
    const invalid = validateKeyInput(current.has_db_key, trimmedKey)
    if (invalid) return setLocalError(invalid)
    setLocalError(null)
    setIsSaving(true)
    const result = await upsertKey(provider, {
      api_key: trimmedKey || undefined,
      label: label.trim() || null,
      is_active: isActive,
    })
    setIsSaving(false)
    if (result) onClose()
    else setLocalError(useDeploymentUsageKeyStore.getState().error ?? '저장에 실패했습니다')
  }

  return { apiKey, setApiKey, label, setLabel, isActive, setIsActive, isSaving, localError, handleSubmit }
}

const ProviderKeyForm = memo(({ provider, current, onClose }: ProviderKeyFormProps) => {
  const f = useProviderKeyForm(provider, current, onClose)
  return (
    <form
      onSubmit={f.handleSubmit}
      className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg"
      aria-label={`${PROVIDER_LABELS[provider]} 키 설정 폼`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KeyField provider={provider} current={current} apiKey={f.apiKey} setApiKey={f.setApiKey} />
        <LabelField provider={provider} label={f.label} setLabel={f.setLabel} />
      </div>
      <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={f.isActive}
          onChange={(e) => f.setIsActive(e.target.checked)}
          aria-label="수집에 이 키 사용 (비활성화 시 환경변수 폴백)"
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        수집에 이 키 사용 (해제 시 환경변수로 폴백)
      </label>
      {f.localError && (
        <div
          role="alert"
          className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400"
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {f.localError}
        </div>
      )}
      <FormActions isSaving={f.isSaving} onClose={onClose} />
    </form>
  )
})
ProviderKeyForm.displayName = 'ProviderKeyForm'

// ─────────────────────────────────────────────────────────────
// Provider row
// ─────────────────────────────────────────────────────────────

const RowInfo = memo(
  ({ providerKey, onToggle, toggling }: {
    providerKey: DeploymentUsageKey
    onToggle: () => void
    toggling: boolean
  }) => {
    const { provider, has_db_key, is_active, source, api_key_masked } = providerKey
    return (
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <ProviderBadge provider={provider} />
          <SourceBadge source={source} />
          {has_db_key && (
            <ActiveToggle
              provider={provider}
              isActive={is_active}
              disabled={toggling}
              onToggle={onToggle}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1 pl-6">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
            {api_key_masked ?? '미설정'}
          </span>
          {source === 'env' && (
            <span className="text-xs text-yellow-700 dark:text-yellow-400">
              환경변수 사용 중 ({PROVIDER_ENV_VAR[provider]})
            </span>
          )}
        </div>
      </div>
    )
  }
)
RowInfo.displayName = 'RowInfo'

const RowActions = memo(
  ({ providerKey, result, isVerifying, isRemoving, onEdit, onVerify, onRemove }: {
    providerKey: DeploymentUsageKey
    result: DeploymentUsageKeyVerifyResult | null
    isVerifying: boolean
    isRemoving: boolean
    onEdit: () => void
    onVerify: () => void
    onRemove: () => void
  }) => {
    const { provider, has_db_key, source } = providerKey
    return (
      <div className="flex flex-wrap items-center gap-2 pl-6 sm:pl-0">
        <VerifyResultView result={result} isVerifying={isVerifying} />
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${PROVIDER_LABELS[provider]} 키 ${has_db_key ? '수정' : '설정'}`}
          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {has_db_key ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {has_db_key ? '수정' : '설정'}
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={isVerifying || source === 'none'}
          aria-label={`${PROVIDER_LABELS[provider]} 키 검증`}
          className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
        </button>
        {has_db_key && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            aria-label={`${PROVIDER_LABELS[provider]} 키 삭제`}
            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    )
  }
)
RowActions.displayName = 'RowActions'

function failedVerify(provider: ExternalProvider): DeploymentUsageKeyVerifyResult {
  return {
    provider,
    is_valid: false,
    usage_capable: false,
    status_code: null,
    error_message: '검증 요청 실패',
    latency_ms: null,
  }
}

function useProviderKeyRow(providerKey: DeploymentUsageKey) {
  const verifyKey = useDeploymentUsageKeyStore((s) => s.verifyKey)
  const removeKey = useDeploymentUsageKeyStore((s) => s.removeKey)
  const upsertKey = useDeploymentUsageKeyStore((s) => s.upsertKey)
  const [isEditing, setIsEditing] = useState(false)
  const [verifyResult, setVerifyResult] = useState<DeploymentUsageKeyVerifyResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const { provider } = providerKey

  const handleVerify = async () => {
    setVerifyResult(null)
    setIsVerifying(true)
    const result = await verifyKey(provider)
    setVerifyResult(result ?? failedVerify(provider))
    setIsVerifying(false)
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    await removeKey(provider)
    setIsRemoving(false)
    setVerifyResult(null)
  }

  const handleToggle = async () => {
    setIsToggling(true)
    await upsertKey(provider, { is_active: !providerKey.is_active })
    setIsToggling(false)
  }

  return {
    isEditing,
    setIsEditing,
    verifyResult,
    isVerifying,
    isRemoving,
    isToggling,
    handleVerify,
    handleRemove,
    handleToggle,
  }
}

const ProviderKeyRow = memo(({ providerKey }: { providerKey: DeploymentUsageKey }) => {
  const r = useProviderKeyRow(providerKey)
  return (
    <li className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <RowInfo providerKey={providerKey} onToggle={r.handleToggle} toggling={r.isToggling} />
        <RowActions
          providerKey={providerKey}
          result={r.verifyResult}
          isVerifying={r.isVerifying}
          isRemoving={r.isRemoving}
          onEdit={() => r.setIsEditing((v) => !v)}
          onVerify={r.handleVerify}
          onRemove={r.handleRemove}
        />
      </div>
      {r.isEditing && (
        <ProviderKeyForm
          provider={providerKey.provider}
          current={providerKey}
          onClose={() => r.setIsEditing(false)}
        />
      )}
    </li>
  )
})
ProviderKeyRow.displayName = 'ProviderKeyRow'

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export interface AdminKeyManagerProps {
  /** Additional CSS classes for the outer container. */
  className?: string
}

const KeyList = memo(
  ({ keys, isLoading }: { keys: DeploymentUsageKey[]; isLoading: boolean }) => {
    if (isLoading && keys.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400 dark:text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          키 정보를 불러오는 중...
        </div>
      )
    }
    return (
      <ul className="mt-2">
        {PROVIDERS.map((provider) => (
          <ProviderKeyRow key={provider} providerKey={resolveKey(keys, provider)} />
        ))}
      </ul>
    )
  }
)
KeyList.displayName = 'KeyList'

const ManagedKeysContent = memo(
  ({
    keys,
    isLoading,
    error,
  }: {
    keys: DeploymentUsageKey[]
    isLoading: boolean
    error: string | null
  }) => (
    <>
      <p className="px-4 pt-3 text-xs text-gray-500 dark:text-gray-400">
        provider별 usage 수집 키를 설정합니다. DB 키가 없으면 환경변수로 폴백합니다.
      </p>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 mx-4 mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <KeyList keys={keys} isLoading={isLoading} />
      <div className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
        Verify는 실제 usage 엔드포인트 접근 권한(usage_capable)을 확인합니다.
      </div>
    </>
  )
)
ManagedKeysContent.displayName = 'ManagedKeysContent'

/**
 * Admin/manager-only manager for deployment-level usage admin keys.
 *
 * Replaces the read-only environment-variable guide on the External Usage page.
 * Lets admins/managers set, verify (usage-capability), toggle, and delete the
 * per-provider keys that drive usage collection. Non-privileged users see a
 * read-only notice and no key data is fetched.
 */
export const AdminKeyManager = memo<AdminKeyManagerProps>(({ className }) => {
  const user = useAuthStore((s) => s.user)
  const keys = useDeploymentUsageKeyStore((s) => s.keys)
  const isLoading = useDeploymentUsageKeyStore((s) => s.isLoading)
  const error = useDeploymentUsageKeyStore((s) => s.error)
  const fetchKeys = useDeploymentUsageKeyStore((s) => s.fetchKeys)

  const role = user?.role ?? (user?.is_admin ? 'admin' : 'user')
  const canManage = role === 'admin' || role === 'manager' || (user?.is_admin ?? false)

  useEffect(() => {
    if (canManage) fetchKeys()
  }, [canManage, fetchKeys])

  return (
    <section
      aria-label="Usage admin key 관리"
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden',
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <KeyRound className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Usage Admin Keys</h2>
      </div>

      {!canManage ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
          <Lock className="w-4 h-4 flex-shrink-0" />
          관리자 또는 매니저만 usage admin 키를 설정할 수 있습니다.
        </div>
      ) : (
        <ManagedKeysContent keys={keys} isLoading={isLoading} error={error} />
      )}
    </section>
  )
})

AdminKeyManager.displayName = 'AdminKeyManager'
