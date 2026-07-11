import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ModelManagementPanel } from '../ModelManagementPanel'

// ─────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    Boxes: icon('boxes'),
    Loader2: icon('loader'),
    Star: icon('star'),
    ToggleLeft: icon('toggle-left'),
    ToggleRight: icon('toggle-right'),
    Trash2: icon('trash'),
  }
})

type MockUser = { is_admin: boolean; role: string } | null

const DEFAULT_BACKEND_URL = 'http://localhost:8000'

let mockUser: MockUser = null
let mockBackendUrl = DEFAULT_BACKEND_URL
const authFetchMock = vi.fn()
const fetchModelsMock = vi.fn()

vi.mock('../../../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: MockUser }) => unknown) => selector({ user: mockUser }),
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}))

vi.mock('../../../stores/settings', () => ({
  useSettingsStore: (selector: (s: { fetchModels: () => void; backendUrl: string }) => unknown) =>
    selector({ fetchModels: fetchModelsMock, backendUrl: mockBackendUrl }),
}))

// ─────────────────────────────────────────────────────────────
// Fixtures / helpers
// ─────────────────────────────────────────────────────────────

const model = (overrides?: Record<string, unknown>) => ({
  id: 'claude-opus-4-8',
  display_name: 'Claude Opus 4.8',
  provider: 'anthropic',
  context_window: 200000,
  pricing: { input: 0.015, output: 0.075 },
  available: true,
  is_default: false,
  supports_tools: true,
  supports_vision: true,
  is_enabled: true,
  ...overrides,
})

type ModelFixture = ReturnType<typeof model>

const listResponse = (models: ModelFixture[]) =>
  ({ ok: true, json: async () => ({ models, total: models.length }) }) as Response

