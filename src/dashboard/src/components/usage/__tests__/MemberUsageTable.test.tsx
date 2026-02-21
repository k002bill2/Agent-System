import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MemberUsageTable from '../MemberUsageTable'
import type { UnifiedUsageRecord } from '../../../stores/externalUsage'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    AlertTriangle: icon('alert'),
    ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'),
    Search: icon('search'),
  }
})

const makeRecord = (overrides?: Partial<UnifiedUsageRecord>): UnifiedUsageRecord => ({
  id: 'rec-1',
  provider: 'openai',
  timestamp: '2025-01-15T10:00:00Z',
  bucket_width: '1d',
  input_tokens: 1000,
  output_tokens: 500,
  total_tokens: 1500,
  cost_usd: 5.0,
  request_count: 10,
  model: 'gpt-4',
  user_id: 'user-1',
  user_email: 'alice@test.com',
  project_id: null,
  code_suggestions: null,
  code_acceptances: null,
  acceptance_rate: null,
  collected_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

describe('MemberUsageTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    render(<MemberUsageTable records={[]} isLoading={false} />)
    expect(screen.getByText('Usage by Member')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<MemberUsageTable records={[]} isLoading={true} />)
    expect(screen.getByText('Loading member data...')).toBeInTheDocument()
  })

  it('shows empty state when no records', () => {
    render(<MemberUsageTable records={[]} isLoading={false} />)
    expect(screen.getByText('No usage data available.')).toBeInTheDocument()
  })

  it('renders member row with email', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  it('renders cost column', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    // "$5.00" appears in both the provider column and total column
    expect(screen.getAllByText('$5.00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders provider column headers', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    expect(screen.getByPlaceholderText(/Search by email/)).toBeInTheDocument()
  })

  it('filters members by search query', () => {
    const records = [
      makeRecord({ user_email: 'alice@test.com', id: 'r1' }),
      makeRecord({ user_email: 'bob@test.com', user_id: 'user-2', id: 'r2' }),
    ]

    render(<MemberUsageTable records={records} isLoading={false} />)
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/Search by email/)
    fireEvent.change(input, { target: { value: 'alice' } })

    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.queryByText('bob@test.com')).not.toBeInTheDocument()
  })

  it('shows no match message when search yields nothing', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)

    const input = screen.getByPlaceholderText(/Search by email/)
    fireEvent.change(input, { target: { value: 'nonexistent' } })

    expect(screen.getByText('No members match your search.')).toBeInTheDocument()
  })

  it('sorts by total cost on header click', () => {
    const records = [
      makeRecord({ user_email: 'cheap@test.com', cost_usd: 1, id: 'r1', user_id: 'u1' }),
      makeRecord({ user_email: 'expensive@test.com', cost_usd: 100, id: 'r2', user_id: 'u2' }),
    ]

    render(<MemberUsageTable records={records} isLoading={false} />)

    // Default: descending (expensive first)
    const rows = screen.getAllByRole('row')
    // rows[0] is header, rows[1] should be expensive
    expect(rows[1]).toHaveTextContent('expensive@test.com')

    // Click to toggle sort
    fireEvent.click(screen.getByText('Total Cost'))
    const rowsAfter = screen.getAllByRole('row')
    expect(rowsAfter[1]).toHaveTextContent('cheap@test.com')
  })

  it('shows warning icon for high cost members', () => {
    render(
      <MemberUsageTable
        records={[makeRecord({ cost_usd: 60 })]}
        isLoading={false}
      />
    )
    expect(screen.getByTestId('icon-alert')).toBeInTheDocument()
  })

  it('shows GitHub Copilot specific columns', () => {
    render(
      <MemberUsageTable
        records={[
          makeRecord({
            provider: 'github_copilot',
            code_suggestions: 100,
            code_acceptances: 30,
          }),
        ]}
        isLoading={false}
      />
    )
    expect(screen.getByText('100 suggestions')).toBeInTheDocument()
    expect(screen.getByText('30.0% acceptance')).toBeInTheDocument()
  })
})
