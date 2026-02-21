import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons with explicit named exports
vi.mock('lucide-react', () => ({
  ThumbsUp: (props: Record<string, unknown>) => <div data-testid="thumbs-up" {...props} />,
  ThumbsDown: (props: Record<string, unknown>) => <div data-testid="thumbs-down" {...props} />,
  Loader2: (props: Record<string, unknown>) => <div data-testid="loader" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <div data-testid="alert-circle" {...props} />,
}))

// Mock the feedback store
const mockSubmitFeedback = vi.fn()
const mockRetryPendingSubmissions = vi.fn()

vi.mock('../../../stores/feedback', () => ({
  useFeedbackStore: vi.fn(() => ({
    submitFeedback: mockSubmitFeedback,
    isSubmitting: false,
    pendingFeedbacks: [],
    retryPendingSubmissions: mockRetryPendingSubmissions,
  })),
  FeedbackSubmit: {},
}))

import { useFeedbackStore } from '../../../stores/feedback'
import { FeedbackButton } from '../FeedbackButton'

const defaultProps = {
  sessionId: 'session-1',
  taskId: 'task-1',
  output: 'Some output text',
}

describe('FeedbackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: false,
      pendingFeedbacks: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)
  })

  it('renders thumbs up and thumbs down buttons', () => {
    render(<FeedbackButton {...defaultProps} />)

    expect(screen.getByTitle('Good response')).toBeInTheDocument()
    expect(screen.getByTitle('Bad response')).toBeInTheDocument()
  })

  it('calls submitFeedback with positive type on thumbs up click', async () => {
    mockSubmitFeedback.mockResolvedValue({ id: '1' })
    render(<FeedbackButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Good response'))

    await waitFor(() => {
      expect(mockSubmitFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-1',
          task_id: 'task-1',
          feedback_type: 'explicit_positive',
          original_output: 'Some output text',
        }),
        undefined
      )
    })
  })

  it('shows thank you message after positive submission', async () => {
    mockSubmitFeedback.mockResolvedValue({ id: '1' })
    render(<FeedbackButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Good response'))

    await waitFor(() => {
      expect(screen.getByText('Thank you!')).toBeInTheDocument()
    })
  })

  it('calls onFeedbackSubmitted callback after positive submission', async () => {
    mockSubmitFeedback.mockResolvedValue({ id: '1' })
    const onFeedbackSubmitted = vi.fn()
    render(<FeedbackButton {...defaultProps} onFeedbackSubmitted={onFeedbackSubmitted} />)

    fireEvent.click(screen.getByTitle('Good response'))

    await waitFor(() => {
      expect(onFeedbackSubmitted).toHaveBeenCalledWith(true)
    })
  })

  it('opens negative feedback modal on thumbs down click', () => {
    render(<FeedbackButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Bad response'))

    expect(screen.getByText('피드백 사유 선택')).toBeInTheDocument()
  })

  it('shows reason options in negative feedback modal', () => {
    render(<FeedbackButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Bad response'))

    expect(screen.getByText('결과가 틀림')).toBeInTheDocument()
    expect(screen.getByText('불완전한 결과')).toBeInTheDocument()
    expect(screen.getByText('주제에서 벗어남')).toBeInTheDocument()
    expect(screen.getByText('스타일/형식 문제')).toBeInTheDocument()
    expect(screen.getByText('성능 문제')).toBeInTheDocument()
    expect(screen.getByText('기타')).toBeInTheDocument()
  })

  it('disables buttons while submitting', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: true,
      pendingFeedbacks: [],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackButton {...defaultProps} />)

    expect(screen.getByTitle('Good response')).toBeDisabled()
    expect(screen.getByTitle('Bad response')).toBeDisabled()
  })

  it('shows retrying state for pending item with retrying status', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: false,
      pendingFeedbacks: [
        {
          id: 'pending-1',
          feedback: { session_id: 'session-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'test' },
          status: 'retrying',
          retryCount: 1,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackButton {...defaultProps} />)

    expect(screen.getByText('Retrying...')).toBeInTheDocument()
  })

  it('shows failed state with retry button for failed pending item', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: false,
      pendingFeedbacks: [
        {
          id: 'pending-1',
          feedback: { session_id: 'session-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'test' },
          status: 'failed',
          retryCount: 5,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackButton {...defaultProps} />)

    expect(screen.getByText('Failed - Tap to retry')).toBeInTheDocument()
  })

  it('calls retryPendingSubmissions when clicking failed retry button', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: false,
      pendingFeedbacks: [
        {
          id: 'pending-1',
          feedback: { session_id: 'session-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'test' },
          status: 'failed',
          retryCount: 5,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackButton {...defaultProps} />)

    fireEvent.click(screen.getByText('Failed - Tap to retry'))
    expect(mockRetryPendingSubmissions).toHaveBeenCalled()
  })

  it('shows queued state for queued pending item', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      isSubmitting: false,
      pendingFeedbacks: [
        {
          id: 'pending-1',
          feedback: { session_id: 'session-1', task_id: 'task-1', feedback_type: 'explicit_positive', original_output: 'test' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        },
      ],
      retryPendingSubmissions: mockRetryPendingSubmissions,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackButton {...defaultProps} />)

    expect(screen.getByText('Queued')).toBeInTheDocument()
  })
})
