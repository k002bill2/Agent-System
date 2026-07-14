import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { ClaudeUsageDashboard } from '../ClaudeUsageDashboard'
import type { ClaudeUsageResponse } from '../../../types/claudeUsage'

const mockApiGet = vi.hoisted(() => vi.fn())

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: (props: Record<string, unknown>) => <svg data-testid="icon-bar-chart" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg data-testid="icon-refresh" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="icon-alert" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
}))

vi.mock('../../../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
  },
}))

// Store mock state
const mockFetchUsage = vi.fn()
const mockClearError = vi.fn()

let mockUsage: ClaudeUsageResponse | null = null
let mockIsLoading = false
let mockError: string | null = null
let mockLastFetched: Date | null = null

vi.mock('../../../stores/claudeUsage', () => ({
  useClaudeUsageStore: () => ({
    usage: mockUsage,
    isLoading: mockIsLoading,
    error: mockError,
    lastFetched: mockLastFetched,
    fetchUsage: mockFetchUsage,
    clearError: mockClearError,
  }),
}))

const makeUsageResponse = (overrides?: Partial<ClaudeUsageResponse>): ClaudeUsageResponse => ({
  lastComputedDate: '2024-01-15',
  totalSessions: 100,
  totalMessages: 500,
  weeklyActivity: [],
  weeklyModelTokens: [],
  modelUsage: {},
  planLimits: [
    { name: 'fiveHour', displayName: 'Current Session', utilization: 30, resetsInHours: 2, resetsInMinutes: 15 },
    { name: 'sevenDay', displayName: 'All Models (7d)', utilization: 45, resetsInHours: 120, resetsInMinutes: 0 },
  ],
  oauthAvailable: true,
  weeklyTotalTokens: 150000,
  weeklySonnetTokens: 100000,
  weeklyOpusTokens: 50000,
  ...overrides,
})

const defaultCodexPlan = {
  available: true,
  codexLimit: {
    limitId: 'codex',
    limitName: null,
    primary: {
      usedPercent: 56,
      remainingPercent: 44,
      windowDurationMins: 300,
      resetsAt: 1783174155,
      resetsAtIso: '2026-07-04T12:49:15+00:00',
      resetsInMinutes: 120,
    },
    secondary: {
      usedPercent: 40,
      remainingPercent: 60,
      windowDurationMins: 10080,
      resetsAt: 1783706099,
      resetsAtIso: '2026-07-10T16:34:59+00:00',
      resetsInMinutes: 8640,
    },
    planType: 'plus',
    rateLimitReachedType: null,
  },
  rateLimitResetCredits: { availableCount: 1 },
  isCached: false,
  cacheAgeSeconds: null,
}

const defaultCodexCli = {
  available: true,
  fiveHourTokens: 0,
  fiveHourThreads: 0,
  weeklyTokens: 0,
  weeklyThreads: 0,
  totalTokens: 0,
  totalThreads: 0,
  byModel: [],
}

