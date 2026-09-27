import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CostMonitor, CostBadge } from '../CostMonitor'
import { useExternalUsageStore } from '../../stores/externalUsage'
import type {
  ExternalUsageSummaryResponse,
  UsageSummary,
} from '../../stores/externalUsage'

// Mock fetch (CLI session analytics)
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock external usage store
const mockFetchExternalSummary = vi.fn()

vi.mock('../../stores/externalUsage', () => ({
  useExternalUsageStore: vi.fn(() => ({
    summary: null,
    fetchSummary: mockFetchExternalSummary,
  })),
}))

function mockCostResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        total_cost: 0,
        total_tokens: 0,
        avg_cost_per_task: 0,
        by_agent: [],
        by_model: [],
        projected_monthly: 0,
        ...overrides,
      }),
  }
}

function mockClaudeUsageResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        weeklyTotalTokens: 0,
        weeklyModelTokens: [],
        weeklyModelTokensSource: 'empty',
        planLimits: [],
        oauthAvailable: false,
        ...overrides,
      }),
  }
}

// ─────────────────────────────────────────────────────────────
// External usage fixtures (unknown cost / provenance / coverage)
// ─────────────────────────────────────────────────────────────

function makeProviderSummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
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
  }
}

function makeExternalSummary(
  overrides: Partial<ExternalUsageSummaryResponse> = {},
): ExternalUsageSummaryResponse {
  return {
    providers: [],
    total_cost_usd: 0,
    records: [],
    period_start: '2025-01-01T00:00:00Z',
    period_end: '2025-01-31T23:59:59Z',
    ...overrides,
  }
}

const DEFAULT_EXTERNAL_STORE = {
  summary: null,
  fetchSummary: mockFetchExternalSummary,
  period: { days: 30 },
}

/** 스토어 훅은 파일 전역 mock 이므로 테스트마다 명시적으로 되돌린다. */
function setExternalStore(partial: Record<string, unknown> = {}) {
  vi.mocked(useExternalUsageStore).mockImplementation(
    () =>
      ({ ...DEFAULT_EXTERNAL_STORE, ...partial }) as unknown as ReturnType<
        typeof useExternalUsageStore
      >,
  )
}

describe('CostMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with no data', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('LLM Provider Usage')).toBeInTheDocument()
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('No provider usage data yet')).toBeInTheDocument()
    })
  })

  it('displays 0 tokens and FREE when no usage', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('FREE')).toBeInTheDocument()
    })
  })

  it('renders provider cards when data exists', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
      expect(screen.getAllByText('1.5K').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders Claude Code usage as a separate source', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/usage')) {
        return Promise.resolve(mockClaudeUsageResponse({
          weeklyTotalTokens: 42000,
          weeklyModelTokensSource: 'jsonl-fallback',
          planLimits: [{ name: 'sevenDay', displayName: 'All models', utilization: 50 }],
          oauthAvailable: true,
        }))
      }
      return Promise.resolve(mockCostResponse({
        total_cost: 0,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-opus-4-8', provider: 'codex_cli', cost: 0, tokens: 1500, percentage: 100 },
        ],
      }))
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('AOS Runtime')).toBeInTheDocument()
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
      expect(screen.getByText('42.0K')).toBeInTheDocument()
      expect(screen.getByText('7d 50% · JSONL')).toBeInTheDocument()
    })
  })

  it('uses explicit provider metadata before model-name inference', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0,
        total_tokens: 1500,
        by_model: [
          {
            category: 'model',
            value: 'claude-opus-4-8',
            provider: 'codex_cli',
            cost: 0,
            tokens: 1500,
            percentage: 100,
          },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Codex CLI')).toBeInTheDocument()
      expect(screen.queryByText('Anthropic Claude')).not.toBeInTheDocument()
    })
  })

  it('formats large token counts correctly', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 1.5,
        total_tokens: 1000000,
        by_model: [
          { category: 'model', value: 'gemini-2.0-flash', cost: 1.5, tokens: 1000000, percentage: 100 },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getAllByText('1.0M').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows error when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ detail: 'Failed to fetch cost analytics' }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch cost analytics')).toBeInTheDocument()
    })
  })
})

