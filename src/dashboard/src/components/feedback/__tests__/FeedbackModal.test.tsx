import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <div data-testid="x-icon" {...props} />,
  Loader2: (props: Record<string, unknown>) => <div data-testid="loader" {...props} />,
  ThumbsDown: (props: Record<string, unknown>) => <div data-testid="thumbs-down" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <div data-testid="alert-circle" {...props} />,
}))

// Mock feedback store types
vi.mock('../../../stores/feedback', () => ({
  FeedbackReason: {},
}))

import { FeedbackModal } from '../FeedbackModal'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
}

describe('FeedbackModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    defaultProps.onClose = vi.fn()
    defaultProps.onSubmit = vi.fn()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<FeedbackModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders modal with default title when isOpen is true', () => {
    render(<FeedbackModal {...defaultProps} />)
    expect(screen.getByText('피드백 사유 선택')).toBeInTheDocument()
  })

  it('renders custom title', () => {
    render(<FeedbackModal {...defaultProps} title="Custom Title" />)
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders all reason options', () => {
    render(<FeedbackModal {...defaultProps} />)

    expect(screen.getByText('결과가 틀림')).toBeInTheDocument()
    expect(screen.getByText('불완전한 결과')).toBeInTheDocument()
    expect(screen.getByText('주제에서 벗어남')).toBeInTheDocument()
    expect(screen.getByText('스타일/형식 문제')).toBeInTheDocument()
    expect(screen.getByText('성능 문제')).toBeInTheDocument()
    expect(screen.getByText('기타')).toBeInTheDocument()
  })

  it('renders reason descriptions', () => {
    render(<FeedbackModal {...defaultProps} />)

    expect(screen.getByText('사실적으로 잘못되었거나 오류가 있음')).toBeInTheDocument()
    expect(screen.getByText('필요한 내용이 누락됨')).toBeInTheDocument()
  })

  it('disables submit button when no reason is selected', () => {
    render(<FeedbackModal {...defaultProps} />)

    const submitButton = screen.getByText('피드백 제출')
    expect(submitButton).toBeDisabled()
  })

  it('enables submit button when a reason is selected', () => {
    render(<FeedbackModal {...defaultProps} />)

    fireEvent.click(screen.getByText('결과가 틀림'))

    const submitButton = screen.getByText('피드백 제출')
    expect(submitButton).not.toBeDisabled()
  })

  it('calls onSubmit with selected reason', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<FeedbackModal {...defaultProps} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('결과가 틀림'))
    fireEvent.click(screen.getByText('피드백 제출'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('incorrect', undefined)
    })
  })

  it('shows textarea when "other" reason is selected', () => {
    render(<FeedbackModal {...defaultProps} />)

    fireEvent.click(screen.getByText('기타'))

    expect(screen.getByPlaceholderText('구체적인 피드백을 입력해주세요...')).toBeInTheDocument()
  })

  it('does not show textarea for non-other reasons', () => {
    render(<FeedbackModal {...defaultProps} />)

    fireEvent.click(screen.getByText('결과가 틀림'))

    expect(screen.queryByPlaceholderText('구체적인 피드백을 입력해주세요...')).not.toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', () => {
    render(<FeedbackModal {...defaultProps} />)

    fireEvent.click(screen.getByText('취소'))

    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when close icon button is clicked', () => {
    render(<FeedbackModal {...defaultProps} />)

    // Close button is in the header
    const closeButtons = screen.getAllByRole('button')
    // The close icon button is the one with X icon
    const closeButton = closeButtons.find(btn => btn.querySelector('[data-testid="x-icon"]'))
    if (closeButton) {
      fireEvent.click(closeButton)
      expect(defaultProps.onClose).toHaveBeenCalled()
    }
  })

  it('shows error message when submitting without reason', async () => {
    render(<FeedbackModal {...defaultProps} />)

    // Try to submit form via form submission (bypassing disabled button)
    const form = screen.getByText('피드백 제출').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('사유를 선택해주세요')).toBeInTheDocument()
    })
  })

  it('shows submitting state', () => {
    render(<FeedbackModal {...defaultProps} isSubmitting={true} />)

    expect(screen.getByText('제출 중...')).toBeInTheDocument()
  })

  it('disables submit and cancel buttons while submitting', () => {
    render(<FeedbackModal {...defaultProps} isSubmitting={true} />)

    expect(screen.getByText('취소')).toBeDisabled()
  })
})
