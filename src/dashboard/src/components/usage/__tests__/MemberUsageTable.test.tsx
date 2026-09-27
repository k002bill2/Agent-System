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

  it('renders token-first usage with estimated cost', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    expect(screen.getAllByText('1.5K tokens').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Estimated cost $5.00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders provider column headers including internal CLI providers', () => {
    render(
      <MemberUsageTable
        records={[makeRecord(), makeRecord({ id: 'r2', provider: 'codex_cli' })]}
        isLoading={false}
      />
    )
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Codex CLI')).toBeInTheDocument()
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
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

  it('sorts by total tokens on header click', () => {
    const records = [
      makeRecord({ user_email: 'small@test.com', total_tokens: 100, cost_usd: 1, id: 'r1', user_id: 'u1' }),
      makeRecord({ user_email: 'large@test.com', total_tokens: 2000, cost_usd: 100, id: 'r2', user_id: 'u2' }),
    ]

    render(<MemberUsageTable records={records} isLoading={false} />)

    // Default: descending (largest token total first)
    const rows = screen.getAllByRole('row')
    // rows[0] is header, rows[1] should be largest
    expect(rows[1]).toHaveTextContent('large@test.com')

    // Click to toggle sort
    fireEvent.click(screen.getByText('Total Tokens'))
    const rowsAfter = screen.getAllByRole('row')
    expect(rowsAfter[1]).toHaveTextContent('small@test.com')
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
  // ── 미귀속 = "사용자 미확인" 이지 "사용량 0" 이 아니다 (감사 §8) ──

  it('labels records without a user as unattributed rather than Unknown', () => {
    render(
      <MemberUsageTable
        records={[makeRecord({ user_id: null, user_email: null })]}
        isLoading={false}
      />
    )
    expect(screen.getByText('미귀속 (호스트 세션 · 사용자 정보 없음)')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.getByLabelText('사용자를 확인할 수 없는 사용량')).toBeInTheDocument()
  })

  it('reports the summary-provided unattributed request count', () => {
    render(
      <MemberUsageTable
        records={[makeRecord({ user_id: null, user_email: null })]}
        isLoading={false}
        unattributedRequests={42}
      />
    )
    expect(screen.getByText('42건 · 사용자 미확인')).toBeInTheDocument()
  })

  it('falls back to the record count when the summary omits the count', () => {
    // 구버전 페이로드에서는 집계값이 0 으로 내려온다. 0 을 그대로 쓰면 행이 존재하는데도
    // "0건" 이라고 말하게 되므로, 0/누락은 "미보고" 로 보고 레코드에서 센 값을 쓴다.
    render(
      <MemberUsageTable
        records={[makeRecord({ user_id: null, user_email: null, request_count: 7 })]}
        isLoading={false}
        unattributedRequests={0}
      />
    )
    expect(screen.getByText('7건 · 사용자 미확인')).toBeInTheDocument()
    expect(screen.queryByText('0건 · 사용자 미확인')).not.toBeInTheDocument()
  })

  it('keeps an identified member row unchanged', () => {
    render(<MemberUsageTable records={[makeRecord()]} isLoading={false} />)
    expect(screen.queryByText(/사용자 미확인/)).not.toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  // ── unknown cost ≠ $0.00 ────────────────────────────────

  it('shows an unmeasured-cost marker instead of a dollar amount', () => {
    render(
      <MemberUsageTable
        records={[makeRecord({ cost_usd: 0, cost_state: 'unknown' })]}
        isLoading={false}
      />
    )
    expect(screen.getAllByText('비용 미측정').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Estimated cost \$0\.00/)).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('비용 미측정 — 0 달러라는 뜻이 아닙니다'),
    ).toBeInTheDocument()
  })

  it('still shows $0.00 for a measured zero cost', () => {
    render(
      <MemberUsageTable
        records={[makeRecord({ cost_usd: 0, cost_state: 'known' })]}
        isLoading={false}
      />
    )
    expect(screen.getAllByText('Estimated cost $0.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('비용 미측정')).not.toBeInTheDocument()
  })

  it('labels a mix of measured and unmeasured costs as partial', () => {
    render(
      <MemberUsageTable
        records={[
          makeRecord({ id: 'r1', cost_usd: 5, cost_state: 'known' }),
          makeRecord({ id: 'r2', cost_usd: 0, cost_state: 'unknown' }),
        ]}
        isLoading={false}
      />
    )
    // provider 셀과 멤버 합계 두 곳 모두 불완전한 금액임을 밝힌다.
    const partial = screen.getAllByLabelText(
      '추정 비용 $5.00 — 일부 레코드는 비용 미측정이라 실제보다 작을 수 있습니다',
    )
    expect(partial).toHaveLength(2)
    partial.forEach(el => expect(el).toHaveTextContent('Estimated cost $5.00 · 일부 미측정'))
  })
})
