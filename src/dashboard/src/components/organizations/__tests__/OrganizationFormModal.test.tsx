import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrganizationFormModal } from '../OrganizationFormModal'
import type { Organization } from '../../../stores/organizations'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
}))

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    description: 'A test organization',
    status: 'active',
    plan: 'starter',
    contact_email: 'contact@test.com',
    contact_name: 'John',
    logo_url: null,
    primary_color: '#ff0000',
    max_members: 10,
    max_projects: 5,
    max_sessions_per_day: 100,
    max_tokens_per_month: 50000,
    current_members: 3,
    current_projects: 2,
    tokens_used_this_month: 10000,
    settings: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultCreateProps = {
  mode: 'create' as const,
  organization: null,
  isLoading: false,
  onSubmit: vi.fn().mockResolvedValue(true),
  onClose: vi.fn(),
}

const defaultEditProps = {
  mode: 'edit' as const,
  organization: makeOrg(),
  isLoading: false,
  onSubmit: vi.fn().mockResolvedValue(true),
  onClose: vi.fn(),
}

describe('OrganizationFormModal', () => {
  it('renders "Create Organization" title in create mode', () => {
    render(<OrganizationFormModal {...defaultCreateProps} />)
    expect(screen.getByText('Create Organization')).toBeInTheDocument()
  })

  it('renders "Edit Organization" title in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    expect(screen.getByText('Edit Organization')).toBeInTheDocument()
  })

  it('renders form fields for create mode', () => {
    render(<OrganizationFormModal {...defaultCreateProps} />)
    expect(screen.getByText('Organization Name *')).toBeInTheDocument()
    expect(screen.getByText('Slug *')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Contact Name')).toBeInTheDocument()
    expect(screen.getByText('Contact Email')).toBeInTheDocument()
  })

  it('does not show Plan selector in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
  })

  it('shows Brand Color field in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    expect(screen.getByText('Brand Color')).toBeInTheDocument()
  })

  it('does not show Brand Color field in create mode', () => {
    render(<OrganizationFormModal {...defaultCreateProps} />)
    expect(screen.queryByText('Brand Color')).not.toBeInTheDocument()
  })

  it('pre-fills form in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    expect(screen.getByDisplayValue('Test Org')).toBeInTheDocument()
    expect(screen.getByDisplayValue('test-org')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A test organization')).toBeInTheDocument()
    expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    expect(screen.getByDisplayValue('contact@test.com')).toBeInTheDocument()
  })

  it('auto-generates slug from name in create mode', () => {
    render(<OrganizationFormModal {...defaultCreateProps} />)
    const nameInput = screen.getByPlaceholderText('My Organization')
    fireEvent.change(nameInput, { target: { value: 'Hello World' } })
    expect(screen.getByDisplayValue('hello-world')).toBeInTheDocument()
  })

  it('disables slug input in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    const slugInput = screen.getByDisplayValue('test-org')
    expect(slugInput).toBeDisabled()
  })

  it('disables submit when name is empty', () => {
    render(<OrganizationFormModal {...defaultCreateProps} />)
    const createBtn = screen.getByText('Create')
    expect(createBtn).toBeDisabled()
  })

  it('shows "Saving..." when isLoading', () => {
    render(<OrganizationFormModal {...defaultCreateProps} isLoading={true} />)
    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<OrganizationFormModal {...defaultCreateProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit with create data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<OrganizationFormModal {...defaultCreateProps} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('My Organization'), {
      target: { value: 'New Org' },
    })

    const form = screen.getByText('Create').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Org',
          slug: 'new-org',
        })
      )
    })
  })

  it('shows "Save Changes" button text in edit mode', () => {
    render(<OrganizationFormModal {...defaultEditProps} />)
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })
})
