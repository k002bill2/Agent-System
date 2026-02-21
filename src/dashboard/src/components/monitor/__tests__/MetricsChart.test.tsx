import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetricsChart } from '../MetricsChart'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeBucket(overrides: Partial<{
  timestamp: string
  success_rate: number
  avg_duration_ms: number
  total_cost: number
  task_count: number
}> = {}) {
  return {
    timestamp: '2024-06-01T12:00:00Z',
    success_rate: 0.95,
    avg_duration_ms: 1200,
    total_cost: 0.05,
    task_count: 10,
    ...overrides,
  }
}

const defaultProps = {
  buckets: [] as ReturnType<typeof makeBucket>[],
  mode: 'success_rate' as const,
  selectedPeriod: '1h' as const,
  onPeriodChange: vi.fn(),
}

describe('MetricsChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Empty State ─────────────────────────────────────────

  it('renders empty state when buckets is empty', () => {
    render(<MetricsChart {...defaultProps} />)
    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  it('shows "Success Rate" title in success_rate mode with empty buckets', () => {
    render(<MetricsChart {...defaultProps} mode="success_rate" />)
    expect(screen.getByText('Success Rate')).toBeInTheDocument()
  })

  it('shows "Cost Trend" title in cost mode with empty buckets', () => {
    render(<MetricsChart {...defaultProps} mode="cost" />)
    expect(screen.getByText('Cost Trend')).toBeInTheDocument()
  })

  // ─── Period Selector ─────────────────────────────────────

  it('renders all period buttons', () => {
    render(<MetricsChart {...defaultProps} />)
    expect(screen.getByText('1H')).toBeInTheDocument()
    expect(screen.getByText('6H')).toBeInTheDocument()
    expect(screen.getByText('24H')).toBeInTheDocument()
  })

  it('calls onPeriodChange when a period button is clicked', () => {
    const onPeriodChange = vi.fn()
    render(<MetricsChart {...defaultProps} onPeriodChange={onPeriodChange} />)
    fireEvent.click(screen.getByText('6H'))
    expect(onPeriodChange).toHaveBeenCalledWith('6h')
  })

  it('calls onPeriodChange with "24h" when 24H button is clicked', () => {
    const onPeriodChange = vi.fn()
    render(<MetricsChart {...defaultProps} onPeriodChange={onPeriodChange} />)
    fireEvent.click(screen.getByText('24H'))
    expect(onPeriodChange).toHaveBeenCalledWith('24h')
  })

  it('calls onPeriodChange with "1h" when 1H button is clicked', () => {
    const onPeriodChange = vi.fn()
    render(<MetricsChart {...defaultProps} onPeriodChange={onPeriodChange} />)
    fireEvent.click(screen.getByText('1H'))
    expect(onPeriodChange).toHaveBeenCalledWith('1h')
  })

  // ─── Chart with Data ─────────────────────────────────────

  it('renders SVG chart when buckets are provided', () => {
    const buckets = [
      makeBucket({ timestamp: '2024-06-01T12:00:00Z', success_rate: 0.9 }),
      makeBucket({ timestamp: '2024-06-01T12:05:00Z', success_rate: 0.95 }),
    ]
    render(<MetricsChart {...defaultProps} buckets={buckets} />)
    // Should render an SVG element with appropriate aria-label
    const svg = screen.getByRole('img')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Success rate chart')
  })

  it('renders cost chart SVG with appropriate aria-label', () => {
    const buckets = [
      makeBucket({ timestamp: '2024-06-01T12:00:00Z', total_cost: 1.5 }),
      makeBucket({ timestamp: '2024-06-01T12:05:00Z', total_cost: 2.0 }),
    ]
    render(<MetricsChart {...defaultProps} buckets={buckets} mode="cost" />)
    const svg = screen.getByRole('img')
    expect(svg).toHaveAttribute('aria-label', 'Cost trend chart')
  })

  it('renders "Success Rate" title with data in success_rate mode', () => {
    const buckets = [makeBucket()]
    render(<MetricsChart {...defaultProps} buckets={buckets} mode="success_rate" />)
    expect(screen.getByText('Success Rate')).toBeInTheDocument()
  })

  it('renders "Cost Trend" title with data in cost mode', () => {
    const buckets = [makeBucket()]
    render(<MetricsChart {...defaultProps} buckets={buckets} mode="cost" />)
    expect(screen.getByText('Cost Trend')).toBeInTheDocument()
  })

  // ─── Y-axis labels (format) ──────────────────────────────

  it('renders percentage Y-axis labels in success_rate mode', () => {
    const buckets = [
      makeBucket({ success_rate: 0.5 }),
      makeBucket({ success_rate: 1.0, timestamp: '2024-06-01T12:05:00Z' }),
    ]
    render(<MetricsChart {...defaultProps} buckets={buckets} mode="success_rate" />)
    // Should render 0.0% and 100.0% among the y-axis labels
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })

  it('renders dollar Y-axis labels in cost mode', () => {
    const buckets = [
      makeBucket({ total_cost: 0, timestamp: '2024-06-01T12:00:00Z' }),
      makeBucket({ total_cost: 10, timestamp: '2024-06-01T12:05:00Z' }),
    ]
    render(<MetricsChart {...defaultProps} buckets={buckets} mode="cost" />)
    // Check at least one dollar label is present
    const allText = screen.getAllByText(/^\$/)
    expect(allText.length).toBeGreaterThan(0)
  })

  // ─── Single data point ───────────────────────────────────

  it('renders chart with a single data point', () => {
    const buckets = [makeBucket({ success_rate: 0.8 })]
    render(<MetricsChart {...defaultProps} buckets={buckets} />)
    const svg = screen.getByRole('img')
    expect(svg).toBeInTheDocument()
  })

  // ─── Multiple data points ────────────────────────────────

  it('renders chart with multiple data points', () => {
    const buckets = Array.from({ length: 10 }, (_, i) =>
      makeBucket({
        timestamp: `2024-06-01T${String(12 + i).padStart(2, '0')}:00:00Z`,
        success_rate: 0.7 + i * 0.03,
        total_cost: i * 0.5,
      })
    )
    render(<MetricsChart {...defaultProps} buckets={buckets} />)
    const svg = screen.getByRole('img')
    expect(svg).toBeInTheDocument()
  })

  // ─── className prop ──────────────────────────────────────

  it('passes className to the container div (empty state)', () => {
    const { container } = render(
      <MetricsChart {...defaultProps} className="custom-class" />
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('passes className to the container div (with data)', () => {
    const { container } = render(
      <MetricsChart {...defaultProps} buckets={[makeBucket()]} className="my-chart" />
    )
    expect(container.firstChild).toHaveClass('my-chart')
  })

  // ─── No data available text not shown with data ──────────

  it('does not show "No data available" when buckets have data', () => {
    render(<MetricsChart {...defaultProps} buckets={[makeBucket()]} />)
    expect(screen.queryByText('No data available')).not.toBeInTheDocument()
  })
})