/** Same list for every GET (mount + refetch). */
const mockList = (models: ModelFixture[]) => {
  vi.mocked(global.fetch).mockResolvedValue(listResponse(models))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const adminUser: MockUser = { is_admin: true, role: 'admin' }

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('ModelManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    mockBackendUrl = DEFAULT_BACKEND_URL
  })

  it('renders nothing and fires no request for non-admin users', () => {
    mockUser = { is_admin: false, role: 'user' }
    const { container } = render(<ModelManagementPanel />)
    expect(container).toBeEmptyDOMElement()
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
  })

  it('loads and renders models grouped by provider for admins', async () => {
    mockUser = adminUser
    mockList([
      model(),
      model({ id: 'gemini-3-flash-preview', display_name: 'Gemini 3 Flash', provider: 'google' }),
    ])

    render(<ModelManagementPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Opus 4.8')).toBeInTheDocument()
    })
    expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument()
    expect(screen.getByText('Google (Gemini)')).toBeInTheDocument()
    expect(screen.getByText('Gemini 3 Flash')).toBeInTheDocument()
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/llm/models?include_disabled=true')
    )
  })

  it('toggles enable with the correct body and reflects the new state after refetch', async () => {
    mockUser = adminUser
    const m = model({ is_enabled: true, is_default: false })
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([m])) // mount
      .mockResolvedValueOnce(listResponse([{ ...m, is_enabled: false }])) // refetch after PATCH
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeInTheDocument()
    })
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Disable claude-opus-4-8'))

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled()
    })
    const [url, opts] = authFetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/llm/models/claude-opus-4-8')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toEqual({ is_enabled: false })

    // Post-refetch the model is disabled → hidden by default; the toggle reveals it.
    await waitFor(() => {
      expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Enable claude-opus-4-8')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Show disabled models (1)'))

    await waitFor(() => {
      expect(screen.getByLabelText('Enable claude-opus-4-8')).toBeInTheDocument()
    })
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(fetchModelsMock).toHaveBeenCalled()
  })

  it('sends is_default PATCH, refetches, and moves the Default badge', async () => {
    mockUser = adminUser
    const opus = model({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', is_default: true })
    const sonnet = model({
      id: 'claude-sonnet-5',
      display_name: 'Claude Sonnet 5',
      is_default: false,
    })
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([opus, sonnet])) // mount: opus is default
      .mockResolvedValueOnce(
        listResponse([
          { ...opus, is_default: false },
          { ...sonnet, is_default: true },
        ])
      ) // refetch: sonnet became default

    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-sonnet-5 as default')).toBeInTheDocument()
    })
    // Current default (opus) exposes no "Set default" action.
    expect(screen.queryByLabelText('Set claude-opus-4-8 as default')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Set claude-sonnet-5 as default'))

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled()
    })
    expect(JSON.parse(authFetchMock.mock.calls[0][1].body)).toEqual({ is_default: true })

    // Default badge moved: sonnet now default (no action), opus demoted (action reappears).
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Set claude-sonnet-5 as default')).not.toBeInTheDocument()
    expect(fetchModelsMock).toHaveBeenCalled()
  })

  it('hides disabled models by default and shows a toggle with the disabled count', async () => {
    mockUser = adminUser
    mockList([
      model({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', is_enabled: true }),
      model({
        id: 'claude-legacy-2',
        display_name: 'Claude Legacy 2',
        is_enabled: false,
        is_default: false,
      }),
    ])

    render(<ModelManagementPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Opus 4.8')).toBeInTheDocument()
    })
    // Disabled model is hidden; the toggle advertises how many are hidden.
    expect(screen.queryByText('Claude Legacy 2')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
  })

  it('reveals disabled models when the toggle is clicked and hides them again', async () => {
    mockUser = adminUser
    mockList([
      model({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', is_enabled: true }),
      model({
        id: 'claude-legacy-2',
        display_name: 'Claude Legacy 2',
        is_enabled: false,
        is_default: false,
      }),
    ])

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
    expect(screen.getByText('Claude Legacy 2')).toBeInTheDocument()

    // Toggle flips to a hide affordance and collapses the disabled row again.
    fireEvent.click(screen.getByLabelText('Hide disabled models'))
    expect(screen.queryByText('Claude Legacy 2')).not.toBeInTheDocument()
  })

  it('hides a provider group whose models are all disabled', async () => {
    mockUser = adminUser
    mockList([
      model({
        id: 'claude-opus-4-8',
        display_name: 'Claude Opus 4.8',
        provider: 'anthropic',
        is_enabled: true,
      }),
      model({
        id: 'gemini-legacy',
        display_name: 'Gemini Legacy',
        provider: 'google',
        is_enabled: false,
        is_default: false,
      }),
    ])

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument()
    })
    // The google group has only a disabled model → its header is hidden too.
    expect(screen.queryByText('Google (Gemini)')).not.toBeInTheDocument()
    expect(screen.queryByText('Gemini Legacy')).not.toBeInTheDocument()

    // Revealing disabled models brings the whole group back.
    fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
    expect(screen.getByText('Google (Gemini)')).toBeInTheDocument()
    expect(screen.getByText('Gemini Legacy')).toBeInTheDocument()
  })

  it('always shows a disabled default (anomalous) row even while disabled models are hidden', async () => {
    mockUser = adminUser
    mockList([
      model({
        id: 'claude-opus-4-8',
        display_name: 'Claude Opus 4.8',
        provider: 'anthropic',
        is_enabled: true,
      }),
      model({
        id: 'gemini-broken-default',
        display_name: 'Gemini Broken Default',
        provider: 'google',
        is_enabled: false,
        is_default: true,
      }),
    ])

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByText('Claude Opus 4.8')).toBeInTheDocument()
    })
    // Anomalous disabled-default stays visible (recovery path) despite hidden mode.
    expect(screen.getByText('Gemini Broken Default')).toBeInTheDocument()
    expect(screen.getByText('Google (Gemini)')).toBeInTheDocument()
    expect(screen.getByLabelText('Enable gemini-broken-default')).not.toBeDisabled()
    // The always-visible anomaly must not surface a toggle (nothing is actually hidden).
    expect(screen.queryByLabelText(/Show disabled models/)).not.toBeInTheDocument()
  })

  it('excludes always-visible disabled-default rows from the toggle count', async () => {
    mockUser = adminUser
    mockList([
      model({
        id: 'claude-opus-4-8',
        display_name: 'Claude Opus 4.8',
        provider: 'anthropic',
        is_enabled: true,
      }),
      model({
        id: 'claude-legacy-2',
        display_name: 'Claude Legacy 2',
        provider: 'anthropic',
        is_enabled: false,
        is_default: false,
      }),
      model({
        id: 'gemini-broken-default',
        display_name: 'Gemini Broken Default',
        provider: 'google',
        is_enabled: false,
        is_default: true,
      }),
    ])

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByText('Claude Opus 4.8')).toBeInTheDocument()
    })
    // Two rows are disabled, but the always-visible anomalous default is excluded → count is 1.
    expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Show disabled models (2)')).not.toBeInTheDocument()
  })

  it('shows a session-expired message on 401', async () => {
    mockUser = adminUser
    mockList([model({ is_enabled: true, is_default: false })])
    authFetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Disable claude-opus-4-8'))
    await waitFor(() => {
      expect(screen.getByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Admin 권한이 없습니다.')).not.toBeInTheDocument()
  })

  it('shows an admin-required message on 403', async () => {
    mockUser = adminUser
    mockList([model({ is_enabled: true, is_default: false })])
    authFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Disable claude-opus-4-8'))
    await waitFor(() => {
      expect(screen.getByText('Admin 권한이 없습니다.')).toBeInTheDocument()
    })
    expect(screen.queryByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).not.toBeInTheDocument()
  })

  it('shows a session-expired message when authFetch throws (pre-request refresh failed)', async () => {
    mockUser = adminUser
    mockList([model({ is_enabled: true, is_default: false })])
    // authFetch throws (does not resolve) when it cannot refresh an expired token.
    authFetchMock.mockRejectedValue(new Error('Session expired. Please login again.'))

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Disable claude-opus-4-8'))
    await waitFor(() => {
      expect(screen.getByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument()
    })
    expect(screen.queryByText('모델 업데이트에 실패했습니다.')).not.toBeInTheDocument()
  })

  it("keeps a failed mutation's error visible when a parallel mutation refetches", async () => {
    mockUser = adminUser
    const opus = model({
      id: 'claude-opus-4-8',
      display_name: 'Claude Opus 4.8',
      provider: 'anthropic',
      is_default: false,
      is_enabled: true,
    })
    const gemini = model({
      id: 'gemini-3-flash-preview',
      display_name: 'Gemini 3 Flash',
      provider: 'google',
      is_default: false,
      is_enabled: true,
    })
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([opus, gemini])) // mount
      .mockResolvedValueOnce(listResponse([opus, gemini])) // B's refetch after success

    // Both mutations run concurrently: A (opus) 403s, B (gemini) succeeds.
    const aPatch = deferred<Response>()
    const bPatch = deferred<Response>()
    authFetchMock.mockImplementation((url: string) =>
      String(url).includes('claude-opus-4-8') ? aPatch.promise : bPatch.promise
    )

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })

    // Start both (different providers → not locked) before either resolves.
    fireEvent.click(screen.getByLabelText('Set claude-opus-4-8 as default'))
    fireEvent.click(screen.getByLabelText('Set gemini-3-flash-preview as default'))

    // A fails → its action error is shown.
    aPatch.resolve({ ok: false, status: 403, json: async () => ({}) } as Response)
    await waitFor(() => {
      expect(screen.getByText('Admin 권한이 없습니다.')).toBeInTheDocument()
    })

    // B succeeds → its refetch runs setLoadError(null); A's actionError must survive it.
    bPatch.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalled()
    })
    expect(screen.getByText('Admin 권한이 없습니다.')).toBeInTheDocument()
  })

  it('shows an error message when the list fails to load', async () => {
    mockUser = adminUser
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    render(<ModelManagementPanel />)

    await waitFor(() => {
      expect(screen.getByText('모델 목록을 불러오지 못했습니다.')).toBeInTheDocument()
    })
  })

  it('disables the toggle only for an enabled default model', async () => {
    mockUser = adminUser
    mockList([model({ is_enabled: true, is_default: true })])

    render(<ModelManagementPanel />)

    await waitFor(() => {
      expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Disable claude-opus-4-8')).toBeDisabled()
    // Default models expose no "Set default" action.
    expect(screen.queryByLabelText('Set claude-opus-4-8 as default')).not.toBeInTheDocument()
  })

  it('allows re-enabling a disabled default model (recovery from anomalous state)', async () => {
    mockUser = adminUser
    mockList([model({ is_enabled: false, is_default: true })])

    render(<ModelManagementPanel />)

    await waitFor(() => {
      expect(screen.getByLabelText('Enable claude-opus-4-8')).toBeInTheDocument()
    })
    // Disabled default must remain recoverable — the Enable action stays active.
    expect(screen.getByLabelText('Enable claude-opus-4-8')).not.toBeDisabled()
  })

  it('locks sibling "Set default" buttons in the same provider while a mutation is pending', async () => {
    mockUser = adminUser
    const opus = model({
      id: 'claude-opus-4-8',
      display_name: 'Claude Opus 4.8',
      provider: 'anthropic',
      is_default: false,
      is_enabled: true,
    })
    const sonnet = model({
      id: 'claude-sonnet-5',
      display_name: 'Claude Sonnet 5',
      provider: 'anthropic',
      is_default: false,
      is_enabled: true,
    })
    mockList([opus, sonnet])
    // Keep the PATCH in-flight so the pending lock stays asserted.
    const patch = deferred<Response>()
    authFetchMock.mockReturnValue(patch.promise)

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Set claude-sonnet-5 as default')).not.toBeDisabled()

    fireEvent.click(screen.getByLabelText('Set claude-opus-4-8 as default'))

    // The sibling default button in the same provider must lock immediately.
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-sonnet-5 as default')).toBeDisabled()
    })

    patch.resolve({ ok: true, status: 200, json: async () => ({}) })
  })

  it('discards a stale refetch when a newer mutation refetches first (P1 race)', async () => {
    mockUser = adminUser
    const opus = model({
      id: 'claude-opus-4-8',
      display_name: 'Claude Opus 4.8',
      provider: 'anthropic',
      is_default: false,
      is_enabled: true,
    })
    const gemini = model({
      id: 'gemini-3-flash-preview',
      display_name: 'Gemini 3 Flash',
      provider: 'google',
      is_default: false,
      is_enabled: true,
    })

    const older = deferred<Response>() // opus refetch (gen 2, started first)
    const newer = deferred<Response>() // gemini refetch (gen 3, started second)

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([opus, gemini])) // mount (gen 1)
      .mockReturnValueOnce(older.promise) // gen 2
      .mockReturnValueOnce(newer.promise) // gen 3
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })

    // Mutation A (anthropic) → refetch call 2 is deferred.
    fireEvent.click(screen.getByLabelText('Set claude-opus-4-8 as default'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })

    // Mutation B (google — different provider, not locked) → refetch call 3 is deferred.
    fireEvent.click(screen.getByLabelText('Set gemini-3-flash-preview as default'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(3)
    })

    // Newest refetch resolves first → gemini becomes the default.
    newer.resolve(
      listResponse([
        { ...opus, is_default: false },
        { ...gemini, is_default: true },
      ])
    )
    await waitFor(() => {
      expect(screen.queryByLabelText('Set gemini-3-flash-preview as default')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()

    // Stale (older) refetch resolves late with contradictory data → must be discarded.
    older.resolve(
      listResponse([
        { ...opus, is_default: true },
        { ...gemini, is_default: false },
      ])
    )
    // Both mutations have now run through to fetchModels(); state must still reflect the newer refetch.
    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByLabelText('Set gemini-3-flash-preview as default')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
  })

  it('targets the configured backend URL for GET, PATCH and DELETE (P1)', async () => {
    mockUser = adminUser
    mockBackendUrl = 'http://other-host:9000'
    const opus = model({ id: 'claude-opus-4-8', is_enabled: true, is_default: false })
    const legacy = model({ id: 'claude-legacy-2', is_enabled: false, is_default: false })
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([opus, legacy])) // mount GET
      .mockResolvedValueOnce(listResponse([{ ...opus, is_default: true }, legacy])) // refetch after PATCH
      .mockResolvedValueOnce(listResponse([{ ...opus, is_default: true }])) // refetch after DELETE (legacy gone)
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })

    // GET must hit the admin-configured backend, not a relative/proxy path.
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      'http://other-host:9000/api/llm/models?include_disabled=true'
    )

    fireEvent.click(screen.getByLabelText('Set claude-opus-4-8 as default'))
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled()
    })
    // PATCH must target the same configured backend.
    expect(String(authFetchMock.mock.calls[0][0])).toBe(
      'http://other-host:9000/api/llm/models/claude-opus-4-8'
    )
    // Wait for the PATCH refetch to settle so the disabled legacy row is present to delete.
    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalled()
    })

    // DELETE must target the same configured backend too (delete shares the base URL).
    fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(2)
    })
    expect(String(authFetchMock.mock.calls[1][0])).toBe(
      'http://other-host:9000/api/llm/models/claude-legacy-2'
    )
    expect(authFetchMock.mock.calls[1][1].method).toBe('DELETE')
    // Fully drain the queue (DELETE → refetch → fetchModels) so no leftover
    // mockResolvedValueOnce can leak into the next test's mount GET.
    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalledTimes(2)
    })
    confirmSpy.mockRestore()
  })

  it('commits a successful older refetch even after a newer refetch failed first (P2)', async () => {
    mockUser = adminUser
    const opus = model({
      id: 'claude-opus-4-8',
      display_name: 'Claude Opus 4.8',
      provider: 'anthropic',
      is_default: false,
      is_enabled: true,
    })
    const gemini = model({
      id: 'gemini-3-flash-preview',
      display_name: 'Gemini 3 Flash',
      provider: 'google',
      is_default: false,
      is_enabled: true,
    })

    const earlier = deferred<Response>() // opus refetch (started first → lower gen)
    const later = deferred<Response>() // gemini refetch (started second → higher gen)

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(listResponse([opus, gemini])) // mount
      .mockReturnValueOnce(earlier.promise) // opus refetch
      .mockReturnValueOnce(later.promise) // gemini refetch
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(<ModelManagementPanel />)
    await waitFor(() => {
      expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    })

    // Mutation A (anthropic) → earlier refetch dispatched first.
    fireEvent.click(screen.getByLabelText('Set claude-opus-4-8 as default'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })
    // Mutation B (google — different provider, not locked) → later refetch dispatched second.
    fireEvent.click(screen.getByLabelText('Set gemini-3-flash-preview as default'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(3)
    })

    // The newer refetch FAILS first → a load error appears.
    later.resolve({ ok: false, status: 500, json: async () => ({}) } as Response)
    await waitFor(() => {
      expect(screen.getByText('모델 목록을 불러오지 못했습니다.')).toBeInTheDocument()
    })

    // The earlier refetch SUCCEEDS later with gemini promoted → its data must still commit,
    // clearing the load error rather than being discarded as "superseded".
    earlier.resolve(
      listResponse([
        { ...opus, is_default: false },
        { ...gemini, is_default: true },
      ])
    )
    await waitFor(() => {
      expect(
        screen.queryByLabelText('Set gemini-3-flash-preview as default')
      ).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Set claude-opus-4-8 as default')).toBeInTheDocument()
    expect(screen.queryByText('모델 목록을 불러오지 못했습니다.')).not.toBeInTheDocument()
  })

  // ───────────────────────────────────────────────────────────
  // Delete (real deletion + suppression) — disabled non-default rows only
  // ───────────────────────────────────────────────────────────
  describe('delete disabled models', () => {
    // Drain any leftover fetch `mockResolvedValueOnce` queue from an earlier test that
    // threw before consuming its queued responses (vi.clearAllMocks does not reset the
    // once-queue), so each delete test's mount GET reads exactly its own fixture.
    beforeEach(() => {
      vi.mocked(global.fetch).mockReset()
    })

    const enabledDefault = () =>
      model({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', is_enabled: true, is_default: true })
    const disabledLegacy = () =>
      model({
        id: 'claude-legacy-2',
        display_name: 'Claude Legacy 2',
        is_enabled: false,
        is_default: false,
      })

    it('offers Delete only on revealed disabled non-default rows, never on enabled or default rows', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      // Enabled default exposes no Delete; the disabled row is hidden so its Delete is unmounted.
      expect(screen.queryByLabelText('Delete claude-opus-4-8')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Delete claude-legacy-2')).not.toBeInTheDocument()

      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))

      // Revealed disabled non-default row now exposes Delete; the enabled default still does not.
      expect(screen.getByLabelText('Delete claude-legacy-2')).toBeInTheDocument()
      expect(screen.queryByLabelText('Delete claude-opus-4-8')).not.toBeInTheDocument()
    })

    it('never offers Delete on an anomalous (always-visible) disabled-default row', async () => {
      mockUser = adminUser
      mockList([
        model({ id: 'claude-opus-4-8', provider: 'anthropic', is_enabled: true, is_default: false }),
        model({
          id: 'gemini-broken-default',
          display_name: 'Gemini Broken Default',
          provider: 'google',
          is_enabled: false,
          is_default: true,
        }),
      ])

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByText('Gemini Broken Default')).toBeInTheDocument()
      })
      expect(screen.queryByLabelText('Delete gemini-broken-default')).not.toBeInTheDocument()
    })

    it('deletes after confirm, sends DELETE, then refetches and re-syncs the catalog', async () => {
      mockUser = adminUser
      const opus = enabledDefault()
      const legacy = disabledLegacy()
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(listResponse([opus, legacy])) // mount
        .mockResolvedValueOnce(listResponse([opus])) // refetch after delete: row gone
      authFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ model_id: 'claude-legacy-2', provider: 'anthropic' }),
      })
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      await waitFor(() => {
        expect(authFetchMock).toHaveBeenCalled()
      })
      const [url, opts] = authFetchMock.mock.calls[0]
      // DELETE targets the admin-configured backend (default backendUrl), same base as load/patch.
      expect(String(url)).toBe(`${DEFAULT_BACKEND_URL}/api/llm/models/claude-legacy-2`)
      expect(opts.method).toBe('DELETE')
      expect(confirmSpy).toHaveBeenCalled()

      // Refetch drops the row and the global catalog is re-synced.
      await waitFor(() => {
        expect(fetchModelsMock).toHaveBeenCalled()
      })
      expect(screen.queryByText('Claude Legacy 2')).not.toBeInTheDocument()
      confirmSpy.mockRestore()
    })

    it('does not call the API when the delete confirm is dismissed', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      expect(confirmSpy).toHaveBeenCalled()
      expect(authFetchMock).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('shows a session-expired message when delete returns 401', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])
      authFetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      await waitFor(() => {
        expect(screen.getByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument()
      })
      confirmSpy.mockRestore()
    })

    it('shows an admin-required message when delete returns 403', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])
      authFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      await waitFor(() => {
        expect(screen.getByText('Admin 권한이 없습니다.')).toBeInTheDocument()
      })
      confirmSpy.mockRestore()
    })

    it('surfaces the backend detail message when delete is rejected with 409', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])
      authFetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ detail: "Cannot delete default model 'claude-legacy-2'." }),
      })
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      await waitFor(() => {
        expect(
          screen.getByText("Cannot delete default model 'claude-legacy-2'.")
        ).toBeInTheDocument()
      })
      confirmSpy.mockRestore()
    })

    it('disables the Delete button while its request is in flight', async () => {
      mockUser = adminUser
      mockList([enabledDefault(), disabledLegacy()])
      const del = deferred<Response>()
      authFetchMock.mockReturnValue(del.promise)
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<ModelManagementPanel />)
      await waitFor(() => {
        expect(screen.getByLabelText('Show disabled models (1)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByLabelText('Show disabled models (1)'))
      fireEvent.click(screen.getByLabelText('Delete claude-legacy-2'))

      await waitFor(() => {
        expect(screen.getByLabelText('Delete claude-legacy-2')).toBeDisabled()
      })
      del.resolve({ ok: true, status: 200, json: async () => ({}) })
      confirmSpy.mockRestore()
    })
  })
})
