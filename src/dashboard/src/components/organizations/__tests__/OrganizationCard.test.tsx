import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrganizationCard } from '../OrganizationCard'
import type { Organization } from '../../../stores/organizations'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Building2: (props: Record<string, unknown>) => <span data-testid="icon-building" {...props} />,
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  FolderKanban: (props: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  MoreVertical: (props: Record<string, unknown>) => <span data-testid="icon-more" {...props} />,
  Settings: (props: Record<string, unknown>) => <span data-testid="icon-settings" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
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

const defaultProps = {
  organization: makeOrg(),
  isSelected: false,
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('OrganizationCard', () => {
  it('renders organization name and slug', () => {
    render(<OrganizationCard {...defaultProps} />)
    expect(screen.getByText('Test Org')).toBeInTheDocument()
    expect(screen.getByText('@test-org')).toBeInTheDocument()
  })

  it('renders plan badge', () => {
    render(<OrganizationCard {...defaultProps} />)
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('renders member and project counts', () => {
    render(<OrganizationCard {...defaultProps} />)
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('shows infinity for unlimited max_members', () => {
    const { container } = render(
      <OrganizationCard
        {...defaultProps}
        organization={makeOrg({ max_members: -1 })}
      />
    )
    // The icon-users sibling span should contain the infinity symbol
    const membersSection = container.querySelector('[data-testid="icon-users"]')!.closest('div')!
    expect(membersSection.textContent).toContain('\u221E')
  })

  it('shows infinity for unlimited max_projects', () => {
    const { container } = render(
      <OrganizationCard
        {...defaultProps}
        organization={makeOrg({ max_projects: -1 })}
      />
    )
    const projectsSection = container.querySelector('[data-testid="icon-folder"]')!.closest('div')!
    expect(projectsSection.textContent).toContain('\u221E')
  })

  it('renders description when provided', () => {
    render(
      <OrganizationCard
        {...defaultProps}
        organization={makeOrg({ description: 'A great org' })}
      />
    )
    expect(screen.getByText('A great org')).toBeInTheDocument()
  })

  it('does not render description when null', () => {
    render(<OrganizationCard {...defaultProps} />)
    // No description paragraph
    expect(screen.queryByText('A great org')).not.toBeInTheDocument()
  })

  it('renders logo image when logo_url is set', () => {
    render(
      <OrganizationCard
        {...defaultProps}
        organization={makeOrg({ logo_url: 'https://example.com/logo.png' })}
      />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png')
  })

  it('renders Building2 icon when no logo_url', () => {
    render(<OrganizationCard {...defaultProps} />)
    expect(screen.getByTestId('icon-building')).toBeInTheDocument()
  })

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    render(<OrganizationCard {...defaultProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Test Org'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('opens context menu and calls onEdit', () => {
    const onEdit = vi.fn()
    render(<OrganizationCard {...defaultProps} onEdit={onEdit} />)

    const moreBtn = screen.getByTestId('icon-more').closest('button')!
    fireEvent.click(moreBtn)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Settings'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('opens context menu and calls onDelete', () => {
    const onDelete = vi.fn()
    render(<OrganizationCard {...defaultProps} onDelete={onDelete} />)

    const moreBtn = screen.getByTestId('icon-more').closest('button')!
    fireEvent.click(moreBtn)

    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
