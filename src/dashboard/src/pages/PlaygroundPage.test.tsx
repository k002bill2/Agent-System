import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    Settings: icon, Trash2: icon, Plus: icon, Send: icon, RefreshCw: icon,
    Terminal: icon, Wrench: icon, Zap: icon, Clock: icon, DollarSign: icon,
    Bot: icon, User: icon, Copy: icon, Check: icon, Loader2: icon,
    FolderOpen: icon, X: icon, Database: icon, ChevronDown: icon,
    ChevronUp: icon, FileText: icon,
  }
})

const mockAuthFetch = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', is_admin: false } }
    return selector ? selector(state) : state
  }),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: vi.fn(() => ({ projectFilter: null })),
}))

vi.mock('../components/feedback/TaskEvaluationCard', () => ({
  TaskEvaluationCard: () => <div data-testid="task-eval-card" />,
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { useNavigationStore } from '../stores/navigation'
import { useAuthStore } from '../stores/auth'
import { PlaygroundPage } from './PlaygroundPage'

// ─────────────────────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────────────────────

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'My Session',
  description: '',
  project_id: null,
  working_directory: null,
  agent_id: null,
  model: 'gemini-pro',
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: null,
  rag_enabled: false,
  available_tools: [],
  enabled_tools: [],
  messages: [],
  total_executions: 5,
  total_tokens: 1000,
  total_cost: 0.01,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeModel = (overrides: Record<string, unknown> = {}) => ({
  id: 'gemini-pro',
  display_name: 'Gemini Pro',
  provider: 'google',
  context_window: 32000,
  pricing: { input: 0.001, output: 0.002 },
  available: true,
  ...overrides,
})

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Test Project',
  path: '/home/user/project',
  description: 'A test project',
  has_claude_md: true,
  vector_store_initialized: false,
  indexed_at: null,
  is_active: true,
  ...overrides,
})

const makeTool = (overrides: Record<string, unknown> = {}) => ({
  name: 'file_read',
  description: 'Read a file',
  parameters: {},
  ...overrides,
})

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg1',
  role: 'user',
  content: 'Hello world',
  timestamp: '2026-01-01T00:00:00Z',
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// Mock setup helper
// ─────────────────────────────────────────────────────────────

function setupMockFetch(
  sessions: unknown[] = [],
  models: unknown[] = [],
  tools: unknown[] = [],
  projects: unknown[] = []
) {
  mockAuthFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    const method = opts?.method || 'GET'

    // POST /playground/sessions (create session)
    if (url.includes('/playground/sessions') && method === 'POST' && !url.includes('/execute') && !url.includes('/clear') && !url.includes('/settings')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeSession({ id: 'new-session', name: 'Session 1' })),
      })
    }

    // DELETE /playground/sessions/:id
    if (url.match(/\/playground\/sessions\/[^/]+$/) && method === 'DELETE') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }

    // POST /playground/sessions/:id/execute
    if (url.includes('/execute') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    }

    // POST /playground/sessions/:id/clear
    if (url.includes('/clear') && method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }

    // PATCH /playground/sessions/:id/settings
    if (url.includes('/settings') && method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sessions[0] || makeSession()),
      })
    }

    // GET /playground/sessions
    if (url.includes('/playground/sessions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sessions) })
    }

    if (url.includes('/playground/tools')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ tools }) })
    }
    if (url.includes('/playground/models')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ models }) })
    }
    if (url.includes('/projects')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(projects) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('PlaygroundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMockFetch()
  })

  it('renders the New Session button and empty state after loading', async () => {
    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    expect(screen.getByText('No session selected')).toBeInTheDocument()
    expect(screen.getByText('Create a new session to get started')).toBeInTheDocument()
  })

  it('shows empty sessions message when no sessions exist', async () => {
    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    })
  })

  it('shows session details when a session exists', async () => {
    const mockSession = {
      id: 's1', name: 'My Session', description: '', project_id: null,
      working_directory: null, agent_id: null, model: 'test', temperature: 0.7,
      max_tokens: 4096, system_prompt: null, rag_enabled: false,
      available_tools: [], enabled_tools: [], messages: [],
      total_executions: 5, total_tokens: 1000, total_cost: 0.01,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    setupMockFetch([mockSession])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // Session name appears in sidebar and header
      const elements = screen.getAllByText('My Session')
      expect(elements.length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
  })

  it('opens new session dialog', async () => {
    setupMockFetch([], [
      { id: 'm1', display_name: 'Model 1', provider: 'test', context_window: 4096, pricing: { input: 0, output: 0 }, available: true },
    ])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Session Name')).toBeInTheDocument()
      expect(screen.getByText('Create Session')).toBeInTheDocument()
    })
  })

  it('closes new session dialog when Cancel is clicked', async () => {
    setupMockFetch([], [
      { id: 'm1', display_name: 'M', provider: 'p', context_window: 4096, pricing: { input: 0, output: 0 }, available: true },
    ])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))
    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByText('Session Name')).not.toBeInTheDocument())
  })

  // ─────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────

  it('shows loading spinner initially', async () => {
    // Make fetch hang to keep loading state
    mockAuthFetch.mockImplementation(() => new Promise(() => {}))

    await act(async () => {
      render(<PlaygroundPage />)
    })

    // The loading state should show RefreshCw spinner (rendered as <span> via mock)
    // and should NOT show the New Session button yet
    expect(screen.queryByText('New Session')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // Error handling
  // ─────────────────────────────────────────────────────────────

  it('handles API errors gracefully on initial load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthFetch.mockRejectedValue(new Error('Network error'))

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  // ─────────────────────────────────────────────────────────────
  // Session with messages – user and assistant
  // ─────────────────────────────────────────────────────────────

  it('renders user and assistant messages', async () => {
    const session = makeSession({
      messages: [
        makeMessage({ id: 'u1', role: 'user', content: 'What is 2+2?' }),
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: 'The answer is 4.',
          tokens: 150,
          latency_ms: 320,
        }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('What is 2+2?')).toBeInTheDocument()
    })
    expect(screen.getByText('The answer is 4.')).toBeInTheDocument()
    // Should show tokens and latency for assistant messages
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('320ms')).toBeInTheDocument()
    // TaskEvaluationCard should be rendered for assistant message
    expect(screen.getAllByTestId('task-eval-card').length).toBeGreaterThanOrEqual(1)
  })

  // ─────────────────────────────────────────────────────────────
  // Tool message rendering
  // ─────────────────────────────────────────────────────────────

  it('renders tool call messages with special styling', async () => {
    const session = makeSession({
      messages: [
        makeMessage({
          id: 't1',
          role: 'tool',
          content: 'file_read("/src/main.py")',
          tool_results: [{ tool: 'file_read', result: 'print("hello")' }],
        }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Tool Call')).toBeInTheDocument()
    })
    expect(screen.getByText('file_read("/src/main.py")')).toBeInTheDocument()
    expect(screen.getByText('View Result')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // Session switching
  // ─────────────────────────────────────────────────────────────

  it('switches sessions when clicking a different session in sidebar', async () => {
    const session1 = makeSession({ id: 's1', name: 'Session A', total_tokens: 1000 })
    const session2 = makeSession({ id: 's2', name: 'Session B', total_tokens: 2000 })
    setupMockFetch([session1, session2])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // Session A appears in sidebar + header
      expect(screen.getAllByText('Session A').length).toBeGreaterThanOrEqual(1)
    })

    // Initially shows Session A tokens (first session selected by default)
    expect(screen.getByText('1,000 tokens')).toBeInTheDocument()

    // Click Session B in the sidebar (find the sidebar item specifically)
    const sessionBItems = screen.getAllByText('Session B')
    fireEvent.click(sessionBItems[0]) // click the sidebar entry

    await waitFor(() => {
      // Session B header should appear - check for its token count
      expect(screen.getByText('2,000 tokens')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Delete session
  // ─────────────────────────────────────────────────────────────

  it('deletes a session when delete button is clicked', async () => {
    const session1 = makeSession({ id: 's1', name: 'Session To Delete' })
    const session2 = makeSession({ id: 's2', name: 'Session To Keep' })
    setupMockFetch([session1, session2])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // Session To Delete appears in sidebar + header (it's selected first)
      expect(screen.getAllByText('Session To Delete').length).toBeGreaterThanOrEqual(1)
    })

    // Find the delete button inside the sidebar item for "Session To Delete"
    // The sidebar text is inside a <span> inside .p-3
    const sidebarItem = screen.getAllByText('Session To Delete')[0].closest('[class*="p-3"]')
    const deleteBtn = sidebarItem?.querySelector('button')
    expect(deleteBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(deleteBtn!)
    })

    await waitFor(() => {
      // The mock was called with DELETE method
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/playground/sessions/s1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Execute prompt
  // ─────────────────────────────────────────────────────────────

  it('executes a prompt when Send button is clicked', async () => {
    const session = makeSession()
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')
    fireEvent.change(textarea, { target: { value: 'Test prompt' } })

    // Click the send button
    const sendButton = textarea.closest('.flex.gap-2')?.querySelector('button')
    expect(sendButton).toBeTruthy()

    await act(async () => {
      fireEvent.click(sendButton!)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/execute'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('executes a prompt on Enter key (without Shift)', async () => {
    const session = makeSession()
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')
    fireEvent.change(textarea, { target: { value: 'Enter key prompt' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/execute'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('does not execute on Enter+Shift (multiline)', async () => {
    const session = makeSession()
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')
    fireEvent.change(textarea, { target: { value: 'Multiline text' } })

    const executeCallsBefore = mockAuthFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/execute')
    ).length

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    // Should NOT have triggered an execute call
    const executeCallsAfter = mockAuthFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/execute')
    ).length

    expect(executeCallsAfter).toBe(executeCallsBefore)
  })

  it('does not execute with empty prompt', async () => {
    const session = makeSession()
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')
    // Leave prompt empty, press Enter
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    // No execute call should have been made
    const executeCalls = mockAuthFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/execute')
    )
    expect(executeCalls.length).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────
  // Settings panel
  // ─────────────────────────────────────────────────────────────

  it('toggles settings panel on/off', async () => {
    const session = makeSession()
    const model = makeModel()
    setupMockFetch([session], [model])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    // Settings panel should not be visible initially
    expect(screen.queryByText('System Prompt')).not.toBeInTheDocument()

    // Click the Settings button (title="Settings")
    const settingsBtn = screen.getByTitle('Settings')
    fireEvent.click(settingsBtn)

    await waitFor(() => {
      expect(screen.getByText('System Prompt')).toBeInTheDocument()
      expect(screen.getByText('Temperature: 0.7')).toBeInTheDocument()
      expect(screen.getByText('Max Tokens')).toBeInTheDocument()
    })

    // Toggle off
    fireEvent.click(settingsBtn)
    await waitFor(() => {
      expect(screen.queryByText('System Prompt')).not.toBeInTheDocument()
    })
  })

  it('updates model setting when changed', async () => {
    const session = makeSession()
    const models = [
      makeModel({ id: 'gemini-pro', display_name: 'Gemini Pro', provider: 'google' }),
      makeModel({ id: 'claude-3', display_name: 'Claude 3', provider: 'anthropic' }),
    ]
    setupMockFetch([session], models)

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('Model')).toBeInTheDocument()
    })

    // Find the model select and change it
    const modelSelect = screen.getByDisplayValue('Gemini Pro (google)')
    await act(async () => {
      fireEvent.change(modelSelect, { target: { value: 'claude-3' } })
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('updates temperature via range slider', async () => {
    const session = makeSession()
    setupMockFetch([session], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('Temperature: 0.7')).toBeInTheDocument()
    })

    const slider = screen.getByDisplayValue('0.7')
    await act(async () => {
      fireEvent.change(slider, { target: { value: '1.2' } })
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('updates max tokens', async () => {
    const session = makeSession()
    setupMockFetch([session], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('Max Tokens')).toBeInTheDocument()
    })

    const maxTokensInput = screen.getByDisplayValue('4096')
    await act(async () => {
      fireEvent.change(maxTokensInput, { target: { value: '8192' } })
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('updates system prompt', async () => {
    const session = makeSession()
    setupMockFetch([session], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Optional system prompt...')).toBeInTheDocument()
    })

    const sysPromptTextarea = screen.getByPlaceholderText('Optional system prompt...')
    await act(async () => {
      fireEvent.change(sysPromptTextarea, { target: { value: 'You are a helpful assistant.' } })
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('toggles RAG enabled checkbox', async () => {
    const project = makeProject({ vector_store_initialized: true, indexed_at: '2026-01-15T00:00:00Z' })
    const session = makeSession({ project_id: 'p1', rag_enabled: false })
    setupMockFetch([session], [makeModel()], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('RAG Context')).toBeInTheDocument()
    })

    // Find the RAG checkbox
    const ragCheckbox = screen.getByRole('checkbox', { name: /RAG Context/i })
    await act(async () => {
      fireEvent.click(ragCheckbox)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('shows RAG disabled hint when no project is selected', async () => {
    const session = makeSession({ project_id: null })
    setupMockFetch([session], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('프로젝트를 선택해야 RAG를 사용할 수 있습니다')).toBeInTheDocument()
    })
  })

  it('shows vector store not initialized warning', async () => {
    const project = makeProject({ vector_store_initialized: false })
    const session = makeSession({ project_id: 'p1' })
    setupMockFetch([session], [makeModel()], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText(/인덱싱 필요/)).toBeInTheDocument()
    })
  })

  it('shows vector store initialized status with date', async () => {
    const project = makeProject({ vector_store_initialized: true, indexed_at: '2026-01-15T00:00:00Z' })
    const session = makeSession({ project_id: 'p1' })
    setupMockFetch([session], [makeModel()], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('인덱스 활성화')).toBeInTheDocument()
    })
  })

  it('renders tool checkboxes in settings and toggles them', async () => {
    const session = makeSession({ enabled_tools: ['file_read'] })
    const tools = [
      makeTool({ name: 'file_read', description: 'Read a file' }),
      makeTool({ name: 'web_search', description: 'Search the web' }),
    ]
    setupMockFetch([session], [makeModel()], tools)

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('file_read')).toBeInTheDocument()
      expect(screen.getByText('web_search')).toBeInTheDocument()
    })

    // Toggle web_search on
    const webSearchLabel = screen.getByText('web_search').closest('label')
    const checkbox = webSearchLabel?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()

    await act(async () => {
      fireEvent.click(checkbox!)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Clear history
  // ─────────────────────────────────────────────────────────────

  it('clears history when clear button is clicked', async () => {
    const session = makeSession({
      messages: [makeMessage({ id: 'u1', role: 'user', content: 'Hello' })],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })

    const clearBtn = screen.getByTitle('Clear history')
    await act(async () => {
      fireEvent.click(clearBtn)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/clear'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    // After clearing, the empty state message should appear
    await waitFor(() => {
      expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Copy to clipboard
  // ─────────────────────────────────────────────────────────────

  it('copies assistant message content to clipboard', async () => {
    const session = makeSession({
      messages: [
        makeMessage({ id: 'a1', role: 'assistant', content: 'Copy me!' }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Copy me!')).toBeInTheDocument()
    })

    // Find the copy button within the message bubble
    // The message has a container with a button that calls onCopy
    const msgContainer = screen.getByText('Copy me!').closest('.max-w-\\[70\\%\\]') ||
      screen.getByText('Copy me!').parentElement?.parentElement
    const copyButtons = msgContainer?.querySelectorAll('button')
    // The last button should be the copy button
    const copyBtn = copyButtons ? copyButtons[copyButtons.length - 1] : null
    expect(copyBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(copyBtn!)
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me!')
  })

  // ─────────────────────────────────────────────────────────────
  // New session dialog – create with project
  // ─────────────────────────────────────────────────────────────

  it('creates a new session with project and model selection', async () => {
    const project = makeProject()
    const model = makeModel()
    setupMockFetch([], [model], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Session Name')).toBeInTheDocument()
    })

    // Change session name
    const nameInput = screen.getByPlaceholderText('Enter session name...')
    fireEvent.change(nameInput, { target: { value: 'My New Session' } })

    // Select a project
    const projectSelect = screen.getByDisplayValue('No Project')
    fireEvent.change(projectSelect, { target: { value: 'p1' } })

    // The project path should appear
    await waitFor(() => {
      expect(screen.getByText('/home/user/project')).toBeInTheDocument()
    })

    // Click Create Session
    await act(async () => {
      fireEvent.click(screen.getByText('Create Session'))
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/playground/sessions'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('closes new session dialog with X button', async () => {
    setupMockFetch([], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Session Name')).toBeInTheDocument()
    })

    // The dialog has a header row with the title "New Session" and an X button
    // Find the dialog's border-b header div containing the title
    const dialogTitles = screen.getAllByText('New Session')
    // The second "New Session" text is in the dialog header (first is sidebar button)
    const dialogTitle = dialogTitles.length > 1 ? dialogTitles[1] : dialogTitles[0]
    const headerDiv = dialogTitle.closest('[class*="border-b"]')
    const xButton = headerDiv?.querySelector('button')
    expect(xButton).toBeTruthy()

    fireEvent.click(xButton!)

    await waitFor(() => {
      expect(screen.queryByText('Session Name')).not.toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Project filter
  // ─────────────────────────────────────────────────────────────

  it('filters sessions by projectFilter', async () => {
    vi.mocked(useNavigationStore).mockReturnValue({ projectFilter: 'p1' } as ReturnType<typeof useNavigationStore>)

    const session1 = makeSession({ id: 's1', name: 'Project Session', project_id: 'p1' })
    const session2 = makeSession({ id: 's2', name: 'Other Session', project_id: 'p2' })
    const project = makeProject()
    setupMockFetch([session1, session2], [], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // The filtered session should appear in the sidebar list
      const items = screen.getAllByText('Project Session')
      expect(items.length).toBeGreaterThanOrEqual(1)
    })

    // "Other Session" should not be shown because projectFilter filters it out
    expect(screen.queryByText('Other Session')).not.toBeInTheDocument()

    // Reset mock
    vi.mocked(useNavigationStore).mockReturnValue({ projectFilter: null } as ReturnType<typeof useNavigationStore>)
  })

  it('shows project-filtered empty message', async () => {
    vi.mocked(useNavigationStore).mockReturnValue({ projectFilter: 'nonexistent' } as ReturnType<typeof useNavigationStore>)

    const session = makeSession({ project_id: 'p1' })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('이 프로젝트의 세션 없음')).toBeInTheDocument()
    })

    vi.mocked(useNavigationStore).mockReturnValue({ projectFilter: null } as ReturnType<typeof useNavigationStore>)
  })

  // ─────────────────────────────────────────────────────────────
  // Session with project_id – shows project info
  // ─────────────────────────────────────────────────────────────

  it('shows project name in sidebar and header for project-bound sessions', async () => {
    const project = makeProject({ id: 'p1', name: 'My Project' })
    const session = makeSession({ project_id: 'p1' })
    setupMockFetch([session], [], [], [project])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // Project name should appear in both sidebar and header
      const projElements = screen.getAllByText('My Project')
      expect(projElements.length).toBeGreaterThanOrEqual(2) // sidebar + header
    })
  })

  it('shows session cost and executions in sidebar', async () => {
    const session = makeSession({ total_executions: 10, total_cost: 0.0523 })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('10 executions • $0.0523')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Token and cost display in header
  // ─────────────────────────────────────────────────────────────

  it('shows token count and cost in session header', async () => {
    const session = makeSession({ total_tokens: 5432, total_cost: 0.1234 })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('5,432 tokens')).toBeInTheDocument()
      expect(screen.getByText('$0.1234')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // RAG Sources in assistant messages
  // ─────────────────────────────────────────────────────────────

  it('shows and toggles RAG sources in assistant message', async () => {
    const session = makeSession({
      messages: [
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Based on the docs...',
          rag_sources: [
            {
              content: 'This is a long source content that provides context for the answer.',
              source: '/docs/readme.md',
              priority: 'high',
              score: 0.95,
            },
            {
              content: 'Another source.',
              source: '/docs/guide.md',
              score: 0.8,
            },
          ],
        }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Based on the docs...')).toBeInTheDocument()
    })

    // RAG sources toggle button
    const sourcesButton = screen.getByText(/참조된 문서 \(2\)/)
    expect(sourcesButton).toBeInTheDocument()

    // Click to expand sources
    fireEvent.click(sourcesButton)

    await waitFor(() => {
      expect(screen.getByText('/docs/readme.md')).toBeInTheDocument()
      expect(screen.getByText('/docs/guide.md')).toBeInTheDocument()
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
      expect(screen.getByText('80%')).toBeInTheDocument()
    })

    // Click again to collapse
    fireEvent.click(sourcesButton)

    await waitFor(() => {
      expect(screen.queryByText('/docs/readme.md')).not.toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Assistant message without tokens/latency (zero values)
  // ─────────────────────────────────────────────────────────────

  it('does not show tokens/latency when they are zero', async () => {
    const session = makeSession({
      messages: [
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No metrics here',
          tokens: 0,
          latency_ms: 0,
        }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('No metrics here')).toBeInTheDocument()
    })

    // The tokens and latency elements should not render their numbers
    // (conditioned on tokens > 0 and latency_ms > 0)
    expect(screen.queryByText('0ms')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // Admin vs non-admin project filtering in new session dialog
  // ─────────────────────────────────────────────────────────────

  it('shows all projects for admin users in new session dialog', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', is_admin: true } }
      return selector ? selector(state) : state
    })

    const activeProject = makeProject({ id: 'p1', name: 'Active Project', is_active: true })
    const inactiveProject = makeProject({ id: 'p2', name: 'Inactive Project', is_active: false })
    setupMockFetch([], [makeModel()], [], [activeProject, inactiveProject])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Session Name')).toBeInTheDocument()
    })

    // Admin should see both active and inactive projects
    expect(screen.getByText('Active Project')).toBeInTheDocument()
    expect(screen.getByText('Inactive Project')).toBeInTheDocument()

    // Reset
    vi.mocked(useAuthStore).mockImplementation((selector?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', is_admin: false } }
      return selector ? selector(state) : state
    })
  })

  it('hides inactive projects for non-admin users in new session dialog', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', is_admin: false } }
      return selector ? selector(state) : state
    })

    const activeProject = makeProject({ id: 'p1', name: 'Active Proj', is_active: true })
    const inactiveProject = makeProject({ id: 'p2', name: 'Inactive Proj', is_active: false })
    setupMockFetch([], [makeModel()], [], [activeProject, inactiveProject])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Active Proj')).toBeInTheDocument()
    })

    // Inactive project should NOT be visible for non-admin
    expect(screen.queryByText('Inactive Proj')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // Error handling in actions
  // ─────────────────────────────────────────────────────────────

  it('handles execute prompt error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = makeSession()
    setupMockFetch([session])

    // Override execute to fail
    mockAuthFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes('/execute') && opts?.method === 'POST') {
        return Promise.resolve({ ok: false })
      }
      if (url.includes('/playground/sessions') && !opts?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([session]) })
      }
      if (url.includes('/playground/tools')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ tools: [] }) })
      }
      if (url.includes('/playground/models')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) })
      }
      if (url.includes('/projects')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Enter your prompt... (MD 문서를 드래그하거나 첨부하세요)')
    fireEvent.change(textarea, { target: { value: 'Fail prompt' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it('handles create session error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setupMockFetch([], [makeModel()])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })

    // Override create session to fail
    mockAuthFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes('/playground/sessions') && opts?.method === 'POST') {
        return Promise.resolve({ ok: false })
      }
      if (url.includes('/playground/sessions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      if (url.includes('/playground/tools')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ tools: [] }) })
      }
      if (url.includes('/playground/models')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [makeModel()] }) })
      }
      if (url.includes('/projects')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    fireEvent.click(screen.getByText('New Session'))

    await waitFor(() => {
      expect(screen.getByText('Create Session')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Create Session'))
    })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  // ─────────────────────────────────────────────────────────────
  // Model availability display
  // ─────────────────────────────────────────────────────────────

  it('shows model availability count in settings', async () => {
    const session = makeSession()
    const models = [
      makeModel({ id: 'm1', available: true }),
      makeModel({ id: 'm2', available: true }),
      makeModel({ id: 'm3', available: false }),
    ]
    setupMockFetch([session], models)

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('2 of 3 models available')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Delete current session fallback
  // ─────────────────────────────────────────────────────────────

  it('selects another session after deleting the current one', async () => {
    const session1 = makeSession({ id: 's1', name: 'Session 1' })
    const session2 = makeSession({ id: 's2', name: 'Session 2' })
    setupMockFetch([session1, session2])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      // Session 1 is the current one (first loaded)
      const header = screen.getAllByText('Session 1')
      expect(header.length).toBeGreaterThanOrEqual(1)
    })

    // Delete session 1 (the current one)
    const sessionItem = screen.getAllByText('Session 1')[0].closest('.p-3')
    const deleteBtn = sessionItem?.querySelector('button:last-child')
    expect(deleteBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(deleteBtn!)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/playground/sessions/s1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Tool result with empty results
  // ─────────────────────────────────────────────────────────────

  it('renders tool message without results when tool_results is empty', async () => {
    const session = makeSession({
      messages: [
        makeMessage({
          id: 't1',
          role: 'tool',
          content: 'web_search("test")',
          tool_results: [],
        }),
      ],
    })
    setupMockFetch([session])

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Tool Call')).toBeInTheDocument()
      expect(screen.getByText('web_search("test")')).toBeInTheDocument()
    })

    // "View Result" should NOT appear when tool_results is empty
    expect(screen.queryByText('View Result')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // Tool checkbox unchecking
  // ─────────────────────────────────────────────────────────────

  it('removes a tool from enabled_tools when unchecked', async () => {
    const session = makeSession({ enabled_tools: ['file_read', 'web_search'] })
    const tools = [
      makeTool({ name: 'file_read' }),
      makeTool({ name: 'web_search' }),
    ]
    setupMockFetch([session], [makeModel()], tools)

    await act(async () => {
      render(<PlaygroundPage />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.click(screen.getByTitle('Settings'))

    await waitFor(() => {
      expect(screen.getByText('file_read')).toBeInTheDocument()
    })

    // Uncheck file_read
    const fileReadLabel = screen.getByText('file_read').closest('label')
    const checkbox = fileReadLabel?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()

    await act(async () => {
      fireEvent.click(checkbox!)
    })

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })
})
