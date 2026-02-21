import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrganizationStats } from '../OrganizationStats'
import type { Organization, OrganizationStats as OrgStats } from '../../../stores/organizations'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  FolderKanban: (props: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  Coins: (props: Record<string, unknown>) => <span data-testid="icon-coins" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="icon-zap" {...props} />,
  Calendar: (props: Record<string, unknown>) => <span data-testid="icon-calendar" {...props} />,
}))

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    description: null,
    status: 'active',
    plan: 'free',
    contact_email: null,
    contact_name: null,
    logo_url: null,
    primary_color: null,
    max_members: 5,
    max_projects: 3,
    max_sessions_per_day: 100,
    max_tokens_per_month: 50000,
    current_members: 2,
    current_projects: 1,
    tokens_used_this_month: 10000,
    settings: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeStats(overrides: Partial<OrgStats> = {}): OrgStats {
  return {
    organization_id: 'org-1',
    total_members: 3,
    active_members: 2,
    total_projects: 2,
    active_projects: 1,
    total_sessions: 50,
    sessions_today: 5,
    sessions_this_week: 20,
    tokens_used_today: 500,
    tokens_used_this_month: 15000,
    total_cost_this_month: 42.50,
    api_calls_today: 120,
    ...overrides,
  }
}

describe('OrganizationStats', () => {
  it('renders loading skeletons when isLoading', () => {
    const { container } = render(
      <OrganizationStats
        organization={makeOrg()}
        stats={null}
        isLoading={true}
      />
    )
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBe(4)
  })

  it('renders stat labels when not loading', () => {
    render(
      <OrganizationStats
        organization={makeOrg()}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Sessions Today')).toBeInTheDocument()
    expect(screen.getByText('Tokens This Month')).toBeInTheDocument()
  })

  it('uses organization values when stats is null', () => {
    render(
      <OrganizationStats
        organization={makeOrg({ current_members: 4, current_projects: 2 })}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('uses stats values when stats is provided', () => {
    render(
      <OrganizationStats
        organization={makeOrg()}
        stats={makeStats({ total_members: 7, total_projects: 4 })}
        isLoading={false}
      />
    )
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders additional stats section when stats is provided', () => {
    render(
      <OrganizationStats
        organization={makeOrg()}
        stats={makeStats()}
        isLoading={false}
      />
    )
    expect(screen.getByText('API Calls Today')).toBeInTheDocument()
    expect(screen.getByText('Sessions This Week')).toBeInTheDocument()
    expect(screen.getByText('Cost This Month')).toBeInTheDocument()
  })

  it('does not render additional stats when stats is null', () => {
    render(
      <OrganizationStats
        organization={makeOrg()}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.queryByText('API Calls Today')).not.toBeInTheDocument()
  })

  it('renders the plan info section', () => {
    render(
      <OrganizationStats
        organization={makeOrg({ plan: 'free' })}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.getByText('Free Plan')).toBeInTheDocument()
    expect(screen.getByText('Upgrade to unlock more features and higher limits')).toBeInTheDocument()
  })

  it('renders upgrade button for non-enterprise plans', () => {
    render(
      <OrganizationStats
        organization={makeOrg({ plan: 'starter' })}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument()
  })

  it('hides upgrade button for enterprise plan', () => {
    render(
      <OrganizationStats
        organization={makeOrg({ plan: 'enterprise' })}
        stats={null}
        isLoading={false}
      />
    )
    expect(screen.queryByText('Upgrade Plan')).not.toBeInTheDocument()
    expect(screen.getByText('Unlimited access with priority support')).toBeInTheDocument()
  })

  it('formats cost with two decimal places', () => {
    render(
      <OrganizationStats
        organization={makeOrg()}
        stats={makeStats({ total_cost_this_month: 42.5 })}
        isLoading={false}
      />
    )
    expect(screen.getByText('$42.50')).toBeInTheDocument()
  })
})
