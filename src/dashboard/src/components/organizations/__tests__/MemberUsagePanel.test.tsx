import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberUsagePanel } from '../MemberUsagePanel'
import type { MemberUsageResponse } from '../../../stores/organizations'

// Mock recharts - needs DOM measurements not available in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => <div data-testid={`area-${dataKey}`} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
}))

// Mock lucide-react icons (use importOriginal to include all exports)
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    BarChart3: (props: Record<string, unknown>) => <span data-testid="icon-barchart" {...props} />,
    Coins: (props: Record<string, unknown>) => <span data-testid="icon-coins" {...props} />,
    Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
    Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
    TrendingUp: (props: Record<string, unknown>) => <span data-testid="icon-trending" {...props} />,
  }
})

const mockFetchMemberUsage = vi.fn()
const mockMemberUsage: MemberUsageResponse = {
  organization_id: 'org-1',
  period: 'month',
  total_tokens: 25000,
  members: [
    {
      id: 'mem-1',
      user_id: 'u1',
      email: 'alice@test.com',
      name: 'Alice',
      role: 'admin',
      tokens_used_today: 100,
      tokens_used_this_month: 15000,
      sessions_today: 3,
      sessions_this_month: 20,
      last_active_at: '2024-01-10T00:00:00Z',
      percentage_of_org: 60,
    },
    {
      id: 'mem-2',
      user_id: 'u2',
      email: 'bob@test.com',
      name: 'Bob',
      role: 'member',
      tokens_used_today: 50,
      tokens_used_this_month: 10000,
      sessions_today: 1,
      sessions_this_month: 10,
      last_active_at: null,
      percentage_of_org: 40,
    },
  ],
}

const mockFetchMemberUsageDetail = vi.fn()
const mockClearMemberUsageDetail = vi.fn()

vi.mock('../../../stores/organizations', () => ({
  useOrganizationsStore: vi.fn(() => ({
    memberUsage: mockMemberUsage,
    memberUsageDetail: null,
    isMemberDetailLoading: false,
    fetchMemberUsage: mockFetchMemberUsage,
    fetchMemberUsageDetail: mockFetchMemberUsageDetail,
    clearMemberUsageDetail: mockClearMemberUsageDetail,
  })),
}))

describe('MemberUsagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls fetchMemberUsage on mount with organization id and default period', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(mockFetchMemberUsage).toHaveBeenCalledWith('org-1', 'month')
  })

  it('renders "Member Usage" heading', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('Member Usage')).toBeInTheDocument()
  })

  it('renders period buttons', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('This Week')).toBeInTheDocument()
    expect(screen.getByText('This Month')).toBeInTheDocument()
  })

  it('renders summary stats', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('Active Members')).toBeInTheDocument()
    expect(screen.getByText('Tokens Today')).toBeInTheDocument()
  })

  it('renders total tokens value', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('25,000')).toBeInTheDocument()
  })

  it('renders member names', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders member roles', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
  })

  it('renders active members count (both members have tokens > 0)', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    // Active members: 2/2 (both have tokens > 0)
    const activeMembersStat = screen.getByText('/ 2')
    expect(activeMembersStat).toBeInTheDocument()
  })

  it('renders loading skeletons when memberUsage is null', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: null,
      memberUsageDetail: null,
      isMemberDetailLoading: false,
      fetchMemberUsage: mockFetchMemberUsage,
      fetchMemberUsageDetail: mockFetchMemberUsageDetail,
      clearMemberUsageDetail: mockClearMemberUsageDetail,
    })

    const { container } = render(<MemberUsagePanel organizationId="org-1" />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThanOrEqual(1)

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: mockMemberUsage,
      memberUsageDetail: null,
      isMemberDetailLoading: false,
      fetchMemberUsage: mockFetchMemberUsage,
      fetchMemberUsageDetail: mockFetchMemberUsageDetail,
      clearMemberUsageDetail: mockClearMemberUsageDetail,
    })
  })

  it('shows empty state when members array is empty', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: { ...mockMemberUsage, members: [] },
      memberUsageDetail: null,
      isMemberDetailLoading: false,
      fetchMemberUsage: mockFetchMemberUsage,
      fetchMemberUsageDetail: mockFetchMemberUsageDetail,
      clearMemberUsageDetail: mockClearMemberUsageDetail,
    })

    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('No usage data yet')).toBeInTheDocument()

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: mockMemberUsage,
      memberUsageDetail: null,
      isMemberDetailLoading: false,
      fetchMemberUsage: mockFetchMemberUsage,
      fetchMemberUsageDetail: mockFetchMemberUsageDetail,
      clearMemberUsageDetail: mockClearMemberUsageDetail,
    })
  })

  it('changes period when clicking a period button', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    fireEvent.click(screen.getByText('Today'))
    expect(mockFetchMemberUsage).toHaveBeenCalledWith('org-1', 'day')
  })
})
