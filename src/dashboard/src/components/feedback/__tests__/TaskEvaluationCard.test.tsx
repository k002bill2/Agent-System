import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ThumbsUp: (props: Record<string, unknown>) => <div data-testid="thumbs-up" {...props} />,
  ThumbsDown: (props: Record<string, unknown>) => <div data-testid="thumbs-down" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <div data-testid="message-square" {...props} />,
  Check: (props: Record<string, unknown>) => <div data-testid="check" {...props} />,
  X: (props: Record<string, unknown>) => <div data-testid="x-icon" {...props} />,
}))

// Mock feedback store
const mockSubmitTaskEvaluation = vi.fn()
const mockFetchTaskEvaluation = vi.fn()

vi.mock('../../../stores/feedback', () => ({
  useFeedbackStore: vi.fn(() => ({
    taskEvaluations: {},
    submitTaskEvaluation: mockSubmitTaskEvaluation,
    fetchTaskEvaluation: mockFetchTaskEvaluation,
    isSubmitting: false,
  })),
  TaskEvaluationSubmit: {},
}))

import { useFeedbackStore } from '../../../stores/feedback'
import { TaskEvaluationCard } from '../TaskEvaluationCard'

const defaultProps = {
  sessionId: 'session-1',
  taskId: 'task-1',
}

describe('TaskEvaluationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFeedbackStore).mockReturnValue({
      taskEvaluations: {},
      submitTaskEvaluation: mockSubmitTaskEvaluation,
      fetchTaskEvaluation: mockFetchTaskEvaluation,
      isSubmitting: false,
    } as unknown as ReturnType<typeof useFeedbackStore>)
  })

  it('renders thumbs up, thumbs down, and comment buttons', () => {
    render(<TaskEvaluationCard {...defaultProps} />)

    expect(screen.getByTitle('도움이 됐어요')).toBeInTheDocument()
    expect(screen.getByTitle('대답이 마음에 들지 않아요')).toBeInTheDocument()
    expect(screen.getByTitle('코멘트')).toBeInTheDocument()
  })

  it('fetches existing evaluation on mount', () => {
    render(<TaskEvaluationCard {...defaultProps} />)

    expect(mockFetchTaskEvaluation).toHaveBeenCalledWith('session-1', 'task-1')
  })

  it('calls submitTaskEvaluation with rating 5 on thumbs up click', async () => {
    mockSubmitTaskEvaluation.mockResolvedValue({ id: 'eval-1' })
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('도움이 됐어요'))

    await waitFor(() => {
      expect(mockSubmitTaskEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-1',
          task_id: 'task-1',
          rating: 5,
          result_accuracy: true,
          speed_satisfaction: true,
        })
      )
    })
  })

  it('calls submitTaskEvaluation with rating 1 on thumbs down click', async () => {
    mockSubmitTaskEvaluation.mockResolvedValue({ id: 'eval-1' })
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('대답이 마음에 들지 않아요'))

    await waitFor(() => {
      expect(mockSubmitTaskEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-1',
          task_id: 'task-1',
          rating: 1,
          result_accuracy: false,
          speed_satisfaction: false,
        })
      )
    })
  })

  it('passes optional agentId in evaluation', async () => {
    mockSubmitTaskEvaluation.mockResolvedValue({ id: 'eval-1' })
    render(<TaskEvaluationCard {...defaultProps} agentId="agent-1" />)

    fireEvent.click(screen.getByTitle('도움이 됐어요'))

    await waitFor(() => {
      expect(mockSubmitTaskEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
        })
      )
    })
  })

  it('shows comment input when comment button is clicked', () => {
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('코멘트'))

    expect(screen.getByPlaceholderText('의견을 남겨주세요...')).toBeInTheDocument()
  })

  it('hides comment input when comment button is toggled off', () => {
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('코멘트'))
    expect(screen.getByPlaceholderText('의견을 남겨주세요...')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('코멘트'))
    expect(screen.queryByPlaceholderText('의견을 남겨주세요...')).not.toBeInTheDocument()
  })

  it('submits comment when check button is clicked', async () => {
    mockSubmitTaskEvaluation.mockResolvedValue({ id: 'eval-1' })
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('코멘트'))
    const input = screen.getByPlaceholderText('의견을 남겨주세요...')
    fireEvent.change(input, { target: { value: 'Great work!' } })

    const checkButton = screen.getByTestId('check').closest('button')!
    fireEvent.click(checkButton)

    await waitFor(() => {
      expect(mockSubmitTaskEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: 'Great work!',
        })
      )
    })
  })

  it('submits comment on Enter key press', async () => {
    mockSubmitTaskEvaluation.mockResolvedValue({ id: 'eval-1' })
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('코멘트'))
    const input = screen.getByPlaceholderText('의견을 남겨주세요...')
    fireEvent.change(input, { target: { value: 'Good result' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockSubmitTaskEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: 'Good result',
        })
      )
    })
  })

  it('disables check button when comment is empty', () => {
    render(<TaskEvaluationCard {...defaultProps} />)

    fireEvent.click(screen.getByTitle('코멘트'))

    const checkButton = screen.getByTestId('check').closest('button')!
    expect(checkButton).toBeDisabled()
  })

  it('disables vote buttons while submitting', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      taskEvaluations: {},
      submitTaskEvaluation: mockSubmitTaskEvaluation,
      fetchTaskEvaluation: mockFetchTaskEvaluation,
      isSubmitting: true,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<TaskEvaluationCard {...defaultProps} />)

    expect(screen.getByTitle('도움이 됐어요')).toBeDisabled()
    expect(screen.getByTitle('대답이 마음에 들지 않아요')).toBeDisabled()
  })
})
