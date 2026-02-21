import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertCircle: (props: Record<string, unknown>) => <div data-testid="alert-circle" {...props} />,
  X: (props: Record<string, unknown>) => <div data-testid="x-icon" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <div data-testid="refresh" {...props} />,
  Trash2: (props: Record<string, unknown>) => <div data-testid="trash" {...props} />,
  Loader2: (props: Record<string, unknown>) => <div data-testid="loader" {...props} />,
}))

// Mock the feedback store
const mockRetryPendingSubmissions = vi.fn()
const mockClearPending = vi.fn()
const mockClearAllPending = vi.fn()

vi.mock('../../../stores/feedback', () => ({
  useFeedbackStore: vi.fn(() => ({
    pendingFeedbacks: [],
    pendingEvaluations: [],
    retryPendingSubmissions: mockRetryPendingSubmissions,
    clearPending: mockClearPending,
    clearAllPending: mockClearAllPending,
  })),
  usePendingFeedbackCount: vi.fn(() => 0),
}))

import { useFeedbackStore, usePendingFeedbackCount } from '../../../stores/feedback'
import { PendingFeedbackIndicator } from '../PendingFeedbackIndicator'

describe('PendingFeedbackIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePendingFeedbackCount).mockReturnValue(0)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)
  })

  it('renders nothing when pending count is 0', () => {
    const { container } = render(<PendingFeedbackIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders badge with pending count when there are pending items', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(3)
    render(<PendingFeedbackIndicator />)

    expect(screen.getByText('3 pending')).toBeInTheDocument()
  })

  it('opens modal when badge is clicked', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(2)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [
        {
          id: 'pe-1',
          evaluation: { session_id: 'sess-2', task_id: 'task-2', rating: 4, result_accuracy: true, speed_satisfaction: true },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)

    fireEvent.click(screen.getByText('2 pending'))

    expect(screen.getByText('Pending Submissions (2)')).toBeInTheDocument()
  })

  it('shows pending feedback items in modal', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-abcdefgh', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'queued',
          retryCount: 1,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))

    expect(screen.getByText('Feedback')).toBeInTheDocument()
    expect(screen.getByText('Retries: 1/5')).toBeInTheDocument()
  })

  it('shows pending evaluation items in modal', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-1',
          evaluation: { session_id: 'sess-abcdefgh', task_id: 'task-1', rating: 4, result_accuracy: true, speed_satisfaction: true },
          status: 'failed',
          retryCount: 3,
          maxRetries: 5,
          lastError: 'Network error',
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))

    expect(screen.getByText('Evaluation')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Retries: 3/5')).toBeInTheDocument()
  })

  it('calls retryPendingSubmissions when Retry All is clicked', async () => {
    mockRetryPendingSubmissions.mockResolvedValue(undefined)
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))
    fireEvent.click(screen.getByText('Retry All'))

    await waitFor(() => {
      expect(mockRetryPendingSubmissions).toHaveBeenCalled()
    })
  })

  it('calls clearAllPending when Clear All is clicked', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))
    fireEvent.click(screen.getByText('Clear All'))

    expect(mockClearAllPending).toHaveBeenCalled()
  })

  it('calls clearPending for individual item when trash is clicked', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))

    // Find trash button (there's one per item)
    const trashButtons = screen.getAllByTestId('trash')
    fireEvent.click(trashButtons[0].closest('button')!)

    expect(mockClearPending).toHaveBeenCalledWith('pf-1')
  })

  it('shows correct status badge for different statuses', () => {
    vi.mocked(usePendingFeedbackCount).mockReturnValue(1)
    vi.mocked(useFeedbackStore).mockReturnValue({
      pendingFeedbacks: [
        {
          id: 'pf-1',
          feedback: { session_id: 'sess-abcdefgh', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'output' },
          status: 'failed',
          retryCount: 5,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      pendingEvaluations: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
      clearPending: mockClearPending,
      clearAllPending: mockClearAllPending,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<PendingFeedbackIndicator />)
    fireEvent.click(screen.getByText('1 pending'))

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
