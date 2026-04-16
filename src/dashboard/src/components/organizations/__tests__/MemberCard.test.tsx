import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberCard } from '../MemberCard'
import type { OrganizationMember, MemberRole } from '../../../stores/organizations'

// Mock lucide-react icons (use importOriginal to include all exports)
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    MoreVertical: (props: Record<string, unknown>) => <span data-testid="icon-more-vertical" {...props} />,
    Shield: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
    ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-shield-check" {...props} />,
    Eye: (props: Record<string, unknown>) => <span data-testid="icon-eye" {...props} />,
    User: (props: Record<string, unknown>) => <span data-testid="icon-user" {...props} />,
    Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  }
})

function makeMember(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    id: 'mem-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'member' as MemberRole,
    permissions: [],
    is_active: true,
    invited_by: null,
    invited_at: null,
    joined_at: '2024-01-01T00:00:00Z',
    last_active_at: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultProps = {
  member: makeMember(),
  currentUserId: 'user-99',
  canManage: false,
  onUpdateRole: vi.fn(),
  onRemove: vi.fn(),
}

describe('MemberCard', () => {
  it('renders member name and email', () => {
    render(<MemberCard {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders initial letter as avatar', () => {
    render(<MemberCard {...defaultProps} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to email when name is null', () => {
    render(
      <MemberCard
        {...defaultProps}
        member={makeMember({ name: null, email: 'bob@example.com' })}
      />
    )
    // Email appears twice: once as display name, once as email field
    const matches = screen.getAllByText('bob@example.com')
    expect(matches).toHaveLength(2)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('shows "(You)" for the current user', () => {
    render(
      <MemberCard
        {...defaultProps}
        member={makeMember({ user_id: 'user-99' })}
        currentUserId="user-99"
      />
    )
    expect(screen.getByText('(You)')).toBeInTheDocument()
  })

  it('does not show "(You)" for other users', () => {
    render(<MemberCard {...defaultProps} />)
    expect(screen.queryByText('(You)')).not.toBeInTheDocument()
  })

  it('renders role badge text', () => {
    render(<MemberCard {...defaultProps} member={makeMember({ role: 'admin' })} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('does not show menu button when canManage is false', () => {
    render(<MemberCard {...defaultProps} canManage={false} />)
    expect(screen.queryByTestId('icon-more-vertical')).not.toBeInTheDocument()
  })

  it('does not show menu button for the current user even if canManage', () => {
    render(
      <MemberCard
        {...defaultProps}
        canManage={true}
        member={makeMember({ user_id: 'user-99' })}
        currentUserId="user-99"
      />
    )
    expect(screen.queryByTestId('icon-more-vertical')).not.toBeInTheDocument()
  })

  it('does not show menu button for owner role', () => {
    render(
      <MemberCard
        {...defaultProps}
        canManage={true}
        member={makeMember({ role: 'owner' })}
      />
    )
    expect(screen.queryByTestId('icon-more-vertical')).not.toBeInTheDocument()
  })

  it('shows menu when clicking the action button (canManage + not owner + not self)', () => {
    render(
      <MemberCard
        {...defaultProps}
        canManage={true}
        member={makeMember({ role: 'member', user_id: 'user-1' })}
        currentUserId="user-99"
      />
    )
    // Menu should not be visible initially
    expect(screen.queryByText('Change Role')).not.toBeInTheDocument()

    // Click the menu button
    const menuBtn = screen.getByTestId('icon-more-vertical').closest('button')!
    fireEvent.click(menuBtn)

    expect(screen.getByText('Change Role')).toBeInTheDocument()
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('calls onUpdateRole when selecting a different role', () => {
    const onUpdateRole = vi.fn()
    render(
      <MemberCard
        {...defaultProps}
        canManage={true}
        member={makeMember({ role: 'member', user_id: 'user-1' })}
        currentUserId="user-99"
        onUpdateRole={onUpdateRole}
      />
    )
    const menuBtn = screen.getByTestId('icon-more-vertical').closest('button')!
    fireEvent.click(menuBtn)

    fireEvent.click(screen.getByText('Admin'))
    expect(onUpdateRole).toHaveBeenCalledWith('admin')
  })

  it('calls onRemove when clicking Remove', () => {
    const onRemove = vi.fn()
    render(
      <MemberCard
        {...defaultProps}
        canManage={true}
        member={makeMember({ role: 'member', user_id: 'user-1' })}
        currentUserId="user-99"
        onRemove={onRemove}
      />
    )
    const menuBtn = screen.getByTestId('icon-more-vertical').closest('button')!
    fireEvent.click(menuBtn)
    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