describe('ClaudeUsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/usage/codex-plan')) {
        return Promise.resolve(defaultCodexPlan)
      }
      return Promise.resolve(defaultCodexCli)
    })
    mockUsage = null
    mockIsLoading = false
    mockError = null
    mockLastFetched = null
  })

  afterEach(() => {
    cleanup()
  })

  it('calls fetchUsage on mount', () => {
    render(<ClaudeUsageDashboard />)
    expect(mockFetchUsage).toHaveBeenCalled()
  })

  it('shows error state with error message', () => {
    mockError = 'Network error'
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Plan Usage Limits')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading with no data', () => {
    mockIsLoading = true
    mockUsage = null
    const { container } = render(<ClaudeUsageDashboard />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows empty state when no usage data', () => {
    mockUsage = null
    mockIsLoading = false
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('No usage data available')).toBeInTheDocument()
  })

  it('renders plan usage limits heading with data', () => {
    mockUsage = makeUsageResponse()
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Plan Usage Limits')).toBeInTheDocument()
  })

  it('shows "Live" indicator when oauth is available and not cached', () => {
    mockUsage = makeUsageResponse({ oauthAvailable: true, isCached: false })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Claude Live')).toBeInTheDocument()
  })

  it('shows "Cached" indicator when data is cached', () => {
    mockUsage = makeUsageResponse({ oauthAvailable: true, isCached: true, cacheAgeMinutes: 5 })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Claude Cached')).toBeInTheDocument()
  })

  it('shows "Offline" indicator when oauth is not available', () => {
    mockUsage = makeUsageResponse({ oauthAvailable: false })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Claude Offline')).toBeInTheDocument()
  })

  it('shows weekly token usage section', () => {
    mockUsage = makeUsageResponse({
      weeklyTotalTokens: 1500000,
      weeklySonnetTokens: 1000000,
      weeklyOpusTokens: 500000,
    })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Local Token Usage (diagnostic)')).toBeInTheDocument()
    expect(screen.getByText('1.5M')).toBeInTheDocument()
    expect(screen.getByText('1.0M')).toBeInTheDocument()
    expect(screen.getByText('500.0K')).toBeInTheDocument()
  })

  it('shows radial plan usage metrics when oauth is available', () => {
    mockUsage = makeUsageResponse()
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Claude Session')).toBeInTheDocument()
    expect(screen.getByText('Claude Weekly')).toBeInTheDocument()
  })

  it('shows ChatGPT Codex subscription remaining limits', async () => {
    mockUsage = makeUsageResponse({ weeklyTotalTokens: 200000 })

    const { container } = render(<ClaudeUsageDashboard />)
    const utils = within(container)

    // "Codex reset credits" renders only after the codex-plan fetch resolves,
    // so awaiting it guarantees the async plan data has settled before we assert.
    // Scoping to this render's container keeps the query immune to any dashboard
    // leaked from a prior async test still lingering in document.body.
    expect(await utils.findByText('Codex reset credits: 1')).toBeInTheDocument()
    // primary(300분)→"Codex 5h", secondary(10080분)→"Codex Weekly"로 창 길이 기준 라벨링된다.
    expect(utils.getByText('Codex 5h')).toBeInTheDocument()
    expect(utils.getByText('Codex Weekly')).toBeInTheDocument()
    expect(utils.getByText('44% left')).toBeInTheDocument()
    expect(utils.getByText('60% left')).toBeInTheDocument()
  })

  it('labels a weekly-only codex window as "Codex Weekly" (5h window removed)', async () => {
    // Real-world after OpenAI removed the 5-hour window: the app-server returns a
    // single weekly window (windowDurationMins: 10080) in the *primary* slot and
    // leaves secondary null. Labeling must follow window duration, not slot position,
    // so the surviving window renders as "Codex Weekly" — never "Codex 5h".
    mockUsage = makeUsageResponse({ weeklyTotalTokens: 200000 })
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/usage/codex-plan')) {
        return Promise.resolve({
          available: true,
          codexLimit: {
            limitId: 'codex',
            limitName: null,
            primary: {
              usedPercent: 75,
              remainingPercent: 25,
              windowDurationMins: 10080,
              resetsAt: 1784488253,
              resetsAtIso: '2026-07-19T19:10:53+00:00',
              resetsInMinutes: 7542,
            },
            secondary: null,
            planType: 'plus',
            rateLimitReachedType: null,
          },
          rateLimitResetCredits: { availableCount: 1 },
          isCached: true,
          cacheAgeSeconds: 2,
        })
      }
      return Promise.resolve(defaultCodexCli)
    })

    const { container } = render(<ClaudeUsageDashboard />)
    const utils = within(container)

    expect(await utils.findByText('Codex Weekly')).toBeInTheDocument()
    expect(utils.getByText('25% left')).toBeInTheDocument()
    expect(utils.queryByText('Codex 5h')).not.toBeInTheDocument()
  })

  it('shows local codex token usage as diagnostics', async () => {
    mockUsage = makeUsageResponse({ weeklyTotalTokens: 200000 })
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/usage/codex-plan')) {
        return Promise.resolve(defaultCodexPlan)
      }
      return Promise.resolve({
        available: true,
        fiveHourTokens: 12000,
        fiveHourThreads: 1,
        weeklyTokens: 50000,
        weeklyThreads: 3,
        totalTokens: 80000,
        totalThreads: 5,
        byModel: [
          { name: 'gpt-5.5', tokens: 42000, threads: 2 },
          { name: 'codex-auto-review', tokens: 8000, threads: 1 },
        ],
      })
    })

    const { container } = render(<ClaudeUsageDashboard />)
    const utils = within(container)

    // The diagnostic grid shows the codex weekly tokens (50000 → "50.0K") only
    // after the codex-CLI fetch resolves. Opus is 50.0K by default, so once the
    // codex value lands there are exactly two "50.0K" cells — waiting for that
    // both settles the async fetch (no bleed into the next test) and verifies the
    // codex diagnostic value. within(container) keeps it scoped to this render.
    await waitFor(() => expect(utils.getAllByText('50.0K')).toHaveLength(2))
    expect(utils.getByText('Codex')).toBeInTheDocument()
  })

  it('bypasses codex plan cache when refresh is clicked', async () => {
    mockUsage = makeUsageResponse()

    render(<ClaudeUsageDashboard />)

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/usage/codex-plan?'),
        expect.objectContaining({ timeout: 15_000 })
      )
    })

    mockApiGet.mockClear()
    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/usage/codex-plan?refresh=true&'),
        expect.objectContaining({ timeout: 15_000 })
      )
    })
  })

  it('shows oauth error message when oauth is not available', () => {
    mockUsage = makeUsageResponse({
      oauthAvailable: false,
      oauthError: 'Token expired',
      planLimits: [],
    })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Token expired')).toBeInTheDocument()
    expect(
      screen.getByText('Claude plan limits unavailable; Codex plan limits are checked separately.')
    ).toBeInTheDocument()
  })

  it('formats small token counts without suffix', () => {
    mockUsage = makeUsageResponse({ weeklyTotalTokens: 500, weeklySonnetTokens: 300, weeklyOpusTokens: 200 })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })
})