describe('CostBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no tokens used', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    const { container } = render(<CostBadge />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('shows token count and cost when data exists', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText(/1.5K tokens/)).toBeInTheDocument()
      expect(screen.getByText('$0.01')).toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────
// R1: 백엔드가 "모른다"고 한 것을 프론트가 다시 추측하지 않는다
// ─────────────────────────────────────────────────────────────

describe('CostMonitor provider attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setExternalStore()
  })

  it('groups a backend-unattributed entry under Unattributed', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.02,
        total_tokens: 2000,
        by_model: [
          {
            category: 'model',
            // 'unknown' 은 IGNORED_MODELS 에도 들어 있다. unattributed 처리가 스킵보다
            // 뒤에 오면 이 그룹이 통째로 사라진다.
            value: 'unknown',
            provider: null,
            provider_source: 'unattributed',
            cost: 0.02,
            tokens: 2000,
            percentage: 100,
          },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Unattributed (출처 미확인)')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('출처를 확인할 수 없는 사용량')).toBeInTheDocument()
  })

  it('does not re-guess a provider from the model string when the backend gave up', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.02,
        total_tokens: 2000,
        by_model: [
          {
            category: 'model',
            // 모델명은 Anthropic 으로 읽히지만 백엔드는 귀속 불가라고 말했다.
            value: 'claude-sonnet-4-6',
            provider: null,
            provider_source: 'unattributed',
            cost: 0.02,
            tokens: 2000,
            percentage: 100,
          },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Unattributed (출처 미확인)')).toBeInTheDocument()
    })
    expect(screen.queryByText('Anthropic Claude')).not.toBeInTheDocument()
  })

  it('falls back to Unattributed when provider_source is present but the provider is unusable', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.02,
        total_tokens: 2000,
        by_model: [
          {
            category: 'model',
            value: 'claude-sonnet-4-6',
            provider: 'not_a_known_provider',
            provider_source: 'ledger_provider_column',
            cost: 0.02,
            tokens: 2000,
            percentage: 100,
          },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Unattributed (출처 미확인)')).toBeInTheDocument()
    })
  })

  it('keeps model-string inference for legacy payloads without provider_source', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
    })
    expect(screen.queryByText('Unattributed (출처 미확인)')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
// R2/R5: (실제:) 라벨 정정 + unknown 이어도 배지가 사라지지 않는다
// ─────────────────────────────────────────────────────────────

describe('CostMonitor external cost label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )
  })

  it('calls the internal summary an estimate, not the provider bill', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 1.25,
        providers: [makeProviderSummary({ total_cost_usd: 1.25, cost_state: 'known' })],
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('(내부 추정 합계: $1.25)')).toBeInTheDocument()
    })
    expect(screen.queryByText(/\(실제: /)).not.toBeInTheDocument()
  })

  it('never relabels the internal estimate as the provider bill, even with a compared row', async () => {
    // `summary.total_cost_usd` 는 reconciliation 여부와 무관하게 내부 추정 합계다.
    // 청구액(9.99)과 다른 값(1.25)을 넣어, 라벨만 바꾸면 통과하는 자기확인 테스트를 막는다.
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 1.25,
        providers: [makeProviderSummary({ total_cost_usd: 1.25, cost_state: 'known' })],
        reconciliation: {
          primary_source: 'provider_billing',
          provider_billing_enabled: true,
          internal_total_tokens: 0,
          internal_total_cost_usd: 1.25,
          internal_total_requests: 0,
          provider_billing_total_tokens: 0,
          provider_billing_total_cost_usd: 9.99,
          provider_billing_total_requests: 0,
          provider_billing_record_count: 1,
          comparisons: [
            {
              provider: 'anthropic',
              internal_total_tokens: 0,
              internal_total_cost_usd: 1.25,
              internal_total_requests: 0,
              provider_billing_total_tokens: 0,
              provider_billing_total_cost_usd: 9.99,
              provider_billing_total_requests: 0,
              delta_tokens: 0,
              delta_cost_usd: 8.74,
              status: 'compared',
            },
          ],
        },
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('(내부 추정 합계: $1.25)')).toBeInTheDocument()
    })
    // 내부 추정치를 청구액으로 부르지 않는다.
    expect(screen.queryByText(/실제 청구/)).not.toBeInTheDocument()
    // 청구액(9.99)을 요약 총계에서 만들어내지도 않는다.
    expect(screen.queryByText(/9\.99/)).not.toBeInTheDocument()
  })

  it('keeps the partial-measurement warning when reconciliation is present', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 0.5,
        providers: [
          makeProviderSummary({ provider: 'anthropic', total_cost_usd: 0.5, cost_state: 'known' }),
          makeProviderSummary({ provider: 'codex_cli', total_cost_usd: 0, cost_state: 'unknown' }),
        ],
        reconciliation: {
          primary_source: 'provider_billing',
          provider_billing_enabled: true,
          internal_total_tokens: 0,
          internal_total_cost_usd: 0.5,
          internal_total_requests: 0,
          provider_billing_total_tokens: 0,
          provider_billing_total_cost_usd: 7.5,
          provider_billing_total_requests: 0,
          provider_billing_record_count: 1,
          comparisons: [
            {
              provider: 'anthropic',
              internal_total_tokens: 0,
              internal_total_cost_usd: 0.5,
              internal_total_requests: 0,
              provider_billing_total_tokens: 0,
              provider_billing_total_cost_usd: 7.5,
              provider_billing_total_requests: 0,
              delta_tokens: 0,
              delta_cost_usd: 7,
              status: 'compared',
            },
          ],
        },
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('(내부 추정 합계: $0.50 · 일부 미측정)')).toBeInTheDocument()
    })
    expect(screen.queryByText(/실제 청구/)).not.toBeInTheDocument()
  })

  it('reports unmeasured cost instead of a dollar figure', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 0,
        providers: [makeProviderSummary({ total_cost_usd: 0, cost_state: 'unknown' })],
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('(비용 미측정)')).toBeInTheDocument()
    })
    expect(
      screen.getByLabelText('비용이 측정되지 않았습니다. 0 달러라는 뜻이 아닙니다.'),
    ).toBeInTheDocument()
  })

  it('states the analytics period next to the analytics totals', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        period_days: 365,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 1.25,
        providers: [makeProviderSummary({ total_cost_usd: 1.25, cost_state: 'known' })],
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('AOS 집계 최근 365일')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('AOS 집계 기간 최근 365일')).toBeInTheDocument()
  })

  it('flags a partially measured total', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 0.5,
        providers: [
          makeProviderSummary({ provider: 'anthropic', total_cost_usd: 0.5, cost_state: 'known' }),
          makeProviderSummary({ provider: 'codex_cli', total_cost_usd: 0, cost_state: 'unknown' }),
        ],
      }),
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('(내부 추정 합계: $0.50 · 일부 미측정)')).toBeInTheDocument()
    })
  })
})

