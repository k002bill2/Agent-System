import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '../services/apiClient'
import { getAuthSessionKey } from './auth'

export type Theme = 'light' | 'dark' | 'system'
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'codex_cli' | 'claude_cli' | 'local'

export type TerminalType = 'warp' | 'tmux' | 'terminal_app' | 'iterm2' | 'kitty' | 'alacritty' | 'ghostty' | 'wezterm' | 'cmux' | 'orca'

export const TERMINAL_DISPLAY_NAMES: Record<TerminalType, string> = {
  warp: 'Warp',
  tmux: 'tmux',
  terminal_app: 'Terminal.app',
  iterm2: 'iTerm2',
  kitty: 'Kitty',
  alacritty: 'Alacritty',
  ghostty: 'Ghostty',
  wezterm: 'WezTerm',
  cmux: 'cmux',
  orca: 'Orca',
}

export interface NotificationSettings {
  // 채널
  browserNotifications: boolean    // 브라우저 알림
  soundNotifications: boolean      // 사운드 알림

  // 이벤트별 설정
  notifyApprovalRequired: boolean  // HITL 승인 요청 (기본: true)
  notifyTaskCompleted: boolean     // 태스크 완료 (기본: false)
  notifyTaskFailed: boolean        // 태스크 실패 (기본: true)
  notifyConnectionLost: boolean    // 연결 해제 (기본: true)

  // 사운드
  soundVolume: number              // 0-100 (기본: 50)
}

// LLM Model from API
export interface LLMModel {
  id: string
  display_name: string
  provider: string
  context_window: number
  pricing: {
    input: number
    output: number
  }
  available: boolean
  is_default: boolean
  supports_tools: boolean
  supports_vision: boolean
}

// Apply theme to document - defined early for use in store and initialization
const applyThemeToDocument = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    root.classList.toggle('dark', systemTheme === 'dark')
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

interface SettingsState {
  // Connection
  backendUrl: string

  // Theme
  theme: Theme

  // Notifications
  notifications: NotificationSettings

  // Terminal
  preferredTerminal: TerminalType

  // LLM Models from API
  availableModels: LLMModel[]
  modelsLoading: boolean
  modelsHydrated: boolean
  modelsError: string | null

  // Actions
  setBackendUrl: (url: string) => void
  setTheme: (theme: Theme) => void
  setNotificationSetting: <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => void
  setPreferredTerminal: (terminal: TerminalType) => void
  fetchModels: () => Promise<void>
  ensureModels: () => Promise<void>
  hydrateModels: (models: LLMModel[]) => void
  resetModels: () => void
  setDefaultModel: (modelId: string) => Promise<boolean>
  getModelsForProvider: (provider: LLMProvider) => LLMModel[]
}

