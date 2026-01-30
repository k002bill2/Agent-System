import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ApprovalModal, ApprovalBanner } from '../ApprovalModal'

// Mock the orchestration store
vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => ({
    approveOperation: vi.fn(),
    denyOperation: vi.fn(),
    pendingApprovals: {},
  })),
}))

import { useOrchestrationStore } from '@/stores/orchestration'

const mockApproval = {
  approval_id: 'approval-1',
  task_id: 'task-1',
  tool_name: 'file_write',
  tool_args: { path: '/etc/config', content: 'test' },
  risk_level: 'high' as const,
  risk_description: 'Writing to system configuration file',
  status: 'pending' as const,
  created_at: '2024-01-01T00:00:00Z',
}

describe('ApprovalModal', () => {
  const mockApproveOperation = vi.fn()
  const mockDenyOperation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: mockApproveOperation,
      denyOperation: mockDenyOperation,
      pendingApprovals: {},
    } as unknown as ReturnType<typeof useOrchestrationStore>)
  })

  it('renders approval modal with correct info', () => {
    render(<ApprovalModal approval={mockApproval} onClose={vi.fn()} />)

    expect(screen.getByText('Approval Required')).toBeInTheDocument()
    expect(screen.getByText('file_write')).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('Writing to system configuration file')).toBeInTheDocument()
  })

  it('displays tool arguments as JSON', () => {
    render(<ApprovalModal approval={mockApproval} onClose={vi.fn()} />)

    expect(screen.getByText(/\/etc\/config/)).toBeInTheDocument()
  })

  it('calls approveOperation when Approve clicked', async () => {
    mockApproveOperation.mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(<ApprovalModal approval={mockApproval} onClose={onClose} />)

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(mockApproveOperation).toHaveBeenCalledWith('approval-1', undefined)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls denyOperation when Deny clicked', async () => {
    mockDenyOperation.mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(<ApprovalModal approval={mockApproval} onClose={onClose} />)

    fireEvent.click(screen.getByText('Deny'))

    await waitFor(() => {
      expect(mockDenyOperation).toHaveBeenCalledWith('approval-1', 'Denied by user')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('sends note with approval', async () => {
    mockApproveOperation.mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(<ApprovalModal approval={mockApproval} onClose={onClose} />)

    const noteInput = screen.getByPlaceholderText('Add a note about your decision...')
    fireEvent.change(noteInput, { target: { value: 'Approved for testing' } })

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(mockApproveOperation).toHaveBeenCalledWith('approval-1', 'Approved for testing')
    })
  })

  it('shows processing state', async () => {
    // Make the approve operation take time
    mockApproveOperation.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

    render(<ApprovalModal approval={mockApproval} onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Approve'))

    expect(screen.getByText('Processing...')).toBeInTheDocument()
  })

  it('applies correct risk level colors', () => {
    const lowRiskApproval = { ...mockApproval, risk_level: 'low' as const }
    const { rerender } = render(<ApprovalModal approval={lowRiskApproval} onClose={vi.fn()} />)

    expect(screen.getByText('LOW')).toHaveClass('bg-green-100')

    const criticalApproval = { ...mockApproval, risk_level: 'critical' as const }
    rerender(<ApprovalModal approval={criticalApproval} onClose={vi.fn()} />)

    expect(screen.getByText('CRITICAL')).toHaveClass('bg-red-100')
  })
})

describe('ApprovalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no pending approvals', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: vi.fn(),
      denyOperation: vi.fn(),
      pendingApprovals: {},
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    const { container } = render(<ApprovalBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows banner with pending approval count', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: vi.fn(),
      denyOperation: vi.fn(),
      pendingApprovals: {
        'approval-1': { ...mockApproval, status: 'pending' },
        'approval-2': { ...mockApproval, approval_id: 'approval-2', status: 'pending' },
      },
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<ApprovalBanner />)

    expect(screen.getByText('2 approvals required')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
  })

  it('shows singular text for one approval', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: vi.fn(),
      denyOperation: vi.fn(),
      pendingApprovals: {
        'approval-1': { ...mockApproval, status: 'pending' },
      },
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<ApprovalBanner />)

    expect(screen.getByText('1 approval required')).toBeInTheDocument()
  })

  it('opens modal when Review clicked', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: vi.fn(),
      denyOperation: vi.fn(),
      pendingApprovals: {
        'approval-1': { ...mockApproval, status: 'pending' },
      },
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<ApprovalBanner />)

    fireEvent.click(screen.getByText('Review'))

    expect(screen.getByText('Approval Required')).toBeInTheDocument()
  })

  it('excludes non-pending approvals from count', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      approveOperation: vi.fn(),
      denyOperation: vi.fn(),
      pendingApprovals: {
        'approval-1': { ...mockApproval, status: 'pending' },
        'approval-2': { ...mockApproval, approval_id: 'approval-2', status: 'approved' },
      },
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<ApprovalBanner />)

    expect(screen.getByText('1 approval required')).toBeInTheDocument()
  })
})
