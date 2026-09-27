import { render, screen, fireEvent } from '@testing-library/react'
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
  Pie: ({ data }: { data?: Array<{ name: string }> }) => (
    <div data-testid="pie" data-names={(data ?? []).map(d => d.name).join('|')} />
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

const mockFetchSummary = vi.fn()
const mockFetchProviders = vi.fn()
const mockSyncProvider = vi.fn().mockResolvedValue(undefined)
const mockSetPeriod = vi.fn()

vi.mock('../stores/externalUsage', () => ({
  useExternalUsageStore: vi.fn(() => ({
    summary: null,
    providers: [],
    isLoading: false,
    error: null,
    fetchSummary: mockFetchSummary,
    fetchProviders: mockFetchProviders,
    syncProvider: mockSyncProvider,
    period: { days: 30 },
    setPeriod: mockSetPeriod,
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
  // ── coverage / unknown cost / period (R2, R3, R5) ───────

  const baseStore = {
    providers: [],
    isLoading: false,
    error: null,
    fetchSummary: mockFetchSummary,
    fetchProviders: mockFetchProviders,
    syncProvider: mockSyncProvider,
    period: { days: 30 },
    setPeriod: mockSetPeriod,
  }

  const makeProviderSummary = (overrides: Record<string, unknown> = {}) => ({
    provider: 'anthropic',
    period_start: '2025-01-01T00:00:00Z',
    period_end: '2025-01-31T23:59:59Z',
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cost_usd: 0,
    total_requests: 3,
    model_breakdown: {},
    member_breakdown: {},
    ...overrides,
  })

  const mockStore = (overrides: Record<string, unknown>) => {
    vi.mocked(useExternalUsageStore).mockReturnValue({
      ...baseStore,
      summary: null,
      ...overrides,
    } as unknown as ReturnType<typeof useExternalUsageStore>)
  }

  const makeSummary = (overrides: Record<string, unknown> = {}) => ({
    providers: [],
    total_cost_usd: 0,
    records: [],
    period_start: '2025-01-01T00:00:00Z',
    period_end: '2025-01-31T23:59:59Z',
    ...overrides,
  })

  it('keeps an unknown-cost provider in the pie data instead of filtering it out', () => {
    mockStore({
      summary: makeSummary({
        providers: [
          makeProviderSummary({
            provider: 'anthropic',
            total_cost_usd: 0,
            cost_state: 'unknown',
            unknown_cost_requests: 3,
          }),
        ],
      }),
    })

    render(<ExternalUsagePage />)

    // `total_cost_usd > 0` 필터가 남아 있으면 이 이름이 통째로 사라진다.
    expect(screen.getByTestId('pie').getAttribute('data-names')).toBe('Anthropic (비용 미측정)')
  })

  it('still omits a provider with no cost and no tokens', () => {
    mockStore({
      summary: makeSummary({
        providers: [
          makeProviderSummary({
            provider: 'anthropic',
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost_usd: 0,
            total_requests: 0,
            cost_state: 'known',
          }),
        ],
      }),
    })

    render(<ExternalUsagePage />)

    // 그릴 조각이 하나도 없으면 차트 대신 빈 상태를 보여준다.
    expect(screen.queryByTestId('pie')).not.toBeInTheDocument()
    expect(screen.getByText('No estimated cost data available')).toBeInTheDocument()
  })

  it('explains how many records were excluded from the cost total', () => {
    mockStore({
      summary: makeSummary({
        providers: [
          makeProviderSummary({
            provider: 'anthropic',
            cost_state: 'unknown',
            unknown_cost_requests: 3,
            request_unit: 'session',
          }),
        ],
      }),
    })

    render(<ExternalUsagePage />)

    expect(screen.getByText('3건은 비용이 측정되지 않아 비용 합계에서 제외됨')).toBeInTheDocument()
    expect(screen.getByText(/비용 미측정: Anthropic \(3세션/)).toBeInTheDocument()
  })

  it('marks an unknown-cost provider card without printing a dollar figure', () => {
    mockStore({
      summary: makeSummary({
        providers: [
          makeProviderSummary({
            provider: 'anthropic',
            cost_state: 'unknown',
            unknown_cost_requests: 3,
            collection_source: 'claude_session_snapshot',
            request_unit: 'session',
          }),
        ],
      }),
    })

    render(<ExternalUsagePage />)

    // 요약 카드와 상세 표 두 곳 모두에 같은 마커가 붙는다.
    expect(
      screen.getAllByLabelText('Anthropic 비용 미측정 — 0 달러라는 뜻이 아닙니다'),
    ).toHaveLength(2)
    expect(screen.queryByText('Estimated cost $0.00')).not.toBeInTheDocument()
    // 두 카드를 같은 모집단으로 오독하지 않도록 수집 경로를 남긴다 (감사 §3).
    expect(screen.getByText('3세션 · 호스트 세션 스냅샷')).toBeInTheDocument()
  })

  it('keeps printing the amount for a measured zero cost', () => {
    mockStore({
      summary: makeSummary({
        providers: [
          makeProviderSummary({ provider: 'anthropic', total_cost_usd: 0, cost_state: 'known' }),
        ],
      }),
    })

    render(<ExternalUsagePage />)

    expect(screen.getAllByText('Estimated cost $0.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/비용 미측정/)).not.toBeInTheDocument()
  })

  it('states the selected period and the collection coverage', () => {
    mockStore({
      period: { days: 7 },
      summary: makeSummary({
        coverage: {
          requested_start: '2025-01-01T00:00:00Z',
          requested_end: '2025-01-08T00:00:00Z',
          period_days: 7,
          sources: [
            {
              collection_source: 'internal_ledger',
              provider: 'codex_cli',
              record_count: 16,
              request_unit: 'ledger_record',
              cost_state: 'known',
              date_basis: 'event',
              note: 'AOS 내부 호출만',
            },
          ],
        },
      }),
    })

    render(<ExternalUsagePage />)

    const section = screen.getByLabelText('조회 기간 및 수집 범위')
    expect(section).toBeInTheDocument()
    expect(screen.getByText('최근 7일')).toBeInTheDocument()
    expect(
      screen.getByLabelText('수집 범위: AOS 내부 원장 16건, AOS 내부 호출만'),
    ).toBeInTheDocument()
  })

  it('says coverage is unavailable rather than showing nothing', () => {
    mockStore({ summary: makeSummary({}) })

    render(<ExternalUsagePage />)

    expect(screen.getByText('수집 범위 정보 없음')).toBeInTheDocument()
  })

  it('routes the period selector through the shared store', () => {
    mockStore({ period: { days: 7 }, summary: null })

    render(<ExternalUsagePage />)

    const select = screen.getByLabelText('조회 기간 선택') as HTMLSelectElement
    expect(select.value).toBe('7')

    fireEvent.change(select, { target: { value: '90' } })
    expect(mockSetPeriod).toHaveBeenCalledWith(90)
  })

  it('lets the store resolve the window instead of passing a locally frozen one', () => {
    mockStore({ period: { days: 7 }, summary: null })

    render(<ExternalUsagePage />)

    expect(mockFetchSummary).toHaveBeenCalledWith()
  })
})
