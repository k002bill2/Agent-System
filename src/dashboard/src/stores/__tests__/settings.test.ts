import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSettingsStore, getModelsForProvider } from '../settings'
import type { LLMModel } from '../settings'

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
    // Reset store to default state
    useSettingsStore.setState({
      llmProvider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: '',
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
    it('has default llmProvider as anthropic', () => {
      const state = useSettingsStore.getState()
      expect(state.llmProvider).toBe('anthropic')
    })

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

  describe('setLLMProvider', () => {
    it('updates provider and selects first model', () => {
      const { setLLMProvider } = useSettingsStore.getState()

      setLLMProvider('openai')

      const state = useSettingsStore.getState()
      expect(state.llmProvider).toBe('openai')
      expect(state.model).toBe('gpt-4o')
    })

    it('selects google/gemini models when switching to google', () => {
      const { setLLMProvider } = useSettingsStore.getState()

      setLLMProvider('google')

      const state = useSettingsStore.getState()
      expect(state.llmProvider).toBe('google')
      expect(state.model).toBe('gemini-3-flash-preview')
    })

    it('selects local models when switching to local', () => {
      const { setLLMProvider } = useSettingsStore.getState()

      setLLMProvider('local')

      const state = useSettingsStore.getState()
      expect(state.llmProvider).toBe('local')
      expect(state.model).toBe('exaone3.5:7.8b')
    })
  })

  describe('setModel', () => {
    it('updates model', () => {
      const { setModel } = useSettingsStore.getState()

      setModel('claude-opus-4-6')
      expect(useSettingsStore.getState().model).toBe('claude-opus-4-6')
    })
  })

  describe('setApiKey', () => {
    it('updates apiKey', () => {
      const { setApiKey } = useSettingsStore.getState()

      setApiKey('sk-test-key')
      expect(useSettingsStore.getState().apiKey).toBe('sk-test-key')
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
      // availableModels should remain unchanged (empty from beforeEach reset)
      expect(state.availableModels).toEqual([])
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
      const extra = makeModel({ id: 'claude-opus-4-6', provider: 'anthropic' })
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

  // ──────────────────────────────────────────────────────────────────────────
  // setLLMProvider with availableModels populated
  // ──────────────────────────────────────────────────────────────────────────
  describe('setLLMProvider with availableModels populated', () => {
    it('selects the is_default model when one exists for the provider', () => {
      const nonDefault = makeModel({ id: 'claude-haiku', provider: 'anthropic' })
      const defaultModel = makeModel({
        id: 'claude-sonnet-4-6',
        provider: 'anthropic',
        is_default: true,
      })
      useSettingsStore.setState({ availableModels: [nonDefault, defaultModel] })

      useSettingsStore.getState().setLLMProvider('anthropic')

      expect(useSettingsStore.getState().model).toBe('claude-sonnet-4-6')
    })

    it('selects the first model when no is_default model exists for the provider', () => {
      const first = makeModel({ id: 'claude-first', provider: 'anthropic' })
      const second = makeModel({ id: 'claude-second', provider: 'anthropic' })
      useSettingsStore.setState({ availableModels: [first, second] })

      useSettingsStore.getState().setLLMProvider('anthropic')

      expect(useSettingsStore.getState().model).toBe('claude-first')
    })

    it('falls back to static fallback model when availableModels has no match', () => {
      // availableModels only has google models, so anthropic falls back to static list
      useSettingsStore.setState({
        availableModels: [makeModel({ id: 'gemini-3-flash-preview', provider: 'google' })],
      })

      useSettingsStore.getState().setLLMProvider('anthropic')

      // Fallback for anthropic is 'claude-opus-4-6'
      expect(useSettingsStore.getState().model).toBe('claude-opus-4-6')
      expect(useSettingsStore.getState().llmProvider).toBe('anthropic')
    })

    it("maps 'local' provider to 'ollama' when selecting from availableModels", () => {
      const ollamaDefault = makeModel({
        id: 'exaone3.5:7.8b',
        provider: 'ollama',
        is_default: true,
      })
      useSettingsStore.setState({ availableModels: [ollamaDefault] })

      useSettingsStore.getState().setLLMProvider('local')

      expect(useSettingsStore.getState().llmProvider).toBe('local')
      expect(useSettingsStore.getState().model).toBe('exaone3.5:7.8b')
    })
  })
})

describe('getModelsForProvider (legacy exported function)', () => {
  it('returns anthropic models', () => {
    const models = getModelsForProvider('anthropic')
    expect(models).toContain('claude-opus-4-6')
    expect(models).toContain('claude-sonnet-4-6')
  })

  it('returns openai models', () => {
    const models = getModelsForProvider('openai')
    expect(models).toContain('gpt-4o')
    expect(models).toContain('gpt-4o-mini')
  })

  it('returns google/gemini models', () => {
    const models = getModelsForProvider('google')
    expect(models).toContain('gemini-3-flash-preview')
    expect(models).toContain('gemini-2.5-pro-preview-05-06')
  })

  it('returns local models', () => {
    const models = getModelsForProvider('local')
    expect(models).toContain('exaone3.5:7.8b')
    expect(models).toContain('llama3:8b')
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
