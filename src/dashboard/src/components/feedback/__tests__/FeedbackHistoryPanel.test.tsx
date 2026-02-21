import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ThumbsUp: (props: Record<string, unknown>) => <div data-testid="thumbs-up" {...props} />,
  ThumbsDown: (props: Record<string, unknown>) => <div data-testid="thumbs-down" {...props} />,
  Edit: (props: Record<string, unknown>) => <div data-testid="edit" {...props} />,
  Clock: (props: Record<string, unknown>) => <div data-testid="clock" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <div data-testid="alert" {...props} />,
  Filter: (props: Record<string, unknown>) => <div data-testid="filter" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <div data-testid="refresh" {...props} />,
  Play: (props: Record<string, unknown>) => <div data-testid="play" {...props} />,
  Bot: (props: Record<string, unknown>) => <div data-testid="bot" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <div data-testid="msg-square" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <div data-testid="folder-open" {...props} />,
  Star: (props: Record<string, unknown>) => <div data-testid="star" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <div data-testid="trending-up" {...props} />,
  TrendingDown: (props: Record<string, unknown>) => <div data-testid="trending-down" {...props} />,
  Users: (props: Record<string, unknown>) => <div data-testid="users" {...props} />,
  BarChart3: (props: Record<string, unknown>) => <div data-testid="bar-chart" {...props} />,
}))

// Mock AgentEvalPanel sub-component
vi.mock('../AgentEvalPanel', () => ({
  AgentEvalPanel: () => <div data-testid="agent-eval-panel">AgentEvalPanel</div>,
}))

// Mock feedback store
const mockFetchFeedbacks = vi.fn()
const mockFetchStats = vi.fn()
const mockProcessFeedback = vi.fn()
const mockProcessPendingFeedbacks = vi.fn()
const mockSetFilterType = vi.fn()
const mockSetFilterStatus = vi.fn()
const mockClearError = vi.fn()

vi.mock('../../../stores/feedback', () => ({
  useFeedbackStore: vi.fn(() => ({
    feedbacks: [],
    stats: null,
    isLoading: false,
    error: null,
    filterType: null,
    filterStatus: null,
    fetchFeedbacks: mockFetchFeedbacks,
    fetchStats: mockFetchStats,
    processFeedback: mockProcessFeedback,
    processPendingFeedbacks: mockProcessPendingFeedbacks,
    setFilterType: mockSetFilterType,
    setFilterStatus: mockSetFilterStatus,
    clearError: mockClearError,
  })),
  feedbackTypeColors: {
    implicit: 'bg-yellow-100 text-yellow-800',
    explicit_positive: 'bg-green-100 text-green-800',
    explicit_negative: 'bg-red-100 text-red-800',
  },
}))

import { useFeedbackStore } from '../../../stores/feedback'
import { FeedbackHistoryPanel } from '../FeedbackHistoryPanel'

describe('FeedbackHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [],
      stats: null,
      isLoading: false,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)
  })

  it('calls fetchFeedbacks and fetchStats on mount', () => {
    render(<FeedbackHistoryPanel />)

    expect(mockFetchFeedbacks).toHaveBeenCalled()
    expect(mockFetchStats).toHaveBeenCalled()
  })

  it('renders empty state when no feedbacks', () => {
    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('No feedbacks yet')).toBeInTheDocument()
    expect(screen.getByText('Feedbacks will appear here when users provide them')).toBeInTheDocument()
  })

  it('renders loading skeleton when loading with no feedbacks', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [],
      stats: null,
      isLoading: true,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    const { container } = render(<FeedbackHistoryPanel />)

    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders stats cards when stats are available', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [],
      stats: {
        total_count: 100,
        positive_rate: 0.85,
        implicit_rate: 0.6,
        by_type: {},
        by_reason: {},
        by_status: { pending: 5 },
        by_agent: {},
      },
      isLoading: false,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('Total Feedbacks')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('Positive Rate')).toBeInTheDocument()
    expect(screen.getByText('85.0%')).toBeInTheDocument()
    expect(screen.getByText('Implicit Rate')).toBeInTheDocument()
    expect(screen.getByText('60.0%')).toBeInTheDocument()
  })

  it('renders error banner and dismiss button', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [],
      stats: null,
      isLoading: false,
      error: 'Something went wrong',
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockClearError).toHaveBeenCalled()
  })

  it('renders feedback rows when feedbacks exist', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [
        {
          id: 'fb-1',
          session_id: 'sess-1',
          task_id: 'task-1',
          feedback_type: 'explicit_positive',
          original_output: 'This is a test output for feedback',
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      stats: null,
      isLoading: false,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('Context Summary')).toBeInTheDocument()
    expect(screen.getByText('This is a test output for feedback')).toBeInTheDocument()
  })

  it('renders AgentEvalPanel sub-component', () => {
    render(<FeedbackHistoryPanel />)

    expect(screen.getByTestId('agent-eval-panel')).toBeInTheDocument()
  })

  it('renders filter dropdowns', () => {
    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('All Status')).toBeInTheDocument()
  })

  it('renders process pending button with count', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [],
      stats: { total_count: 10, positive_rate: 0.8, implicit_rate: 0.5, by_type: {}, by_reason: {}, by_status: { pending: 3 }, by_agent: {} },
      isLoading: false,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('Process Pending (3)')).toBeInTheDocument()
  })

  it('shows agent_id badge when feedback has agent_id', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      feedbacks: [
        {
          id: 'fb-1',
          session_id: 'sess-1',
          task_id: 'task-1',
          feedback_type: 'explicit_positive',
          original_output: 'Some output',
          agent_id: 'my-agent',
          status: 'processed',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      stats: null,
      isLoading: false,
      error: null,
      filterType: null,
      filterStatus: null,
      fetchFeedbacks: mockFetchFeedbacks,
      fetchStats: mockFetchStats,
      processFeedback: mockProcessFeedback,
      processPendingFeedbacks: mockProcessPendingFeedbacks,
      setFilterType: mockSetFilterType,
      setFilterStatus: mockSetFilterStatus,
      clearError: mockClearError,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<FeedbackHistoryPanel />)

    expect(screen.getByText('my-agent')).toBeInTheDocument()
  })
})
