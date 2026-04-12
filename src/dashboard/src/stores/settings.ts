import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'local'

export type TerminalType = 'warp' | 'tmux' | 'terminal_app' | 'iterm2' | 'kitty' | 'alacritty' | 'ghostty' | 'wezterm' | 'cmux'

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
  // LLM Settings
  llmProvider: LLMProvider
  model: string
  apiKey: string

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
  modelsError: string | null

  // Actions
  setLLMProvider: (provider: LLMProvider) => void
  setModel: (model: string) => void
  setApiKey: (key: string) => void
  setBackendUrl: (url: string) => void
  setTheme: (theme: Theme) => void
  setNotificationSetting: <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => void
  setPreferredTerminal: (terminal: TerminalType) => void
  fetchModels: () => Promise<void>
  getModelsForProvider: (provider: LLMProvider) => LLMModel[]
}

// Fallback models when API is unavailable
const fallbackModels: Record<LLMProvider, string[]> = {
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'o3', 'o4-mini'],
  local: ['exaone3.5:7.8b', 'llama3:8b', 'mistral:7b', 'codellama:7b'],
}

// Legacy function for backward compatibility
export const getModelsForProvider = (provider: LLMProvider): string[] => {
  return fallbackModels[provider] || []
}

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
      llmProvider: 'google',
      model: 'gemini-3-flash-preview',
      apiKey: '',
      backendUrl: 'http://localhost:8000',
      theme: 'light',
      notifications: defaultNotifications,
      preferredTerminal: 'warp',

      // LLM Models state
      availableModels: [],
      modelsLoading: false,
      modelsError: null,

      // Actions
      setLLMProvider: (provider) => {
        const state = get()
        const providerModels = state.getModelsForProvider(provider)
        const defaultModel = providerModels.find(m => m.is_default) || providerModels[0]
        set({
          llmProvider: provider,
          model: defaultModel?.id || fallbackModels[provider]?.[0] || '',
        })
      },

      setModel: (model) => set({ model }),
      setApiKey: (apiKey) => set({ apiKey }),
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
        set({ modelsLoading: true, modelsError: null })

        try {
          const response = await fetch(`${state.backendUrl}/api/llm/models`)

          if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`)
          }

          const data = await response.json()
          set({
            availableModels: data.models || [],
            modelsLoading: false,
          })
        } catch (error) {
          console.warn('Failed to fetch LLM models from API, using fallback:', error)
          set({
            modelsLoading: false,
            modelsError: error instanceof Error ? error.message : 'Failed to fetch models',
          })
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
        llmProvider: state.llmProvider,
        model: state.model,
        backendUrl: state.backendUrl,
        theme: state.theme,
        notifications: state.notifications,
        preferredTerminal: state.preferredTerminal,
        // Note: apiKey is intentionally NOT persisted for security
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
