import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDeleteModal } from '../ConfirmDeleteModal'

describe('ConfirmDeleteModal', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Delete Agent',
    message: 'Are you sure you want to delete this agent?',
    itemName: 'web-ui-specialist',
    isDeleting: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('returns null when not open', () => {
    const { container } = render(<ConfirmDeleteModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders title and message', () => {
    render(<ConfirmDeleteModal {...defaultProps} />)
    expect(screen.getByText('Delete Agent')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to delete this agent?')).toBeInTheDocument()
  })

  it('renders item name in code block', () => {
    render(<ConfirmDeleteModal {...defaultProps} />)
    expect(screen.getByText('web-ui-specialist')).toBeInTheDocument()
  })

  it('calls onConfirm when Delete button clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDeleteModal {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteModal {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when backdrop clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<ConfirmDeleteModal {...defaultProps} onCancel={onCancel} />)
    // Backdrop is the first child of the fixed container
    const backdrop = container.querySelector('.bg-black\\/50')
    fireEvent.click(backdrop!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when isDeleting is true', () => {
    render(<ConfirmDeleteModal {...defaultProps} isDeleting={true} />)
    expect(screen.getByText('Cancel')).toBeDisabled()
    expect(screen.getByText('Delete')).toBeDisabled()
  })

  it('shows loading spinner when isDeleting', () => {
    const { container } = render(<ConfirmDeleteModal {...defaultProps} isDeleting={true} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