// Fallback models when API is unavailable.
// Mirrors the enabled models in backend `_MODELS` (src/backend/models/llm_models.py).
// Disabled backend models (gpt-5.5, gpt-5.4 family) are intentionally excluded.
// Keep this list AND fallbackDefaultModelIds below in sync when the backend changes.
const fallbackModels: Record<LLMProvider, string[]> = {
  anthropic: ['claude-opus-5', 'claude-fable-5-1', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  openai: ['gpt-6-astra', 'gpt-4o-mini', 'gpt-4o', 'o3', 'o4-mini'],
  codex_cli: ['codex-cli'],
  claude_cli: ['claude-cli'],
  local: ['exaone3.5:7.8b', 'llama3:8b', 'mistral:7b', 'codellama:7b'],
}

// Per-provider default model ids, mirrored from backend `_MODELS` entries with
// is_default=True (src/backend/models/llm_models.py). Update alongside fallbackModels.
const fallbackDefaultModelIds: ReadonlySet<string> = new Set([
  'claude-sonnet-5', // anthropic
  'gemini-3-flash-preview', // google
  'gpt-4o-mini', // openai
  'codex-cli', // codex_cli
  'claude-cli', // claude_cli
  'exaone3.5:7.8b', // local (ollama)
])

// Build minimal LLMModel objects from fallbackModels for offline/API-failure use.
// 'local' is mapped to 'ollama' to match the provider values returned by the API.
const buildFallbackModels = (): LLMModel[] =>
  (Object.entries(fallbackModels) as [LLMProvider, string[]][]).flatMap(
    ([provider, ids]) =>
      ids.map((id) => ({
        id,
        display_name: id,
        provider: provider === 'local' ? 'ollama' : provider,
        context_window: 0,
        pricing: { input: 0, output: 0 },
        available: true,
        is_default: fallbackDefaultModelIds.has(id),
        supports_tools: true,
        supports_vision: false,
      }))
  )

const defaultNotifications: NotificationSettings = {
  browserNotifications: true,
  soundNotifications: true,
  notifyApprovalRequired: true,
  notifyTaskCompleted: false,
  notifyTaskFailed: true,
  notifyConnectionLost: true,
  soundVolume: 50,
}

// Settings migration function
const migrateSettings = () => {
  const OLD_KEY = 'agent-orchestrator-settings'
  const NEW_KEY = 'agent-orchestration-service-settings'

  const oldData = localStorage.getItem(OLD_KEY)
  if (oldData && !localStorage.getItem(NEW_KEY)) {
    localStorage.setItem(NEW_KEY, oldData)
    // Settings migrated from AGS to AOS
  }
}

// Run migration before creating store
if (typeof window !== 'undefined') {
  migrateSettings()
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Default values
      backendUrl: 'http://localhost:8000',
      theme: 'light',
      notifications: defaultNotifications,
      preferredTerminal: 'warp',

      // LLM Models state
      availableModels: [],
      modelsLoading: false,
      modelsHydrated: false,
      modelsError: null,

      // Actions
      setBackendUrl: (backendUrl) => set({ backendUrl }),

      setTheme: (theme) => {
        applyThemeToDocument(theme)
        set({ theme })
      },

      setPreferredTerminal: (terminal) => set({ preferredTerminal: terminal }),

      setNotificationSetting: (key, value) =>
        set((state) => ({
          notifications: {
            ...state.notifications,
            [key]: value,
          },
        })),

      fetchModels: async () => {
        const state = get()
        const requestSessionKey = getAuthSessionKey()
        // In-flight dedup: skip if a fetch is already running
        // (e.g. App mount and SettingsPage mount firing concurrently)
        if (state.modelsLoading) return
        set({ modelsLoading: true, modelsError: null })

        try {
          const response = await fetch(`${state.backendUrl}/api/llm/models`)

          if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`)
          }

          const data = await response.json()
          if (getAuthSessionKey() !== requestSessionKey) return
          set({
            availableModels: data.models || [],
            modelsLoading: false,
            modelsHydrated: true,
          })
        } catch (error) {
          if (getAuthSessionKey() !== requestSessionKey) return
          console.warn('Failed to fetch LLM models from API, using fallback:', error)
          set((current) => ({
            // Keep previously loaded models; only inject fallbacks when empty
            availableModels: current.availableModels.length > 0
              ? current.availableModels
              : buildFallbackModels(),
            modelsLoading: false,
            modelsError: error instanceof Error ? error.message : 'Failed to fetch models',
          }))
        }
      },

      ensureModels: async () => {
        const { modelsHydrated, modelsLoading } = get()
        if (modelsHydrated || modelsLoading) return
        await get().fetchModels()
      },

      hydrateModels: (models) => {
        set({ availableModels: models, modelsLoading: false, modelsHydrated: true, modelsError: null })
      },

      resetModels: () => {
        set({ availableModels: [], modelsLoading: false, modelsHydrated: false, modelsError: null })
      },

      setDefaultModel: async (modelId) => {
        set({ modelsError: null })

        try {
          const updated = await apiClient.patch<LLMModel>(
            `/api/llm/models/${encodeURIComponent(modelId)}`,
            { is_default: true },
          )
          set(current => ({
            availableModels: current.availableModels.map(model => {
              if (model.provider !== updated.provider) return model
              return {
                ...model,
                is_default: model.id === updated.id,
              }
            }),
          }))
          return true
        } catch (error) {
          set({
            modelsError: error instanceof Error ? error.message : 'Failed to set default model',
          })
          return false
        }
      },

      getModelsForProvider: (provider) => {
        const state = get()
        // Map 'local' to 'ollama' for API compatibility
        const apiProvider = provider === 'local' ? 'ollama' : provider
        return state.availableModels.filter(m => m.provider === apiProvider)
      },
    }),
    {
      name: 'agent-orchestration-service-settings',
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        theme: state.theme,
        notifications: state.notifications,
        preferredTerminal: state.preferredTerminal,
        // Note: availableModels are fetched fresh, not persisted
      }),
    }
  )
)

// Initialize theme on load
if (typeof window !== 'undefined') {
  const NEW_KEY = 'agent-orchestration-service-settings'
  const stored = localStorage.getItem(NEW_KEY)
  let currentTheme: Theme = 'light'

  if (stored) {
    try {
      const { state } = JSON.parse(stored)
      currentTheme = state?.theme || 'light'
    } catch {
      // Ignore parse errors
    }
  }

  // Apply initial theme
  applyThemeToDocument(currentTheme)

  // Listen for system theme changes (only applies when theme is 'system')
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const stored = localStorage.getItem(NEW_KEY)
    if (stored) {
      try {
        const { state } = JSON.parse(stored)
        if (state?.theme === 'system') {
          applyThemeToDocument('system')
        }
      } catch {
        // Ignore parse errors
      }
    }
  })
}
