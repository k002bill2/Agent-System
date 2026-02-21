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
    expect(screen.getByText('Daily Cost Trend')).toBeInTheDocument()
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
          makeRecord({ provider: 'anthropic', cost_usd: 0.5, id: 'rec-2' }),
        ]}
      />
    )
    expect(screen.getByTestId('area-openai')).toBeInTheDocument()
    expect(screen.getByTestId('area-anthropic')).toBeInTheDocument()
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
})
