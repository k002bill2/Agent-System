import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  useLLMCredentialStore,
  type LLMCredential,
  type LLMCredentialCreate,
  type VerifyResult,
} from '../../stores/llmCredentials'

type Provider = 'openai' | 'google_gemini' | 'anthropic'

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  google_gemini: 'Google Gemini',
  anthropic: 'Anthropic',
}

const PROVIDER_BADGE: Record<Provider, string> = {
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  google_gemini: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  anthropic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const PROVIDERS: Provider[] = ['openai', 'google_gemini', 'anthropic']

const EMPTY_FORM: LLMCredentialCreate = {
  provider: 'openai',
  key_name: '',
  api_key: '',
}

function ProviderBadge({ provider }: { provider: Provider }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_BADGE[provider]}`}
    >
      {PROVIDER_LABELS[provider]}
    </span>
  )
}

function VerifyStatus({
  result,
  isVerifying,
}: {
  result: VerifyResult | null
  isVerifying: boolean
}) {
  if (isVerifying) {
    return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
  }
  if (result === null) return null
  if (result.is_valid) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="w-4 h-4" />
        Valid
        {result.latency_ms !== null && (
          <span className="text-gray-400 dark:text-gray-500">({result.latency_ms}ms)</span>
        )}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
      <XCircle className="w-4 h-4" />
      {result.error_message ?? 'Invalid'}
    </span>
  )
}

function CredentialRow({
  cred,
  onRemove,
  onVerify,
}: {
  cred: LLMCredential
  onRemove: (id: string) => void
  onVerify: (id: string) => void
}) {
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleVerify = async () => {
    setIsVerifying(true)
    setVerifyResult(null)
    await onVerify(cred.id)
    // result comes back via store; we set it from the parent callback
    setIsVerifying(false)
  }

  const handleVerifyWithResult = async () => {
    setIsVerifying(true)
    setVerifyResult(null)
    // We call the store directly here for the result
    const store = useLLMCredentialStore.getState()
    const result = await store.verifyCredential(cred.id)
    setVerifyResult(result)
    setIsVerifying(false)
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    onRemove(cred.id)
  }

  void handleVerify

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <Key className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {cred.key_name}
          </span>
          <ProviderBadge provider={cred.provider} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
            {cred.api_key_masked}
          </span>
          {cred.last_verified_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Verified {new Date(cred.last_verified_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <VerifyStatus result={verifyResult} isVerifying={isVerifying} />
        <button
          onClick={handleVerifyWithResult}
          disabled={isVerifying || isRemoving}
          className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Verify'}
        </button>
        <button
          onClick={handleRemove}
          disabled={isRemoving}
          className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Remove key"
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}

function AddKeyForm({ onClose }: { onClose: () => void }) {
  const { addCredential, error } = useLLMCredentialStore()
  const [form, setForm] = useState<LLMCredentialCreate>(EMPTY_FORM)
  const [showKey, setShowKey] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.key_name.trim()) {
      setLocalError('Key name is required')
      return
    }
    if (!form.api_key.trim()) {
      setLocalError('API key is required')
      return
    }
    setLocalError(null)
    setIsSubmitting(true)
    const result = await addCredential({
      provider: form.provider,
      key_name: form.key_name.trim(),
      api_key: form.api_key.trim(),
    })
    setIsSubmitting(false)
    if (result) {
      onClose()
    }
  }

  const displayError = localError ?? error

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700"
    >
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add API Key</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Provider</label>
          <select
            value={form.provider}
            onChange={e => setForm(f => ({ ...f, provider: e.target.value as Provider }))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PROVIDERS.map(p => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Key Name</label>
          <input
            type="text"
            placeholder="e.g. production-key"
            value={form.key_name}
            onChange={e => setForm(f => ({ ...f, key_name: e.target.value }))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {displayError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mb-3">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {displayError}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add Key
        </button>
      </div>
    </form>
  )
}

export function LLMAccountsSettings() {
  const { credentials, isLoading, error, fetchCredentials, removeCredential } =
    useLLMCredentialStore()
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const handleRemove = async (id: string) => {
    await removeCredential(id)
  }

  const handleVerify = async (_id: string) => {
    // Verification is handled inline in CredentialRow via store.verifyCredential
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">LLM API Keys</h3>
          {credentials.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded">
              {credentials.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Key
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && <AddKeyForm onClose={() => setShowAddForm(false)} />}

      {/* Content */}
      {isLoading && credentials.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-gray-400 dark:text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading credentials...</span>
        </div>
      ) : error && credentials.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
          <Key className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No API keys registered</p>
          <p className="text-xs mt-1">Add your LLM provider keys to enable usage tracking</p>
        </div>
      ) : (
        <div>
          {credentials.map(cred => (
            <CredentialRow
              key={cred.id}
              cred={cred}
              onRemove={handleRemove}
              onVerify={handleVerify}
            />
          ))}
        </div>
      )}
    </div>
  )
}
