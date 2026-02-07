import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore, getModelsForProvider } from '../settings'

describe('settings store', () => {
  beforeEach(() => {
    // Reset store to default state
    useSettingsStore.setState({
      llmProvider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
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

    it('selects local models when switching to local', () => {
      const { setLLMProvider } = useSettingsStore.getState()

      setLLMProvider('local')

      const state = useSettingsStore.getState()
      expect(state.llmProvider).toBe('local')
      expect(state.model).toBe('qwen2.5:7b')
    })
  })

  describe('setModel', () => {
    it('updates model', () => {
      const { setModel } = useSettingsStore.getState()

      setModel('claude-opus-4-5-20250514')
      expect(useSettingsStore.getState().model).toBe('claude-opus-4-5-20250514')
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
})

describe('getModelsForProvider', () => {
  it('returns anthropic models', () => {
    const models = getModelsForProvider('anthropic')
    expect(models).toContain('claude-opus-4-5-20250514')
    expect(models).toContain('claude-sonnet-4-20250514')
  })

  it('returns openai models', () => {
    const models = getModelsForProvider('openai')
    expect(models).toContain('gpt-4o')
    expect(models).toContain('gpt-4o-mini')
  })

  it('returns local models', () => {
    const models = getModelsForProvider('local')
    expect(models).toContain('qwen2.5:7b')
    expect(models).toContain('llama3:8b')
  })
})