describe('CostBadge provenance surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )
  })

  it('does not vanish when every external cost is unmeasured', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 0,
        providers: [makeProviderSummary({ total_cost_usd: 0, cost_state: 'unknown' })],
      }),
    })

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText('(비용 미측정)')).toBeInTheDocument()
    })
  })

  it('shows the selected period from the shared store', async () => {
    setExternalStore({ period: { days: 7 } })

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText('최근 7일')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('조회 기간 최근 7일')).toBeInTheDocument()
  })

  it('falls back to the default period when the store has none', async () => {
    setExternalStore({ period: null })

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText('최근 30일')).toBeInTheDocument()
    })
  })

  it('labels analytics totals with the backend analytics period, not the external period', async () => {
    // 코스트 분석은 `time_range=all` 로 부르므로 백엔드가 365일을 돌려준다.
    // 외부 사용량 스토어의 30일 기간을 그 숫자에 붙이면 다른 모집단을 같은 기간으로 읽게 된다.
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        period_days: 365,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )
    setExternalStore({ period: { days: 30 } })

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText('AOS 집계 최근 365일')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('AOS 집계 기간 최근 365일')).toBeInTheDocument()
    // 외부 사용량 기간은 그대로 자기 기간을 말한다 — 두 라벨이 공존해야 한다.
    expect(screen.getByText('최근 30일')).toBeInTheDocument()
    expect(screen.getByLabelText('조회 기간 최근 30일')).toBeInTheDocument()
  })

  it('omits the analytics period label when the backend did not send period_days', async () => {
    setExternalStore({ period: { days: 30 } })

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText('최근 30일')).toBeInTheDocument()
    })
    expect(screen.queryByText(/AOS 집계 최근/)).not.toBeInTheDocument()
  })

  it('summarizes collection coverage per source', async () => {
    setExternalStore({
      summary: makeExternalSummary({
        total_cost_usd: 1,
        providers: [makeProviderSummary({ total_cost_usd: 1, cost_state: 'known' })],
        coverage: {
          requested_start: '2025-01-01T00:00:00Z',
          requested_end: '2025-01-31T23:59:59Z',
          period_days: 30,
          sources: [
            {
              collection_source: 'internal_ledger',
              provider: 'codex_cli',
              record_count: 16,
              request_unit: 'ledger_record',
              cost_state: 'known',
              date_basis: 'event',
              note: null,
            },
            {
              collection_source: 'claude_session_snapshot',
              provider: 'anthropic',
              record_count: 3,
              request_unit: 'session',
              cost_state: 'unknown',
              date_basis: 'session_last_activity',
              note: null,
            },
          ],
        },
      }),
    })

    render(<CostBadge />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('수집 범위 AOS 내부 원장 16건 · Claude 세션 스냅샷 3세션'),
      ).toBeInTheDocument()
    })
  })
})
