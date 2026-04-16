import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SettingsPage } from './SettingsPage'

// Use vi.hoisted to declare mock fns that vi.mock factories can reference
const {
  mockSetLLMProvider,
  mockSetModel,
  mockSetApiKey,
  mockSetBackendUrl,
  mockSetTheme,
  mockSetNotificationSetting,
  mockSetPreferredTerminal,
  mockConnect,
  mockDisconnect,
  mockRequestPermission,
  mockPlaySound,
  getSettingsOverrides,
  setSettingsOverrides,
  getOrchestrationOverrides,
  setOrchestrationOverrides,
} = vi.hoisted(() => {
  let _settingsOverrides: Record<string, unknown> = {}
  let _orchestrationOverrides: Record<string, unknown> = {}
  return {
    mockSetLLMProvider: vi.fn(),
    mockSetModel: vi.fn(),
    mockSetApiKey: vi.fn(),
    mockSetBackendUrl: vi.fn(),
    mockSetTheme: vi.fn(),
    mockSetNotificationSetting: vi.fn(),
    mockSetPreferredTerminal: vi.fn(),
    mockConnect: vi.fn(),
    mockDisconnect: vi.fn(),
    mockRequestPermission: vi.fn(),
    mockPlaySound: vi.fn(),
    getSettingsOverrides: () => _settingsOverrides,
    setSettingsOverrides: (v: Record<string, unknown>) => { _settingsOverrides = v },
    getOrchestrationOverrides: () => _orchestrationOverrides,
    setOrchestrationOverrides: (v: Record<string, unknown>) => { _orchestrationOverrides = v },
  }
})

const defaultNotifications = {
  browserNotifications: true,
  soundNotifications: true,
  notifyApprovalRequired: true,
  notifyTaskCompleted: false,
  notifyTaskFailed: true,
  notifyConnectionLost: true,
  soundVolume: 50,
}

// Mock child components
vi.mock('../components/llm-router', () => ({
  LLMRouterSettings: () => <div data-testid="llm-router-settings">LLMRouterSettings</div>,
}))
vi.mock('../components/usage', () => ({
  LLMAccountsSettings: () => <div data-testid="llm-accounts">LLMAccountsSettings</div>,
}))

// Store mocks
vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    llmProvider: 'google',
    model: 'gemini-pro',
    apiKey: '',
    backendUrl: 'http://localhost:8000',
    theme: 'system',
    notifications: defaultNotifications,
    preferredTerminal: 'warp',
    setLLMProvider: mockSetLLMProvider,
    setModel: mockSetModel,
    setApiKey: mockSetApiKey,
    setBackendUrl: mockSetBackendUrl,
    setTheme: mockSetTheme,
    setNotificationSetting: mockSetNotificationSetting,
    setPreferredTerminal: mockSetPreferredTerminal,
    fetchModels: vi.fn(),
    getModelsForProvider: () => [],
    ...getSettingsOverrides(),
  }),
  getModelsForProvider: () => ['model-a', 'model-b'],
  Theme: {},
  LLMProvider: {},
  TerminalType: {},
  TERMINAL_DISPLAY_NAMES: {
    warp: 'Warp',
    tmux: 'tmux',
    terminal_app: 'Terminal.app',
    iterm2: 'iTerm2',
    kitty: 'Kitty',
    alacritty: 'Alacritty',
    ghostty: 'Ghostty',
    wezterm: 'WezTerm',
  },
}))

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: () => ({
    connected: true,
    connect: mockConnect,
    disconnect: mockDisconnect,
    ...getOrchestrationOverrides(),
  }),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../services/notificationService', () => ({
  notificationService: {
    testNotification: vi.fn(),
    requestPermission: mockRequestPermission,
    playSound: mockPlaySound,
  },
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock Notification API
Object.defineProperty(global, 'Notification', {
  value: { permission: 'default', requestPermission: vi.fn() },
  writable: true,
})

