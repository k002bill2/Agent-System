import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type LLMProvider = 'anthropic' | 'openai' | 'local'

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
}

const defaultModels: Record<LLMProvider, string[]> = {
  anthropic: ['claude-opus-4-5-20250514', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
  local: ['qwen2.5:7b', 'llama3.2:latest', 'mistral:latest', 'deepseek-r1:8b'],
}

export const getModelsForProvider = (provider: LLMProvider) => defaultModels[provider]

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
    (set) => ({
      // Default values
      llmProvider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: '',
      backendUrl: 'http://localhost:8000',
      theme: 'light',
      notifications: defaultNotifications,

      // Actions
      setLLMProvider: (provider) =>
        set({
          llmProvider: provider,
          model: defaultModels[provider][0],
        }),
      setModel: (model) => set({ model }),
      setApiKey: (apiKey) => set({ apiKey }),
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      setTheme: (theme) => {
        applyThemeToDocument(theme)
        set({ theme })
      },
      setNotificationSetting: (key, value) =>
        set((state) => ({
          notifications: {
            ...state.notifications,
            [key]: value,
          },
        })),
    }),
    {
      name: 'agent-orchestration-service-settings',
      partialize: (state) => ({
        llmProvider: state.llmProvider,
        model: state.model,
        backendUrl: state.backendUrl,
        theme: state.theme,
        notifications: state.notifications,
        // Note: apiKey is intentionally NOT persisted for security
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
