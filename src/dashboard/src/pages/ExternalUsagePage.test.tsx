import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    AlertCircle: icon, BarChart3: icon, CheckCircle: icon, Hash: icon,
    GitCompareArrows: icon, RefreshCw: icon, Settings: icon,
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
  })

  it('renders the page header', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('LLM Usage')).toBeInTheDocument()
    expect(screen.getByText('Internal CLI subscription usage and API fallback tracking')).toBeInTheDocument()
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

    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
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

    expect(screen.getByText('Estimated Cost by Provider')).toBeInTheDocument()
    expect(screen.getByText('Estimated Cost by Model')).toBeInTheDocument()
  })

  it('renders provider details table', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByText('Provider Details')).toBeInTheDocument()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByText('Input Tokens')).toBeInTheDocument()
    expect(screen.getByText('Output Tokens')).toBeInTheDocument()
    expect(screen.getByText('Estimated Cost')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders the admin key manager section', () => {
    render(<ExternalUsagePage />)

    expect(screen.getByTestId('admin-key-manager')).toBeInTheDocument()
  })

  it('renders reconciliation status from the summary contract', () => {
    vi.mocked(useExternalUsageStore).mockReturnValue({
      summary: {
        total_cost_usd: 0.0123,
        providers: [
          {
            provider: 'claude_cli',
            total_cost_usd: 0.0123,
            total_input_tokens: 123,
            total_output_tokens: 45,
            total_requests: 1,
            model_breakdown: {},
          },
        ],
        records: [],
        reconciliation: {
          primary_source: 'internal_ledger',
          provider_billing_enabled: false,
          internal_total_tokens: 168,
          internal_total_cost_usd: 0.0123,
          internal_total_requests: 1,
          provider_billing_total_tokens: 0,
          provider_billing_total_cost_usd: 0,
          provider_billing_total_requests: 0,
          provider_billing_record_count: 0,
          comparisons: [
            {
              provider: 'claude_cli',
              internal_total_tokens: 168,
              internal_total_cost_usd: 0.0123,
              internal_total_requests: 1,
              provider_billing_total_tokens: 0,
              provider_billing_total_cost_usd: 0,
              provider_billing_total_requests: 0,
              delta_tokens: -168,
              delta_cost_usd: -0.0123,
              status: 'ledger_only',
            },
          ],
        },
      },
      providers: [],
      isLoading: false,
      error: null,
      fetchSummary: mockFetchSummary,
      fetchProviders: mockFetchProviders,
      syncProvider: mockSyncProvider,
    } as unknown as ReturnType<typeof useExternalUsageStore>)

    render(<ExternalUsagePage />)

    expect(screen.getByText('Usage Reconciliation')).toBeInTheDocument()
    expect(screen.getByText('Primary source')).toBeInTheDocument()
    expect(screen.getByText('Internal CLI ledger')).toBeInTheDocument()
    expect(screen.getByText('Provider billing disabled')).toBeInTheDocument()
    expect(screen.getAllByText('Claude CLI').length).toBeGreaterThanOrEqual(1)
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

  it('shows token-first usage data with estimated cost when summary is available', () => {
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

    expect(screen.getByText(/Estimated cost \$42\.50/)).toBeInTheDocument()
    expect(screen.getByText('1.8M')).toBeInTheDocument()
    expect(screen.getByText('Estimated cost $30.00')).toBeInTheDocument()
    expect(screen.getByText('Estimated cost $12.50')).toBeInTheDocument()
  })
})
