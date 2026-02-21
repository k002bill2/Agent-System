import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ClaudeUsageDashboard } from '../ClaudeUsageDashboard'
import type { ClaudeUsageResponse } from '../../../types/claudeUsage'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: (props: Record<string, unknown>) => <svg data-testid="icon-bar-chart" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg data-testid="icon-refresh" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="icon-alert" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
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

describe('ClaudeUsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(screen.getByText('Claude Code Usage')).toBeInTheDocument()
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
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows "Cached" indicator when data is cached', () => {
    mockUsage = makeUsageResponse({ oauthAvailable: true, isCached: true, cacheAgeMinutes: 5 })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Cached')).toBeInTheDocument()
  })

  it('shows "Offline" indicator when oauth is not available', () => {
    mockUsage = makeUsageResponse({ oauthAvailable: false })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows weekly token usage section', () => {
    mockUsage = makeUsageResponse({
      weeklyTotalTokens: 1500000,
      weeklySonnetTokens: 1000000,
      weeklyOpusTokens: 500000,
    })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Weekly Token Usage (Local)')).toBeInTheDocument()
    expect(screen.getByText('1.5M')).toBeInTheDocument()
    expect(screen.getByText('1.0M')).toBeInTheDocument()
    expect(screen.getByText('500.0K')).toBeInTheDocument()
  })

  it('shows plan limit progress bars when oauth is available', () => {
    mockUsage = makeUsageResponse()
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Current Session')).toBeInTheDocument()
    expect(screen.getByText('All Models (7d)')).toBeInTheDocument()
  })

  it('shows oauth error message when oauth is not available', () => {
    mockUsage = makeUsageResponse({
      oauthAvailable: false,
      oauthError: 'Token expired',
      planLimits: [],
    })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('Token expired')).toBeInTheDocument()
    expect(screen.getByText('Showing local token statistics only.')).toBeInTheDocument()
  })

  it('formats small token counts without suffix', () => {
    mockUsage = makeUsageResponse({ weeklyTotalTokens: 500, weeklySonnetTokens: 300, weeklyOpusTokens: 200 })
    render(<ClaudeUsageDashboard />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })
})
