import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { DeleteTaskDialog } from '../DeleteTaskDialog'
import { Task } from '../../stores/orchestration'

const mockTask: Task = {
  id: 'task-1',
  title: 'Test Task',
  description: 'A task for testing',
  status: 'pending',
  parentId: null,
  children: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  pausedAt: null,
  pauseReason: null,
  isDeleted: false,
  deletedAt: null,
}

describe('DeleteTaskDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    task: mockTask,
    deletionInfo: null,
    isDeleting: false,
    error: null,
  }

  it('returns null when not open', () => {
    const { container } = render(
      <DeleteTaskDialog {...defaultProps} isOpen={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when no task', () => {
    const { container } = render(
      <DeleteTaskDialog {...defaultProps} task={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog with task info', () => {
    render(<DeleteTaskDialog {...defaultProps} />)

    expect(screen.getByText('Delete Task')).toBeInTheDocument()
    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('A task for testing')).toBeInTheDocument()
  })

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn()
    render(<DeleteTaskDialog {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onConfirm when Delete clicked', () => {
    const onConfirm = vi.fn()
    render(<DeleteTaskDialog {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('shows children warning when task has children', () => {
    render(
      <DeleteTaskDialog
        {...defaultProps}
        deletionInfo={{ childrenCount: 3, canDelete: true }}
      />
    )

    expect(screen.getByText('This task has 3 child tasks')).toBeInTheDocument()
    expect(screen.getByText('All child tasks will also be deleted')).toBeInTheDocument()
  })

  it('shows singular child warning', () => {
    render(
      <DeleteTaskDialog
        {...defaultProps}
        deletionInfo={{ childrenCount: 1, canDelete: true }}
      />
    )

    expect(screen.getByText('This task has 1 child task')).toBeInTheDocument()
  })

  it('blocks deletion when in-progress children exist', () => {
    render(
      <DeleteTaskDialog
        {...defaultProps}
        deletionInfo={{ inProgressCount: 2, canDelete: false }}
      />
    )

    expect(screen.getByText(/Cannot delete: 2 tasks are in progress/)).toBeInTheDocument()
    const deleteButton = screen.getByRole('button', { name: /Delete/i })
    expect(deleteButton).toBeDisabled()
  })

  it('shows error message', () => {
    render(
      <DeleteTaskDialog {...defaultProps} error="Failed to delete task" />
    )

    expect(screen.getByText('Failed to delete task')).toBeInTheDocument()
  })

  it('shows loading state when deleting', () => {
    render(<DeleteTaskDialog {...defaultProps} isDeleting={true} />)

    expect(screen.getByText('Deleting...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deleting/i })).toBeDisabled()
    expect(screen.getByText('Cancel')).toBeDisabled()
  })

  it('shows task count in delete button when has children', () => {
    render(
      <DeleteTaskDialog
        {...defaultProps}
        deletionInfo={{ childrenCount: 2, canDelete: true }}
      />
    )

    expect(screen.getByRole('button', { name: /Delete \(3 tasks\)/i })).toBeInTheDocument()
  })
})
