import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    AlertCircle: icon, BarChart3: icon, CheckCircle: icon, DollarSign: icon,
    RefreshCw: icon, Settings: icon,
  }
})

// Mock recharts
vi.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Cell: () => null,
  Legend: () => null,
  Pie: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

const mockFetchSummary = vi.fn()
const mockFetchProviders = vi.fn()
const mockSyncProvider = vi.fn().mockResolvedValue(undefined)
const mockApiGet = vi.hoisted(() => vi.fn())

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
  },
}))

vi.mock('../stores/externalUsage', () => ({
  useExternalUsageStore: vi.fn(() => ({
    summary: null,
    providers: [],
    isLoading: false,
    error: null,
    fetchSummary: mockFetchSummary,
    fetchProviders: mockFetchProviders,
    syncProvider: mockSyncProvider,
  })),
}))

// Mock child components
vi.mock('../components/usage/MemberUsageTable', () => ({
  default: () => <div data-testid="member-usage-table">MemberUsageTable</div>,
}))

vi.mock('../components/usage/DailyCostTrend', () => ({
  default: () => <div data-testid="daily-cost-trend">DailyCostTrend</div>,
}))

vi.mock('../components/usage/AdminKeyManager', () => ({
  AdminKeyManager: () => <div data-testid="admin-key-manager">AdminKeyManager</div>,
}))

import { ExternalUsagePage } from './ExternalUsagePage'
import { useExternalUsageStore } from '../stores/externalUsage'

describe('ExternalUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockReturnValue(new Promise(() => {}))
  })

  it('renders the page header', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('External LLM Usage')).toBeInTheDocument()
    expect(screen.getByText('Monitor AOS local CLI usage first; deployment API billing keys remain available below')).toBeInTheDocument()
  })

  it('renders the Sync Now button', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('Sync Now')).toBeInTheDocument()
  })

  it('renders period selector with default options', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('Last 7 days')).toBeInTheDocument()
    // "Last 30 days" can appear in both the selector and as a card subtitle
    const last30 = screen.getAllByText(/Last 30 days/)
    expect(last30.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Last 90 days')).toBeInTheDocument()
  })

  it('renders Total Tokens card', () => {
    render(<ExternalUsagePage />)

    expect(screen.getAllByText('Total Tokens').length).toBeGreaterThanOrEqual(1)
  })

  it('renders provider cards', () => {
    render(<ExternalUsagePage />)

    // Provider names appear in cards and in the table, so use getAllByText
    const codexElements = screen.getAllByText('Codex CLI')
    expect(codexElements.length).toBeGreaterThanOrEqual(1)
    const openAiElements = screen.getAllByText('OpenAI')
    expect(openAiElements.length).toBeGreaterThanOrEqual(1)
    const copilotElements = screen.getAllByText('GitHub Copilot')
    expect(copilotElements.length).toBeGreaterThanOrEqual(1)
    const geminiElements = screen.getAllByText('Google Gemini')
    expect(geminiElements.length).toBeGreaterThanOrEqual(1)
    const anthropicElements = screen.getAllByText('Anthropic')
    expect(anthropicElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows error banner when error exists', () => {
    vi.mocked(useExternalUsageStore).mockReturnValue({
      summary: null,
      providers: [],
      isLoading: false,
      error: 'Failed to fetch usage data',
      fetchSummary: mockFetchSummary,
      fetchProviders: mockFetchProviders,
      syncProvider: mockSyncProvider,
    } as unknown as ReturnType<typeof useExternalUsageStore>)

    render(<ExternalUsagePage />)

    expect(screen.getByText('Failed to fetch usage data')).toBeInTheDocument()
  })

  it('shows loading indicator in cost display', () => {
    vi.mocked(useExternalUsageStore).mockReturnValue({
      summary: null,
      providers: [],
      isLoading: true,
      error: null,
      fetchSummary: mockFetchSummary,
      fetchProviders: mockFetchProviders,
      syncProvider: mockSyncProvider,
    } as unknown as ReturnType<typeof useExternalUsageStore>)

    render(<ExternalUsagePage />)

    // When loading, the total cost shows "..."
    const loadingIndicators = screen.getAllByText('...')
    expect(loadingIndicators.length).toBeGreaterThanOrEqual(1)
  })

  it('renders chart sections', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('Usage by Provider')).toBeInTheDocument()
    expect(screen.getByText('Usage by Model')).toBeInTheDocument()
  })

  it('renders provider details table', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('Provider Details')).toBeInTheDocument()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getAllByText('Total Tokens').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Output Tokens')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders the admin key manager section', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByTestId('admin-key-manager')).toBeInTheDocument()
  })

  it('calls fetchSummary and fetchProviders on mount', () => {
    render(<ExternalUsagePage />)

    expect(mockFetchSummary).toHaveBeenCalled()
    expect(mockFetchProviders).toHaveBeenCalled()
  })

  it('renders child components', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByTestId('member-usage-table')).toBeInTheDocument()
    expect(screen.getByTestId('daily-cost-trend')).toBeInTheDocument()
  })

  it('shows cost data when external summary is available and local usage is empty', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/usage') return Promise.resolve({ weeklyModelTokens: [] })
      if (url === '/api/usage/codex-cli') return Promise.resolve({ available: false, byModel: [] })
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })
    vi.mocked(useExternalUsageStore).mockReturnValue({
      summary: {
        total_cost_usd: 42.50,
        providers: [
          { provider: 'openai', total_cost_usd: 30, total_input_tokens: 1000000, total_output_tokens: 500000, total_requests: 150, model_breakdown: {} },
          { provider: 'anthropic', total_cost_usd: 12.50, total_input_tokens: 200000, total_output_tokens: 100000, total_requests: 50, model_breakdown: {} },
        ],
        records: [],
      },
      providers: [{ provider: 'openai', enabled: true }],
      isLoading: false,
      error: null,
      fetchSummary: mockFetchSummary,
      fetchProviders: mockFetchProviders,
      syncProvider: mockSyncProvider,
    } as unknown as ReturnType<typeof useExternalUsageStore>)

    render(<ExternalUsagePage />)

    await waitFor(() => expect(screen.getByText('1.8M')).toBeInTheDocument())
    // $30.00 appears in card and table, use getAllByText
    const openaiCost = screen.getAllByText('$30.00')
    expect(openaiCost.length).toBeGreaterThanOrEqual(1)
    const anthropicCost = screen.getAllByText('$12.50')
    expect(anthropicCost.length).toBeGreaterThanOrEqual(1)
  })

  it('shows local CLI usage when Claude and Codex usage APIs have data', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/usage') {
        return Promise.resolve({
          weeklyModelTokens: [
            { date: '2026-07-04', tokensByModel: { 'claude-opus-4-8': 2_000_000 } },
          ],
        })
      }
      if (url === '/api/usage/codex-cli') {
        return Promise.resolve({
          available: true,
          weeklyTokens: 3_000_000,
          weeklyThreads: 4,
          byModel: [{ name: 'gpt-5.5', tokens: 3_000_000, threads: 4 }],
          updatedAt: '2026-07-04T12:00:00Z',
        })
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    render(<ExternalUsagePage />)

    await waitFor(() => expect(screen.getByText('5.0M')).toBeInTheDocument())
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$0.00 actual cost').length).toBeGreaterThanOrEqual(2)
  })
})
