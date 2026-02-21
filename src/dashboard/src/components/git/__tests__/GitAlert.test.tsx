import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GitAlert } from '../GitAlert'

// Mock lucide-react icons with explicit named exports
vi.mock('lucide-react', () => ({
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-AlertCircle" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-AlertTriangle" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-Info" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <span data-testid="icon-ChevronUp" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-X" {...props} />,
}))

// Mock the classifyGitError utility
vi.mock('../../../utils/gitErrorMessages', () => ({
  classifyGitError: vi.fn((rawError: string) => {
    if (rawError.includes('not fully merged')) {
      return {
        category: 'delete-unmerged',
        severity: 'warning',
        title: '머지되지 않은 브랜치입니다',
        description: '이 브랜치에 아직 머지되지 않은 커밋이 있습니다.',
        solution: '먼저 머지를 완료하세요.',
        rawError,
      }
    }
    if (rawError.includes('already exists')) {
      return {
        category: 'create-exists',
        severity: 'info' as const,
        title: '이미 존재하는 브랜치입니다',
        description: '동일한 이름의 브랜치가 이미 존재합니다.',
        solution: '다른 브랜치 이름을 사용하세요.',
        rawError,
      }
    }
    return {
      category: 'unknown',
      severity: 'error',
      title: '작업 실패',
      description: '요청한 Git 작업을 수행하는 중 오류가 발생했습니다.',
      solution: '에러 메시지를 확인하고 다시 시도하세요.',
      rawError,
    }
  }),
}))

describe('GitAlert', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with role="alert"', () => {
    render(<GitAlert error="some error" onClose={mockOnClose} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('displays error title and description', () => {
    render(<GitAlert error="some unknown error" onClose={mockOnClose} />)
    expect(screen.getByText('작업 실패')).toBeInTheDocument()
    expect(screen.getByText('요청한 Git 작업을 수행하는 중 오류가 발생했습니다.')).toBeInTheDocument()
  })

  it('shows solution toggle button', () => {
    render(<GitAlert error="some error" onClose={mockOnClose} />)
    expect(screen.getByText('해결 방법')).toBeInTheDocument()
  })

  it('toggles solution visibility on click', () => {
    render(<GitAlert error="some error" onClose={mockOnClose} />)
    const toggleButton = screen.getByText('해결 방법')

    // Solution is hidden initially
    expect(screen.queryByText('에러 메시지를 확인하고 다시 시도하세요.')).not.toBeInTheDocument()

    // Click to show
    fireEvent.click(toggleButton)
    expect(screen.getByText('에러 메시지를 확인하고 다시 시도하세요.')).toBeInTheDocument()

    // Click to hide
    fireEvent.click(toggleButton)
    expect(screen.queryByText('에러 메시지를 확인하고 다시 시도하세요.')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<GitAlert error="some error" onClose={mockOnClose} />)
    const closeButton = screen.getByLabelText('닫기')
    fireEvent.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows raw error message for unknown category', () => {
    render(<GitAlert error="some weird error" onClose={mockOnClose} />)
    expect(screen.getByText('원본 에러 메시지')).toBeInTheDocument()
  })

  it('does not show raw error for known categories', () => {
    render(<GitAlert error="not fully merged" onClose={mockOnClose} />)
    expect(screen.queryByText('원본 에러 메시지')).not.toBeInTheDocument()
  })

  it('displays warning-level content for warning errors', () => {
    render(<GitAlert error="not fully merged" onClose={mockOnClose} />)
    expect(screen.getByText('머지되지 않은 브랜치입니다')).toBeInTheDocument()
  })

  it('auto-dismisses warning alerts after 8 seconds', () => {
    render(<GitAlert error="not fully merged" onClose={mockOnClose} />)

    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses info alerts after 5 seconds', () => {
    render(<GitAlert error="already exists" onClose={mockOnClose} />)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not auto-dismiss error-level alerts', () => {
    render(<GitAlert error="some unknown error" onClose={mockOnClose} />)

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('applies custom className', () => {
    render(<GitAlert error="some error" onClose={mockOnClose} className="my-custom-class" />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('my-custom-class')
  })
})
