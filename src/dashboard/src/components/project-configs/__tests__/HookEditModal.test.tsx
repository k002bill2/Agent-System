import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HookEditModal } from '../HookEditModal'

describe('HookEditModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSave.mockResolvedValue(true)
  })

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <HookEditModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal with correct title when open', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByRole('heading', { name: 'Add Hook' })).toBeInTheDocument()
  })

  it('shows Event select field', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByText('Event *')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PreToolUse')).toBeInTheDocument()
  })

  it('shows Matcher Pattern input', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByText('Matcher Pattern')).toBeInTheDocument()
    expect(screen.getByDisplayValue('*')).toBeInTheDocument()
  })

  it('shows Commands section with hook input', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByText('Commands')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Shell command to execute...')).toBeInTheDocument()
  })

  it('shows Add another command button', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByText('Add another command')).toBeInTheDocument()
  })

  it('adds another hook command input when button clicked', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    fireEvent.click(screen.getByText('Add another command'))
    const inputs = screen.getAllByPlaceholderText('Shell command to execute...')
    expect(inputs.length).toBe(2)
  })

  it('calls onClose when Cancel clicked', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows Add Hook submit button', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    expect(screen.getByRole('button', { name: /Add Hook/i })).toBeInTheDocument()
  })

  it('shows event options in dropdown', () => {
    render(
      <HookEditModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    )
    const select = screen.getByDisplayValue('PreToolUse')
    expect(select).toBeInTheDocument()
    // Check that options exist
    const options = select.querySelectorAll('option')
    const optionValues = Array.from(options).map(o => o.textContent)
    expect(optionValues).toContain('PreToolUse')
    expect(optionValues).toContain('PostToolUse')
    expect(optionValues).toContain('Notification')
    expect(optionValues).toContain('Stop')
  })
})
