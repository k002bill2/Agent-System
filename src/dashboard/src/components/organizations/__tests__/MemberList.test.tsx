import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberList } from '../MemberList'
import type { OrganizationMember, MemberRole } from '../../../stores/organizations'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  UserPlus: (props: Record<string, unknown>) => <span data-testid="icon-user-plus" {...props} />,
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  MoreVertical: (props: Record<string, unknown>) => <span data-testid="icon-more-vertical" {...props} />,
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-shield-check" {...props} />,
  Eye: (props: Record<string, unknown>) => <span data-testid="icon-eye" {...props} />,
  User: (props: Record<string, unknown>) => <span data-testid="icon-user" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
}))

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
  members: [
    makeMember({ id: 'mem-1', user_id: 'u1', name: 'Alice', role: 'admin' }),
    makeMember({ id: 'mem-2', user_id: 'u2', name: 'Bob', role: 'viewer' }),
    makeMember({ id: 'mem-3', user_id: 'u3', name: 'Charlie', role: 'owner' }),
  ],
  currentUserId: 'u-current',
  currentUserRole: 'owner' as MemberRole,
  isLoading: false,
  onInvite: vi.fn(),
  onUpdateRole: vi.fn(),
  onRemove: vi.fn(),
}

describe('MemberList', () => {
  it('renders members count header', () => {
    render(<MemberList {...defaultProps} />)
    expect(screen.getByText('Members (3)')).toBeInTheDocument()
  })

  it('shows loading skeletons when isLoading', () => {
    const { container } = render(<MemberList {...defaultProps} isLoading={true} />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBe(3)
  })

  it('shows Invite Member button for owner role', () => {
    render(<MemberList {...defaultProps} currentUserRole="owner" />)
    expect(screen.getByText('Invite Member')).toBeInTheDocument()
  })

  it('shows Invite Member button for admin role', () => {
    render(<MemberList {...defaultProps} currentUserRole="admin" />)
    expect(screen.getByText('Invite Member')).toBeInTheDocument()
  })

  it('hides Invite Member button for member role', () => {
    render(<MemberList {...defaultProps} currentUserRole="member" />)
    expect(screen.queryByText('Invite Member')).not.toBeInTheDocument()
  })

  it('hides Invite Member button for viewer role', () => {
    render(<MemberList {...defaultProps} currentUserRole="viewer" />)
    expect(screen.queryByText('Invite Member')).not.toBeInTheDocument()
  })

  it('calls onInvite when Invite Member is clicked', () => {
    const onInvite = vi.fn()
    render(<MemberList {...defaultProps} onInvite={onInvite} />)
    fireEvent.click(screen.getByText('Invite Member'))
    expect(onInvite).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no members', () => {
    render(<MemberList {...defaultProps} members={[]} />)
    expect(screen.getByText('No members yet')).toBeInTheDocument()
  })

  it('shows invite link in empty state for admin', () => {
    render(
      <MemberList {...defaultProps} members={[]} currentUserRole="owner" />
    )
    expect(screen.getByText('Invite your first member')).toBeInTheDocument()
  })

  it('hides invite link in empty state for viewer', () => {
    render(
      <MemberList {...defaultProps} members={[]} currentUserRole="viewer" />
    )
    expect(screen.queryByText('Invite your first member')).not.toBeInTheDocument()
  })

  it('renders each member name', () => {
    render(<MemberList {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })
})
