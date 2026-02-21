import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberUsagePanel } from '../MemberUsagePanel'
import type { MemberUsageResponse } from '../../../stores/organizations'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: (props: Record<string, unknown>) => <span data-testid="icon-barchart" {...props} />,
  Coins: (props: Record<string, unknown>) => <span data-testid="icon-coins" {...props} />,
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <span data-testid="icon-trending" {...props} />,
}))

const mockFetchMemberUsage = vi.fn()
const mockMemberUsage: MemberUsageResponse = {
  organization_id: 'org-1',
  period: 'month',
  total_tokens: 25000,
  members: [
    {
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

vi.mock('../../../stores/organizations', () => ({
  useOrganizationsStore: vi.fn(() => ({
    memberUsage: mockMemberUsage,
    fetchMemberUsage: mockFetchMemberUsage,
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
      fetchMemberUsage: mockFetchMemberUsage,
    })

    const { container } = render(<MemberUsagePanel organizationId="org-1" />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThanOrEqual(1)

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: mockMemberUsage,
      fetchMemberUsage: mockFetchMemberUsage,
    })
  })

  it('shows empty state when members array is empty', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: { ...mockMemberUsage, members: [] },
      fetchMemberUsage: mockFetchMemberUsage,
    })

    render(<MemberUsagePanel organizationId="org-1" />)
    expect(screen.getByText('No usage data yet')).toBeInTheDocument()

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      memberUsage: mockMemberUsage,
      fetchMemberUsage: mockFetchMemberUsage,
    })
  })

  it('changes period when clicking a period button', () => {
    render(<MemberUsagePanel organizationId="org-1" />)
    fireEvent.click(screen.getByText('Today'))
    expect(mockFetchMemberUsage).toHaveBeenCalledWith('org-1', 'day')
  })
})
