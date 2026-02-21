import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InviteMemberModal } from '../InviteMemberModal'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  Mail: (props: Record<string, unknown>) => <span data-testid="icon-mail" {...props} />,
  UserPlus: (props: Record<string, unknown>) => <span data-testid="icon-user-plus" {...props} />,
}))

const defaultProps = {
  organizationName: 'Test Org',
  isLoading: false,
  onSubmit: vi.fn().mockResolvedValue(true),
  onClose: vi.fn(),
}

describe('InviteMemberModal', () => {
  it('renders the modal title', () => {
    render(<InviteMemberModal {...defaultProps} />)
    expect(screen.getByText('Invite Member')).toBeInTheDocument()
  })

  it('displays the organization name in the description', () => {
    render(<InviteMemberModal {...defaultProps} />)
    expect(screen.getByText('Test Org')).toBeInTheDocument()
  })

  it('renders email, name, role, and message fields', () => {
    render(<InviteMemberModal {...defaultProps} />)
    expect(screen.getByPlaceholderText('colleague@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Email Address *')).toBeInTheDocument()
    expect(screen.getByText('Name (Optional)')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Personal Message (Optional)')).toBeInTheDocument()
  })

  it('renders role options in the select', () => {
    render(<InviteMemberModal {...defaultProps} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Admin - Full management access')).toBeInTheDocument()
    expect(screen.getByText('Member - Can create and edit')).toBeInTheDocument()
    expect(screen.getByText('Viewer - Read-only access')).toBeInTheDocument()
  })

  it('defaults role to member', () => {
    render(<InviteMemberModal {...defaultProps} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('member')
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<InviteMemberModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn()
    render(<InviteMemberModal {...defaultProps} onClose={onClose} />)
    const closeBtn = screen.getByTestId('icon-x').closest('button')!
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables submit when email is empty', () => {
    render(<InviteMemberModal {...defaultProps} />)
    const submitBtn = screen.getByText('Send Invitation')
    expect(submitBtn).toBeDisabled()
  })

  it('enables submit when email is provided', () => {
    render(<InviteMemberModal {...defaultProps} />)
    const emailInput = screen.getByPlaceholderText('colleague@company.com')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    const submitBtn = screen.getByText('Send Invitation')
    expect(submitBtn).not.toBeDisabled()
  })

  it('shows "Sending..." when isLoading', () => {
    render(<InviteMemberModal {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Sending...')).toBeInTheDocument()
  })

  it('calls onSubmit with form data on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<InviteMemberModal {...defaultProps} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('colleague@company.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Test User' },
    })

    const form = screen.getByText('Send Invitation').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        message: undefined,
      })
    })
  })
})
