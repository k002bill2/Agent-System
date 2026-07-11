/**
 * Model Management Panel (admin only)
 * Lists all LLM models grouped by provider and lets admins enable/disable
 * models or set a provider default. Backend enforces admin auth on PATCH.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Loader2, Star, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { useAuthStore, authFetch } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ManagedModel {
  id: string
  display_name: string
  provider: string
  context_window: number
  pricing: { input: number; output: number }
  available: boolean
  is_default: boolean
  supports_tools: boolean
  supports_vision: boolean
  is_enabled: boolean
}

type PatchBody = { is_enabled: boolean } | { is_default: true }

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI (GPT)',
  codex_cli: 'Codex CLI',
  ollama: 'Ollama (Local)',
}

const SESSION_ERROR = '세션이 만료되었습니다. 다시 로그인해 주세요.'
const ADMIN_ERROR = 'Admin 권한이 없습니다.'
const LOAD_ERROR = '모델 목록을 불러오지 못했습니다.'
const UPDATE_ERROR = '모델 업데이트에 실패했습니다.'
const DELETE_ERROR = '모델 삭제에 실패했습니다.'
const DEFAULT_TOGGLE_HINT = 'default 모델은 먼저 다른 모델로 default를 이관하세요'

// authFetch throws this exact message when a pre-request token refresh fails (auth.ts).
const SESSION_EXPIRED_THROW = 'Session expired. Please login again.'

// FastAPI errors return { detail: "..." }; read it defensively so a 409 can surface
// the backend's explanation (e.g. "Cannot delete default model ...") verbatim.
const readErrorDetail = async (res: Response): Promise<string | null> => {
  try {
    const data = await res.json()
    return typeof data?.detail === 'string' ? data.detail : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

const ModelManagementPanel = memo(function ModelManagementPanel() {
  const user = useAuthStore((s) => s.user)
  const fetchModels = useSettingsStore((s) => s.fetchModels)
  // Target the admin-configured backend (same source as settings.fetchModels), so changing
  // the Backend URL in Settings re-points this panel too instead of a build-time base URL.
  const backendUrl = useSettingsStore((s) => s.backendUrl)

  const isAdmin = !!user && (user.is_admin || user.role === 'admin')

  const [models, setModels] = useState<ManagedModel[]>([])
  const [loading, setLoading] = useState(true)
  // Split so a concurrent mutation's refetch never clears another mutation's error,
  // and a load failure never clobbers an action error (independent providers mutate in parallel).
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  // Disabled models are noise by default (auto-discovered legacy models); hide them
  // until the admin opts in via the header toggle.
  const [showDisabled, setShowDisabled] = useState(false)

  // Generation guards for out-of-order refetch races (independent providers mutate in
  // parallel, so their refetches can complete out of order):
  //  • loadGenRef      — the newest load() dispatched (drives "is this the latest request").
  //  • committedGenRef — the newest generation whose success was committed to state.
  const loadGenRef = useRef(0)
  const committedGenRef = useRef(0)

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current
    // `loading` drives the full-panel spinner and is only ever cleared here, so it
    // shows on the initial mount only — refetches (after a mutation) update the list
    // in place, keeping other rows interactive and their per-row pending state visible.
    // Only loadError is touched here so a refetch can't erase a mutation's actionError.
    setLoadError(null)
    try {
      const res = await fetch(`${backendUrl}/api/llm/models?include_disabled=true`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Monotonic success commit: only a strictly newer result may overwrite the list, so a
      // slow/stale GET can never clobber fresher committed state. A successful commit also
      // clears any load error — a valid response is rescued even if a newer request failed
      // first (that failure must not discard the only good data).
      if (gen > committedGenRef.current) {
        committedGenRef.current = gen
        setModels(data.models ?? [])
        setLoadError(null)
      }
    } catch {
      // Surface the failure only for the newest in-flight request; a stale failure must
      // never mask a successful commit from a concurrent refetch.
      if (gen === loadGenRef.current) setLoadError(LOAD_ERROR)
    } finally {
      // Clear the initial-mount spinner once this request either committed a result
      // (committedGenRef advanced to gen) or is the newest in-flight load to settle.
      if (gen === committedGenRef.current || gen === loadGenRef.current) setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin, load])

  const patchModel = useCallback(
    async (id: string, body: PatchBody) => {
      setPending((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setActionError(null)
      try {
        const res = await authFetch(`${backendUrl}/api/llm/models/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        // authFetch already retried token refresh: a remaining 401 means re-login,
        // 403 means the account lacks admin (re-login won't help).
        if (res.status === 401) {
          setActionError(SESSION_ERROR)
          return
        }
        if (res.status === 403) {
          setActionError(ADMIN_ERROR)
          return
        }
        if (!res.ok) {
          setActionError(UPDATE_ERROR)
          return
        }
        // Refetch the panel list (server unsets sibling defaults) + sync global catalog.
        await load()
        await fetchModels()
      } catch (err) {
        // authFetch throws (not returns) when a pre-request token refresh fails.
        setActionError(
          err instanceof Error && err.message === SESSION_EXPIRED_THROW
            ? SESSION_ERROR
            : UPDATE_ERROR
        )
      } finally {
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [load, fetchModels, backendUrl]
  )

  const handleToggle = useCallback(
    (model: ManagedModel) => patchModel(model.id, { is_enabled: !model.is_enabled }),
    [patchModel]
  )

  const handleSetDefault = useCallback(
    (model: ManagedModel) => patchModel(model.id, { is_default: true }),
    [patchModel]
  )

  // Permanently delete a disabled, non-default model. The backend removes the config row
  // and records a suppression so startup sync / discovery can't re-register it. Reuses the
  // same pending/actionError plumbing as patchModel; only offered for disabled non-default
  // rows (the backend 409s on a default model, so we never expose Delete there).
  const deleteModel = useCallback(
    async (model: ManagedModel) => {
      if (
        !window.confirm(
          `Delete model "${model.id}"? It will be suppressed so startup sync and discovery cannot re-register it.`
        )
      ) {
        return
      }
      setPending((prev) => {
        const next = new Set(prev)
        next.add(model.id)
        return next
      })
      setActionError(null)
      try {
        const res = await authFetch(`${backendUrl}/api/llm/models/${encodeURIComponent(model.id)}`, {
          method: 'DELETE',
        })
        if (res.status === 401) {
          setActionError(SESSION_ERROR)
          return
        }
        if (res.status === 403) {
          setActionError(ADMIN_ERROR)
          return
        }
        if (res.status === 409) {
          // is_default rejection (or similar conflict) — surface the backend's explanation.
          setActionError((await readErrorDetail(res)) ?? DELETE_ERROR)
          return
        }
        if (!res.ok) {
          setActionError(DELETE_ERROR)
          return
        }
        // Refetch the panel list (row is gone) + sync the global catalog.
        await load()
        await fetchModels()
      } catch (err) {
        // authFetch throws (not returns) when a pre-request token refresh fails.
        setActionError(
          err instanceof Error && err.message === SESSION_EXPIRED_THROW
            ? SESSION_ERROR
            : DELETE_ERROR
        )
      } finally {
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(model.id)
          return next
        })
      }
    },
    [load, fetchModels, backendUrl]
  )

  // Count only the models the toggle actually hides. A disabled *default* is an anomaly
  // that stays visible regardless, so it must not inflate the count or force the toggle on.
  const disabledCount = useMemo(
    () => models.filter((m) => !m.is_enabled && !m.is_default).length,
    [models]
  )

  // Group by provider, preserving the order in which providers appear in the response.
  // When disabled models are hidden, drop them from their groups so a provider with only
  // disabled models disappears entirely. Exception: a disabled *default* row is an anomaly
  // that must stay visible so the admin can recover it (re-enable / re-assign default).
  const groups = useMemo(() => {
    const map = new Map<string, ManagedModel[]>()
    for (const model of models) {
      const visible = showDisabled || model.is_enabled || (model.is_default && !model.is_enabled)
      if (!visible) continue
      const existing = map.get(model.provider)
      if (existing) existing.push(model)
      else map.set(model.provider, [model])
    }
    return Array.from(map.entries())
  }, [models, showDisabled])

  // Providers with any in-flight mutation. "default" is a provider-level invariant,
  // so any pending request in a provider must lock every default-change button there.
  const pendingProviders = useMemo(() => {
    const set = new Set<string>()
    for (const model of models) {
      if (pending.has(model.id)) set.add(model.provider)
    }
    return set
  }, [models, pending])

  if (!isAdmin) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Boxes className="w-5 h-5" />
          Model Management
        </h3>
        {disabledCount > 0 && (
          <button
            onClick={() => setShowDisabled((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
            aria-label={
              showDisabled ? 'Hide disabled models' : `Show disabled models (${disabledCount})`
            }
          >
            {showDisabled ? 'Hide disabled' : `Show disabled (${disabledCount})`}
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {loadError}
        </div>
      )}

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" aria-label="Loading models" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
          No models available
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([provider, providerModels]) => (
            <section key={provider}>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {PROVIDER_LABELS[provider] ?? provider}
              </div>
              <div className="space-y-2">
                {providerModels.map((model) => {
                  const isPending = pending.has(model.id)
                  // Only block disabling an *enabled* default (keeps the provider from
                  // losing its only default); a disabled default can still be re-enabled.
                  const toggleDisabled = (model.is_default && model.is_enabled) || isPending
                  const setDefaultDisabled = isPending || pendingProviders.has(model.provider)
                  return (
                    <div
                      key={model.id}
                      className={cn(
                        'flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700',
                        !model.is_enabled && 'opacity-60'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                            {model.display_name}
                          </span>
                          {model.is_default && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                              <Star className="w-3 h-3" />
                              Default
                            </span>
                          )}
                          {!model.is_enabled && (
                            <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded">
                              Disabled
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-mono truncate">{model.id}</span>
                          <span>
                            ${model.pricing.input}/${model.pricing.output} per 1K
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {model.is_enabled && !model.is_default && (
                          <button
                            onClick={() => handleSetDefault(model)}
                            disabled={setDefaultDisabled}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Set ${model.id} as default`}
                          >
                            <Star className="w-3.5 h-3.5" />
                            Set default
                          </button>
                        )}
                        <button
                          onClick={() => handleToggle(model)}
                          disabled={toggleDisabled}
                          title={
                            model.is_default && model.is_enabled ? DEFAULT_TOGGLE_HINT : undefined
                          }
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={`${model.is_enabled ? 'Disable' : 'Enable'} ${model.id}`}
                        >
                          {model.is_enabled ? (
                            <>
                              <ToggleRight className="w-4 h-4" />
                              Disable
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4" />
                              Enable
                            </>
                          )}
                        </button>
                        {/* Delete is offered only for disabled non-default rows: enabled models
                            must be disabled first, and the backend 409s on a default model. */}
                        {!model.is_enabled && !model.is_default && (
                          <button
                            onClick={() => deleteModel(model)}
                            disabled={isPending}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Delete ${model.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
})

ModelManagementPanel.displayName = 'ModelManagementPanel'

export { ModelManagementPanel }
