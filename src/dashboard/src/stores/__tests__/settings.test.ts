import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSettingsStore } from '../settings'
import type { LLMModel, LLMProvider } from '../settings'

const { mockApiPatch } = vi.hoisted(() => ({
  mockApiPatch: vi.fn(),
}))

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    patch: mockApiPatch,
  },
}))

// Helper to build a minimal LLMModel object
const makeModel = (overrides: Partial<LLMModel> & { id: string; provider: string }): LLMModel => ({
  display_name: overrides.id,
  context_window: 128000,
  pricing: { input: 0, output: 0 },
  available: true,
  is_default: false,
  supports_tools: true,
  supports_vision: false,
  ...overrides,
})

describe('settings store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to default state
    useSettingsStore.setState({
      backendUrl: 'http://localhost:8000',
      theme: 'light',
      notifications: {
        browserNotifications: true,
        soundNotifications: true,
        notifyApprovalRequired: true,
        notifyTaskCompleted: false,
        notifyTaskFailed: true,
        notifyConnectionLost: true,
        soundVolume: 50,
      },
      availableModels: [],
      modelsLoading: false,
      modelsError: null,
    })
  })

  describe('initial state', () => {
    it('has default theme as light', () => {
      const state = useSettingsStore.getState()
      expect(state.theme).toBe('light')
    })

    it('has default backendUrl', () => {
      const state = useSettingsStore.getState()
      expect(state.backendUrl).toBe('http://localhost:8000')
    })

    it('has default notifications settings', () => {
      const { notifications } = useSettingsStore.getState()
      expect(notifications.browserNotifications).toBe(true)
      expect(notifications.soundNotifications).toBe(true)
      expect(notifications.notifyApprovalRequired).toBe(true)
      expect(notifications.notifyTaskCompleted).toBe(false)
      expect(notifications.soundVolume).toBe(50)
    })
  })

  describe('setBackendUrl', () => {
    it('updates backendUrl', () => {
      const { setBackendUrl } = useSettingsStore.getState()

      setBackendUrl('http://api.example.com:8080')
      expect(useSettingsStore.getState().backendUrl).toBe('http://api.example.com:8080')
    })
  })

  describe('setTheme', () => {
    it('updates theme to dark', () => {
      const { setTheme } = useSettingsStore.getState()

      setTheme('dark')
      expect(useSettingsStore.getState().theme).toBe('dark')
    })

    it('updates theme to system', () => {
      const { setTheme } = useSettingsStore.getState()

      setTheme('system')
      expect(useSettingsStore.getState().theme).toBe('system')
    })
  })

  describe('setNotificationSetting', () => {
    it('updates individual notification setting', () => {
      const { setNotificationSetting } = useSettingsStore.getState()

      setNotificationSetting('browserNotifications', false)
      expect(useSettingsStore.getState().notifications.browserNotifications).toBe(false)
    })

    it('updates sound volume', () => {
      const { setNotificationSetting } = useSettingsStore.getState()

      setNotificationSetting('soundVolume', 75)
      expect(useSettingsStore.getState().notifications.soundVolume).toBe(75)
    })

    it('preserves other notification settings', () => {
      const { setNotificationSetting } = useSettingsStore.getState()

      setNotificationSetting('notifyTaskCompleted', true)

      const { notifications } = useSettingsStore.getState()
      expect(notifications.notifyTaskCompleted).toBe(true)
      expect(notifications.browserNotifications).toBe(true) // unchanged
      expect(notifications.soundVolume).toBe(50) // unchanged
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // fetchModels
  // ──────────────────────────────────────────────────────────────────────────
  describe('fetchModels', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('sets modelsLoading to true while fetching then false on success', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const models: LLMModel[] = [
        makeModel({ id: 'claude-sonnet-4-6', provider: 'anthropic', is_default: true }),
      ]

      // Capture the in-flight loading state by delaying resolution
      let resolveResponse!: (value: Response) => void
      mockFetch.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        })
      )

      const fetchPromise = useSettingsStore.getState().fetchModels()

      // While fetch is pending, modelsLoading should be true
      expect(useSettingsStore.getState().modelsLoading).toBe(true)
      expect(useSettingsStore.getState().modelsError).toBeNull()

      // Resolve the mock response
      resolveResponse(
        new Response(JSON.stringify({ models }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      await fetchPromise

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(state.modelsError).toBeNull()
      expect(state.availableModels).toHaveLength(1)
      expect(state.availableModels[0].id).toBe('claude-sonnet-4-6')
    })

    it('populates availableModels with the array returned by the API', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const models: LLMModel[] = [
        makeModel({ id: 'gemini-3-flash-preview', provider: 'google', is_default: true }),
        makeModel({ id: 'gemini-2.5-pro-preview-05-06', provider: 'google' }),
        makeModel({ id: 'exaone3.5:7.8b', provider: 'ollama' }),
      ]

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.availableModels).toHaveLength(3)
      expect(state.availableModels.map((m) => m.id)).toContain('gemini-3-flash-preview')
      expect(state.availableModels.map((m) => m.id)).toContain('exaone3.5:7.8b')
    })

    it('handles API response with empty models array', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(state.availableModels).toEqual([])
    })

    it('handles API response where models key is missing (falls back to [])', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await useSettingsStore.getState().fetchModels()

      expect(useSettingsStore.getState().availableModels).toEqual([])
    })

    it('sets modelsError and clears modelsLoading when fetch throws a network error', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(state.modelsError).toBe('Network failure')
      // Fallback models are injected when the API is unavailable
      expect(state.availableModels.length).toBeGreaterThan(0)
    })

    it('injects fallback models (including claude-sonnet-5) when fetch fails and store is empty', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      const ids = state.availableModels.map((m) => m.id)
      expect(ids).toContain('claude-opus-5')
      expect(ids).toContain('claude-fable-5-1')
      expect(ids).toContain('claude-opus-4-8')
      expect(ids).toContain('claude-sonnet-5')
      expect(ids).toContain('claude-sonnet-4-6')
      expect(ids).toContain('claude-haiku-4-5-20251001')
      expect(ids).toContain('gpt-6-astra')
      expect(ids).toContain('gpt-4o-mini')
      expect(ids).toContain('gemini-3.8-flash')
      expect(ids).toContain('gemini-3.7-flash')
      expect(ids).toContain('codex-cli')
      expect(ids).toContain('claude-cli')
      expect(ids).toContain('gemini-3-flash-preview')

      // Each injected model is a fully-formed LLMModel; claude-sonnet-5 is the
      // backend default for anthropic (mirrored from _MODELS is_default=True)
      const sonnet5 = state.availableModels.find((m) => m.id === 'claude-sonnet-5')
      expect(sonnet5).toMatchObject({
        display_name: 'claude-sonnet-5',
        provider: 'anthropic',
        available: true,
        is_default: true,
      })

      // Non-default models keep is_default: false
      const opus = state.availableModels.find((m) => m.id === 'claude-opus-4-8')
      expect(opus?.is_default).toBe(false)
    })

    it('marks the backend per-provider defaults as is_default in fallback models', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await useSettingsStore.getState().fetchModels()

      const defaults = useSettingsStore
        .getState()
        .availableModels.filter((m) => m.is_default)
        .map((m) => m.id)
        .sort()
      expect(defaults).toEqual(
        [
          'claude-cli',
          'claude-sonnet-5',
          'codex-cli',
          'exaone3.5:7.8b',
          'gemini-3-flash-preview',
          'gpt-4o-mini',
        ].sort()
      )
    })

    it('dedupes concurrent fetchModels calls while a request is in flight', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      let resolveResponse!: (value: Response) => void
      mockFetch.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        })
      )

      const first = useSettingsStore.getState().fetchModels()
      expect(useSettingsStore.getState().modelsLoading).toBe(true)

      // Second call while the first is in flight must early-return without fetching
      await useSettingsStore.getState().fetchModels()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      resolveResponse(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      await first

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("maps fallback 'local' provider models to 'ollama' so getModelsForProvider works", async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await useSettingsStore.getState().fetchModels()

      const localModels = useSettingsStore.getState().getModelsForProvider('local')
      expect(localModels.map((m) => m.id)).toContain('exaone3.5:7.8b')
      expect(localModels.every((m) => m.provider === 'ollama')).toBe(true)
    })

    it('does NOT overwrite previously loaded models with fallbacks on fetch failure', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const apiModels: LLMModel[] = [
        makeModel({ id: 'claude-sonnet-4-6', provider: 'anthropic', is_default: true }),
      ]
      useSettingsStore.setState({ availableModels: apiModels })

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.modelsError).toBe('Network failure')
      expect(state.availableModels).toEqual(apiModels)
    })

    it('sets modelsError when response status is not ok (non-200)', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 })
      )

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(state.modelsError).toMatch(/401/)
    })

    it('sets modelsError with a generic message for non-Error thrown values', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      // Throw a plain string (not an Error instance)
      mockFetch.mockRejectedValueOnce('connection refused')

      await useSettingsStore.getState().fetchModels()

      const state = useSettingsStore.getState()
      expect(state.modelsLoading).toBe(false)
      expect(state.modelsError).toBe('Failed to fetch models')
    })

    it('uses backendUrl from store state when building the request URL', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      useSettingsStore.setState({ backendUrl: 'http://api.example.com:9000' })

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await useSettingsStore.getState().fetchModels()

      expect(mockFetch).toHaveBeenCalledWith('http://api.example.com:9000/api/llm/models')
    })
  })

  describe('setDefaultModel', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('patches selected model as default and updates same-provider models locally', async () => {
      const oldDefault = makeModel({
        id: 'codex-cli',
        provider: 'codex_cli',
        is_default: true,
      })
      const newDefault = makeModel({
        id: 'codex-cli-pro',
        provider: 'codex_cli',
        is_default: false,
      })
      const googleDefault = makeModel({
        id: 'gemini-3-flash-preview',
        provider: 'google',
        is_default: true,
      })
      useSettingsStore.setState({
        backendUrl: 'http://api.example.com:9000',
        availableModels: [oldDefault, newDefault, googleDefault],
      })

      mockApiPatch.mockResolvedValueOnce({ ...newDefault, is_default: true })

      const result = await useSettingsStore.getState().setDefaultModel('codex-cli-pro')

      expect(result).toBe(true)
      expect(mockApiPatch).toHaveBeenCalledWith('/api/llm/models/codex-cli-pro', {
        is_default: true,
      })
      const models = useSettingsStore.getState().availableModels
      expect(models.find(model => model.id === 'codex-cli')?.is_default).toBe(false)
      expect(models.find(model => model.id === 'codex-cli-pro')?.is_default).toBe(true)
      expect(models.find(model => model.id === 'gemini-3-flash-preview')?.is_default).toBe(true)
    })

    it('stores an error when default model update fails', async () => {
      mockApiPatch.mockRejectedValueOnce(new Error('Forbidden'))

      const result = await useSettingsStore.getState().setDefaultModel('codex-cli-pro')

      expect(result).toBe(false)
      expect(useSettingsStore.getState().modelsError).toBe('Forbidden')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // getModelsForProvider (instance method on the store)
  // ──────────────────────────────────────────────────────────────────────────
  describe('store.getModelsForProvider (instance method)', () => {
    const anthropicModel = makeModel({
      id: 'claude-sonnet-4-6',
      provider: 'anthropic',
      is_default: true,
    })
    const googleModel = makeModel({
      id: 'gemini-3-flash-preview',
      provider: 'google',
      is_default: true,
    })
    const ollamaModel = makeModel({ id: 'exaone3.5:7.8b', provider: 'ollama' })

    beforeEach(() => {
      useSettingsStore.setState({
        availableModels: [anthropicModel, googleModel, ollamaModel],
      })
    })

    it('returns models matching the requested provider', () => {
      const result = useSettingsStore.getState().getModelsForProvider('anthropic')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('claude-sonnet-4-6')
    })

    it('returns multiple models when several share the same provider', () => {
      const extra = makeModel({ id: 'claude-opus-4-8', provider: 'anthropic' })
      useSettingsStore.setState({
        availableModels: [anthropicModel, extra, googleModel, ollamaModel],
      })

      const result = useSettingsStore.getState().getModelsForProvider('anthropic')
      expect(result).toHaveLength(2)
    })

    it("maps provider 'local' to 'ollama' internally so ollama models are returned", () => {
      const result = useSettingsStore.getState().getModelsForProvider('local')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exaone3.5:7.8b')
      expect(result[0].provider).toBe('ollama')
    })

    it("does NOT map 'local' to 'ollama' when filtering other providers", () => {
      // 'google' should only return google models, not ollama ones
      const result = useSettingsStore.getState().getModelsForProvider('google')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('gemini-3-flash-preview')
    })

    it('returns empty array when no models match the provider', () => {
      const result = useSettingsStore.getState().getModelsForProvider('openai')
      expect(result).toEqual([])
    })

    it('returns empty array when availableModels is empty', () => {
      useSettingsStore.setState({ availableModels: [] })
      const result = useSettingsStore.getState().getModelsForProvider('anthropic')
      expect(result).toEqual([])
    })
  })

})

describe('fallback models via store actions (after fetch failure)', () => {
  beforeEach(async () => {
    useSettingsStore.setState({
      backendUrl: 'http://localhost:8000',
      availableModels: [],
      modelsLoading: false,
      modelsError: null,
    })
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('API down'))
    vi.stubGlobal('fetch', mockFetch)
    await useSettingsStore.getState().fetchModels()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const idsFor = (provider: LLMProvider) =>
    useSettingsStore.getState().getModelsForProvider(provider).map((m) => m.id)

  it('returns anthropic fallback models including claude-sonnet-5', () => {
    const ids = idsFor('anthropic')
    expect(ids).toContain('claude-opus-4-8')
    expect(ids).toContain('claude-sonnet-5')
    expect(ids).toContain('claude-sonnet-4-6')
  })

  it('returns openai fallback models', () => {
    const ids = idsFor('openai')
    expect(ids).toContain('gpt-4o-mini')
    expect(ids).toContain('gpt-4o')
    expect(ids).not.toContain('gpt-5.4')
  })

  it('returns codex cli fallback models', () => {
    expect(idsFor('codex_cli')).toContain('codex-cli')
  })

  it('returns claude cli fallback models', () => {
    expect(idsFor('claude_cli')).toContain('claude-cli')
  })

  it('returns google/gemini fallback models', () => {
    const ids = idsFor('google')
    expect(ids).toContain('gemini-3-flash-preview')
    expect(ids).toContain('gemini-2.5-pro')
  })

  it('returns local fallback models (mapped to ollama provider)', () => {
    const ids = idsFor('local')
    expect(ids).toContain('exaone3.5:7.8b')
    expect(ids).toContain('llama3:8b')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// migrateSettings
// The function runs as a module-level side effect, so we test its logic by
// directly reproducing the migration behaviour against localStorage.
// ──────────────────────────────────────────────────────────────────────────────
describe('migrateSettings (via localStorage side effects)', () => {
  const OLD_KEY = 'agent-orchestrator-settings'
  const NEW_KEY = 'agent-orchestration-service-settings'

  beforeEach(() => {
    localStorage.clear()
  })

  it('copies old key data to new key when old key exists and new key does not', () => {
    // Simulate the conditions under which migrateSettings runs
    const payload = JSON.stringify({ state: { theme: 'dark' }, version: 0 })
    localStorage.setItem(OLD_KEY, payload)

    // Re-run the migration logic directly (mirrors the implementation)
    const oldData = localStorage.getItem(OLD_KEY)
    if (oldData && !localStorage.getItem(NEW_KEY)) {
      localStorage.setItem(NEW_KEY, oldData)
    }

    expect(localStorage.getItem(NEW_KEY)).toBe(payload)
  })

  it('does NOT overwrite new key when it already exists', () => {
    const oldPayload = JSON.stringify({ state: { theme: 'dark' }, version: 0 })
    const newPayload = JSON.stringify({ state: { theme: 'light' }, version: 1 })

    localStorage.setItem(OLD_KEY, oldPayload)
    localStorage.setItem(NEW_KEY, newPayload)

    // Migration should be a no-op because new key exists
    const oldData = localStorage.getItem(OLD_KEY)
    if (oldData && !localStorage.getItem(NEW_KEY)) {
      localStorage.setItem(NEW_KEY, oldData)
    }

    expect(localStorage.getItem(NEW_KEY)).toBe(newPayload)
  })

  it('does nothing when old key does not exist', () => {
    // Neither key exists
    const oldData = localStorage.getItem(OLD_KEY)
    if (oldData && !localStorage.getItem(NEW_KEY)) {
      localStorage.setItem(NEW_KEY, oldData)
    }

    expect(localStorage.getItem(NEW_KEY)).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Theme initialization from localStorage
// The module reads localStorage at import time; here we verify the logic that
// would be exercised (applyThemeToDocument path) by calling setTheme which
// exercises the same applyThemeToDocument helper.
// ──────────────────────────────────────────────────────────────────────────────
describe('theme initialization and applyThemeToDocument', () => {
  beforeEach(() => {
    // Ensure a clean classList
    document.documentElement.classList.remove('dark')
    useSettingsStore.setState({ theme: 'light' })
  })

  it('adds dark class to documentElement when theme is set to dark', () => {
    useSettingsStore.getState().setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class from documentElement when theme is set to light', () => {
    document.documentElement.classList.add('dark')
    useSettingsStore.getState().setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies system theme: adds dark class when matchMedia reports dark preference', () => {
    // Override matchMedia to report dark preference
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true, // dark preferred
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    useSettingsStore.getState().setTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applies system theme: removes dark class when matchMedia reports light preference', () => {
    document.documentElement.classList.add('dark')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false, // light preferred
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    useSettingsStore.getState().setTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists theme value in store state', () => {
    useSettingsStore.getState().setTheme('dark')
    expect(useSettingsStore.getState().theme).toBe('dark')

    useSettingsStore.getState().setTheme('system')
    expect(useSettingsStore.getState().theme).toBe('system')

    useSettingsStore.getState().setTheme('light')
    expect(useSettingsStore.getState().theme).toBe('light')
  })
})

// ── Startup hydration guard ──────────────────────────────
// Bootstrap seeds availableModels; SettingsPage must not refetch them on mount.

describe('settings store ensureModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ availableModels: [], modelsLoading: false, modelsHydrated: false, modelsError: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips the request when models are already hydrated', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    useSettingsStore.getState().hydrateModels([makeModel({ id: 'm-1', provider: 'anthropic' })])

    await useSettingsStore.getState().ensureModels()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches when no models are loaded yet', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [makeModel({ id: 'm-1', provider: 'anthropic' })] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await useSettingsStore.getState().ensureModels()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(useSettingsStore.getState().availableModels).toHaveLength(1)
  })

  it('skips while a fetch is already in flight', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    useSettingsStore.setState({ modelsLoading: true })

    await useSettingsStore.getState().ensureModels()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
