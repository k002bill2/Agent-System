import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DailyCostTrend from '../DailyCostTrend'
import type { UnifiedUsageRecord } from '../../../stores/externalUsage'

// Mock recharts - it needs DOM measurements not available in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`area-${dataKey}`} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}))

const makeRecord = (overrides?: Partial<UnifiedUsageRecord>): UnifiedUsageRecord => ({
  id: 'rec-1',
  provider: 'openai',
  timestamp: '2025-01-15T10:00:00Z',
  bucket_width: '1d',
  input_tokens: 1000,
  output_tokens: 500,
  total_tokens: 1500,
  cost_usd: 0.05,
  request_count: 10,
  model: 'gpt-4',
  user_id: 'user-1',
  user_email: 'test@test.com',
  project_id: null,
  code_suggestions: null,
  code_acceptances: null,
  acceptance_rate: null,
  collected_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

describe('DailyCostTrend', () => {
  it('renders title', () => {
    render(<DailyCostTrend records={[]} />)
    expect(screen.getByText('Daily Estimated Cost Trend')).toBeInTheDocument()
  })

  it('shows empty state when no records', () => {
    render(<DailyCostTrend records={[]} />)
    expect(screen.getByText(/데이터 없음/)).toBeInTheDocument()
  })

  it('renders chart when records exist', () => {
    render(<DailyCostTrend records={[makeRecord()]} />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('only renders area for providers with data', () => {
    render(
      <DailyCostTrend
        records={[
          makeRecord({ provider: 'openai', cost_usd: 1.0 }),
          makeRecord({ provider: 'codex_cli', cost_usd: 0.5, id: 'rec-2' }),
        ]}
      />
    )
    expect(screen.getByTestId('area-openai')).toBeInTheDocument()
    expect(screen.getByTestId('area-codex_cli')).toBeInTheDocument()
    expect(screen.queryByTestId('area-github_copilot')).not.toBeInTheDocument()
  })

  it('does not render chart for empty cost records', () => {
    render(
      <DailyCostTrend
        records={[makeRecord({ cost_usd: 0 })]}
      />
    )
    // Provider with 0 cost should not get an Area
    expect(screen.queryByTestId('area-openai')).not.toBeInTheDocument()
  })

  // ── unknown cost ≠ zero cost (감사 §2 / R2) ──────────────

  it('keeps an unknown-cost provider visible with an explicit marker', () => {
    render(
      <DailyCostTrend
        records={[makeRecord({ provider: 'anthropic', cost_usd: 0, cost_state: 'unknown' })]}
      />
    )
    // 비용이 "모름"인 provider 는 차트 카드에서 사라지면 안 된다.
    expect(screen.getByText(/비용 미측정: Anthropic \(1건\)/)).toBeInTheDocument()
    expect(
      screen.getByLabelText('비용이 측정되지 않아 추세선에 그려지지 않은 프로바이더'),
    ).toBeInTheDocument()
  })

  it('does not draw an unknown-cost provider as a zero-valued area', () => {
    render(
      <DailyCostTrend
        records={[makeRecord({ provider: 'anthropic', cost_usd: 0, cost_state: 'unknown' })]}
      />
    )
    // 모름을 0 면적으로 그리면 "0 달러였다"는 거짓 주장이 된다. 표면은 마커뿐이다.
    expect(screen.queryByTestId('area-anthropic')).not.toBeInTheDocument()
  })

  it('does not mark a measured zero-cost provider as unmeasured', () => {
    render(
      <DailyCostTrend
        records={[makeRecord({ provider: 'openai', cost_usd: 0, cost_state: 'known' })]}
      />
    )
    // 측정된 0 은 "모름"이 아니다 — 마커가 붙으면 안 된다.
    expect(screen.queryByText(/비용 미측정/)).not.toBeInTheDocument()
  })

  it('treats a legacy record without cost_state as measured', () => {
    render(<DailyCostTrend records={[makeRecord({ cost_usd: 0 })]} />)
    expect(screen.queryByText(/비용 미측정/)).not.toBeInTheDocument()
  })

  it('keeps drawing an area for a provider whose costs are partially known', () => {
    render(
      <DailyCostTrend
        records={[
          makeRecord({ provider: 'anthropic', cost_usd: 2.5, cost_state: 'known' }),
          makeRecord({ id: 'rec-2', provider: 'anthropic', cost_usd: 0, cost_state: 'unknown' }),
        ]}
      />
    )
    expect(screen.getByTestId('area-anthropic')).toBeInTheDocument()
    expect(screen.getByText(/비용 미측정: Anthropic \(1건\)/)).toBeInTheDocument()
  })

  // ── date_basis 근거 표시 (감사 §5 / R6) ──────────────────

  it('states the date basis when a session-snapshot record is present', () => {
    render(
      <DailyCostTrend
        records={[makeRecord({ provider: 'anthropic', date_basis: 'session_last_activity' })]}
      />
    )
    expect(
      screen.getByText(
        'Claude 스냅샷은 세션 누계를 마지막 활동일에 배치합니다 (실제 발생일별 분포 아님)',
      ),
    ).toBeInTheDocument()
  })

  it('omits the date basis note when every record is event-dated', () => {
    render(<DailyCostTrend records={[makeRecord({ date_basis: 'event' })]} />)
    expect(screen.queryByText(/마지막 활동일에 배치합니다/)).not.toBeInTheDocument()
  })
})