// Helper to render with act to handle async useEffect
async function renderSettingsPage() {
  let result: ReturnType<typeof render> | undefined
  await act(async () => {
    result = render(<SettingsPage />)
  })
  return result!
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setSettingsOverrides({})
    setOrchestrationOverrides({})
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Existing tests (preserved) ----

  it('renders settings page with title', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders Connection section', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Connection')).toBeInTheDocument()
  })

  it('renders LLM Configuration section', async () => {
    await renderSettingsPage()
    expect(screen.getByText('LLM Configuration')).toBeInTheDocument()
  })

  it('renders Appearance section', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('renders Notifications section', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })

  it('renders Claude Code section', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders LLM Router settings component', async () => {
    await renderSettingsPage()
    expect(screen.getByTestId('llm-router-settings')).toBeInTheDocument()
  })

  it('renders LLM Accounts settings component', async () => {
    await renderSettingsPage()
    expect(screen.getByTestId('llm-accounts')).toBeInTheDocument()
  })

  it('shows connected status for backend', async () => {
    await renderSettingsPage()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  // ---- NEW: Connection Status ----

  describe('Connection section', () => {
    it('shows disconnected status when not connected', async () => {
      setOrchestrationOverrides({ connected: false })
      await renderSettingsPage()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('calls disconnect and connect when reconnect button is clicked', async () => {
      await renderSettingsPage()
      const reconnectBtn = screen.getByTitle('Reconnect')
      await act(async () => {
        fireEvent.click(reconnectBtn)
      })
      expect(mockDisconnect).toHaveBeenCalledTimes(1)
      await act(async () => {
        vi.advanceTimersByTime(600)
      })
      expect(mockConnect).toHaveBeenCalledTimes(1)
    })

    it('updates backend URL on input change', async () => {
      await renderSettingsPage()
      const input = screen.getByPlaceholderText('http://localhost:8000')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'http://example.com:9000' } })
      })
      expect(mockSetBackendUrl).toHaveBeenCalledWith('http://example.com:9000')
    })
  })

  // ---- NEW: LLM Configuration ----

  describe('LLM Configuration section', () => {
    it('renders all four provider buttons', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Anthropic')).toBeInTheDocument()
      expect(screen.getByText('Gemini')).toBeInTheDocument()
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByText('Local')).toBeInTheDocument()
    })

    it('calls setLLMProvider when clicking a provider button', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Anthropic'))
      })
      expect(mockSetLLMProvider).toHaveBeenCalledWith('anthropic')
    })

    it('calls setLLMProvider for local provider', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Local'))
      })
      expect(mockSetLLMProvider).toHaveBeenCalledWith('local')
    })

    it('renders model dropdown with options from getModelsForProvider', async () => {
      await renderSettingsPage()
      const selects = screen.getAllByRole('combobox')
      // First combobox is model select, second is terminal select
      const modelSelect = selects[0]
      const options = modelSelect.querySelectorAll('option')
      expect(options).toHaveLength(2)
      expect(options[0]).toHaveTextContent('model-a')
      expect(options[1]).toHaveTextContent('model-b')
    })

    it('calls setModel when model selection changes', async () => {
      await renderSettingsPage()
      const selects = screen.getAllByRole('combobox')
      const modelSelect = selects[0]
      await act(async () => {
        fireEvent.change(modelSelect, { target: { value: 'model-b' } })
      })
      expect(mockSetModel).toHaveBeenCalledWith('model-b')
    })

    it('calls setApiKey when API key input changes', async () => {
      await renderSettingsPage()
      const input = screen.getByPlaceholderText('sk-...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'sk-test-key-123' } })
      })
      expect(mockSetApiKey).toHaveBeenCalledWith('sk-test-key-123')
    })

    it('displays API key storage notice', async () => {
      await renderSettingsPage()
      expect(screen.getByText('API key is stored in memory only and not persisted')).toBeInTheDocument()
    })
  })

  // ---- NEW: Theme / Appearance ----

  describe('Appearance section', () => {
    it('renders all theme buttons', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
    })

    it('calls setTheme when clicking Light', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Light'))
      })
      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('calls setTheme when clicking Dark', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Dark'))
      })
      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('calls setTheme when clicking System', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('System'))
      })
      expect(mockSetTheme).toHaveBeenCalledWith('system')
    })
  })

  // ---- NEW: Notifications ----

  describe('Notifications section', () => {
    it('renders browser notifications toggle', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Browser Notifications')).toBeInTheDocument()
      expect(screen.getByText('Show desktop notifications for important events')).toBeInTheDocument()
    })

    it('renders sound notifications toggle', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Sound Notifications')).toBeInTheDocument()
      expect(screen.getByText('Play sounds for notification events')).toBeInTheDocument()
    })

    it('toggles browser notifications when switch is clicked', async () => {
      await renderSettingsPage()
      // The toggle buttons have rounded-full class
      const toggles = screen.getAllByRole('button').filter(btn => {
        const classes = btn.getAttribute('class') || ''
        return classes.includes('rounded-full')
      })
      // First toggle = browser notifications, Second = sound notifications
      await act(async () => {
        fireEvent.click(toggles[0])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('browserNotifications', false)
    })

    it('toggles sound notifications when switch is clicked', async () => {
      await renderSettingsPage()
      const toggles = screen.getAllByRole('button').filter(btn => {
        const classes = btn.getAttribute('class') || ''
        return classes.includes('rounded-full')
      })
      await act(async () => {
        fireEvent.click(toggles[1])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('soundNotifications', false)
    })

    it('shows sound volume slider when sound notifications are enabled', async () => {
      await renderSettingsPage()
      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveValue('50')
    })

    it('updates sound volume when slider changes', async () => {
      await renderSettingsPage()
      const slider = screen.getByRole('slider')
      await act(async () => {
        fireEvent.change(slider, { target: { value: '75' } })
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('soundVolume', 75)
    })

    it('displays volume percentage', async () => {
      await renderSettingsPage()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('hides volume slider when soundNotifications is off', async () => {
      setSettingsOverrides({
        notifications: { ...defaultNotifications, soundNotifications: false },
      })
      await renderSettingsPage()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    })

    it('renders notification event checkboxes', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Approval Required (HITL)')).toBeInTheDocument()
      expect(screen.getByText('Task Failed')).toBeInTheDocument()
      expect(screen.getByText('Task Completed')).toBeInTheDocument()
      expect(screen.getByText('Connection Lost')).toBeInTheDocument()
    })

    it('calls setNotificationSetting when toggling approval required checkbox', async () => {
      await renderSettingsPage()
      const checkboxes = screen.getAllByRole('checkbox')
      await act(async () => {
        fireEvent.click(checkboxes[0])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('notifyApprovalRequired', false)
    })

    it('calls setNotificationSetting when toggling task failed checkbox', async () => {
      await renderSettingsPage()
      const checkboxes = screen.getAllByRole('checkbox')
      await act(async () => {
        fireEvent.click(checkboxes[1])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('notifyTaskFailed', false)
    })

    it('calls setNotificationSetting when toggling task completed checkbox', async () => {
      await renderSettingsPage()
      const checkboxes = screen.getAllByRole('checkbox')
      await act(async () => {
        fireEvent.click(checkboxes[2])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('notifyTaskCompleted', true)
    })

    it('calls setNotificationSetting when toggling connection lost checkbox', async () => {
      await renderSettingsPage()
      const checkboxes = screen.getAllByRole('checkbox')
      await act(async () => {
        fireEvent.click(checkboxes[3])
      })
      expect(mockSetNotificationSetting).toHaveBeenCalledWith('notifyConnectionLost', false)
    })

    it('shows Enable button when permission is default and browser notifications enabled', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Enable')).toBeInTheDocument()
    })

    it('calls notification requestPermission when Enable is clicked', async () => {
      mockRequestPermission.mockResolvedValue(true)
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Enable'))
      })
      expect(mockRequestPermission).toHaveBeenCalled()
    })

    it('plays test sound when Test button is clicked', async () => {
      await renderSettingsPage()
      await act(async () => {
        fireEvent.click(screen.getByText('Test'))
      })
      expect(mockPlaySound).toHaveBeenCalledWith('approval')
    })

    it('renders Critical badge for approval required', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })

    it('renders Notify me about label', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Notify me about')).toBeInTheDocument()
    })
  })

  // ---- NEW: Claude Code Section ----

  describe('Claude Code section', () => {
    it('shows No token when config has no token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: false,
          oauth_token_masked: '',
          token_source: 'none',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('No token')).toBeInTheDocument()
      })
    })

    it('shows token set status when oauth token is configured', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: true,
          oauth_token_masked: 'sk-ant-...xxxx',
          token_source: 'config',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('Token set (config)')).toBeInTheDocument()
      })
    })

    it('shows Using source when token_source is not none and not oauth_token_set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: false,
          oauth_token_masked: 'env-...xxxx',
          token_source: 'environment',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('Using environment')).toBeInTheDocument()
      })
    })

    it('shows masked token when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: true,
          oauth_token_masked: 'sk-ant-...abcd',
          token_source: 'config',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('sk-ant-...abcd')).toBeInTheDocument()
      })
    })

    it('shows Clear button when token source is config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: true,
          oauth_token_masked: 'sk-ant-...abcd',
          token_source: 'config',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument()
      })
    })

    it('does not show Clear button when token source is not config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          oauth_token_set: false,
          oauth_token_masked: 'env-...xxxx',
          token_source: 'environment',
        }),
      })
      await renderSettingsPage()
      await waitFor(() => {
        expect(screen.getByText('Using environment')).toBeInTheDocument()
      })
      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('renders OAuth Token input', async () => {
      await renderSettingsPage()
      expect(screen.getByPlaceholderText('Paste OAuth token...')).toBeInTheDocument()
    })

    it('renders Save button (disabled when no input)', async () => {
      await renderSettingsPage()
      const saveBtn = screen.getByText('Save')
      expect(saveBtn).toBeInTheDocument()
      expect(saveBtn.closest('button')).toBeDisabled()
    })

    it('enables Save button when token input has value', async () => {
      await renderSettingsPage()
      const input = screen.getByPlaceholderText('Paste OAuth token...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'my-token-123' } })
      })
      const saveBtn = screen.getByText('Save')
      expect(saveBtn.closest('button')).not.toBeDisabled()
    })

    it('saves token successfully on Save click', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              oauth_token_set: true,
              oauth_token_masked: 'my-...en',
              token_source: 'config',
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      const input = screen.getByPlaceholderText('Paste OAuth token...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'my-token' } })
      })

      const saveBtn = screen.getByText('Save')
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument()
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/usage/claude-config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ oauth_token: 'my-token' }),
        })
      )
    })

    it('handles save token failure (non-ok response)', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      const input = screen.getByPlaceholderText('Paste OAuth token...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'bad-token' } })
      })

      const saveBtn = screen.getByText('Save')
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/usage/claude-config',
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })

    it('handles save token network error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      const input = screen.getByPlaceholderText('Paste OAuth token...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'some-token' } })
      })

      const saveBtn = screen.getByText('Save')
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/usage/claude-config',
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })

    it('clears token on Clear button click', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              oauth_token_set: false,
              oauth_token_masked: '',
              token_source: 'none',
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: true,
            oauth_token_masked: 'sk-...xx',
            token_source: 'config',
          }),
        })
      })

      await renderSettingsPage()

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Clear'))
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/usage/claude-config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ oauth_token: '' }),
        })
      )
    })

    it('handles clear token network error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.reject(new Error('Network failure'))
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: true,
            oauth_token_masked: 'sk-...xx',
            token_source: 'config',
          }),
        })
      })

      await renderSettingsPage()

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Clear'))
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/usage/claude-config',
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })

    it('renders Test Connection button', async () => {
      await renderSettingsPage()
      expect(screen.getByText('Test Connection')).toBeInTheDocument()
    })

    it('shows success result after successful connection test', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (typeof url === 'string' && url.includes('/api/usage/oauth-test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tokenFound: true,
              tokenSource: 'config',
              apiResponse: {
                subscription_type: 'Pro',
              },
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: true,
            oauth_token_masked: 'sk-...xx',
            token_source: 'config',
          }),
        })
      })

      await renderSettingsPage()

      await act(async () => {
        fireEvent.click(screen.getByText('Test Connection'))
      })

      await waitFor(() => {
        expect(screen.getByText('Connected (source: config)')).toBeInTheDocument()
        expect(screen.getByText('Pro')).toBeInTheDocument()
      })
    })

    it('shows failure result when connection test fails (tokenFound false)', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (typeof url === 'string' && url.includes('/api/usage/oauth-test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tokenFound: false,
              error: 'No token configured',
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      await act(async () => {
        fireEvent.click(screen.getByText('Test Connection'))
      })

      await waitFor(() => {
        expect(screen.getByText('No token configured')).toBeInTheDocument()
      })
    })

    it('shows error message when connection test network fails', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (typeof url === 'string' && url.includes('/api/usage/oauth-test')) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      await act(async () => {
        fireEvent.click(screen.getByText('Test Connection'))
      })

      await waitFor(() => {
        expect(screen.getByText('Failed to reach backend')).toBeInTheDocument()
      })
    })

    it('shows connection test with plan fallback when subscription_type missing', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (typeof url === 'string' && url.includes('/api/usage/oauth-test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tokenFound: true,
              tokenSource: 'env',
              apiResponse: {
                plan: 'Team',
              },
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: true,
            oauth_token_masked: 'sk-...xx',
            token_source: 'config',
          }),
        })
      })

      await renderSettingsPage()

      await act(async () => {
        fireEvent.click(screen.getByText('Test Connection'))
      })

      await waitFor(() => {
        expect(screen.getByText('Connected (source: env)')).toBeInTheDocument()
        expect(screen.getByText('Team')).toBeInTheDocument()
      })
    })

    it('shows Unknown subscription when neither subscription_type nor plan exist', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (typeof url === 'string' && url.includes('/api/usage/oauth-test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tokenFound: true,
              apiResponse: {},
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: true,
            oauth_token_masked: 'sk-...xx',
            token_source: 'config',
          }),
        })
      })

      await renderSettingsPage()

      await act(async () => {
        fireEvent.click(screen.getByText('Test Connection'))
      })

      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument()
      })
    })

    it('shows OAuth Token storage notice', async () => {
      await renderSettingsPage()
      expect(
        screen.getByText('Stored in ~/.claude/aos-claude-config.json (file permissions: owner only)')
      ).toBeInTheDocument()
    })

    it('fetches claude config on mount', async () => {
      await renderSettingsPage()
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/usage/claude-config')
    })

    it('handles fetchClaudeConfig failure silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await renderSettingsPage()
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
    })

    it('handles fetchClaudeConfig non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) })
      await renderSettingsPage()
      // Should still render with no config loaded - shows No token
      expect(screen.getByText('No token')).toBeInTheDocument()
    })
  })

  // ---- NEW: Saved status timeout ----

  describe('Saved status timeout', () => {
    it('resets save status to idle after timeout', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/terminal/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ terminals: [] }) })
        }
        if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              oauth_token_set: true,
              oauth_token_masked: 'tok-...xx',
              token_source: 'config',
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            oauth_token_set: false,
            oauth_token_masked: '',
            token_source: 'none',
          }),
        })
      })

      await renderSettingsPage()

      const input = screen.getByPlaceholderText('Paste OAuth token...')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'token-value' } })
      })

      const saveBtn = screen.getByText('Save')
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument()
      })

      // Advance timer to trigger the setTimeout that resets status to 'idle'
      await act(async () => {
        vi.advanceTimersByTime(2100)
      })

      // After reset, it should go back to 'Save'
      await waitFor(() => {
        expect(screen.getByText('Save')).toBeInTheDocument()
      })
    })
  })
})
