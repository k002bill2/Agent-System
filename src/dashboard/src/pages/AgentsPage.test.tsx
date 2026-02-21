import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentsPage } from './AgentsPage'

// Mock child components
vi.mock('../components/ProjectFilter', () => ({
  ProjectFilter: () => <div data-testid="project-filter">ProjectFilter</div>,
}))
vi.mock('../components/TaskAnalyzer', () => ({
  TaskAnalyzer: ({ projectFilter }: { projectFilter: string | null }) => (
    <div data-testid="task-analyzer">TaskAnalyzer: {projectFilter}</div>
  ),
}))
vi.mock('../components/feedback', () => ({
  FeedbackHistoryPanel: () => <div data-testid="feedback-history">FeedbackHistory</div>,
  DatasetPanel: () => <div data-testid="dataset-panel">DatasetPanel</div>,
}))

// Store mocks
let mockProjectFilter: string | null = null
let mockFeedbacks: Array<{ id: string; status: string }> = []
const mockFetchFeedbacks = vi.fn()
let mockProjects: Array<{ id: string; name: string }> = []

vi.mock('../stores/navigation', () => ({
  useNavigationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ projectFilter: mockProjectFilter }),
}))

vi.mock('../stores/feedback', () => ({
  useFeedbackStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      feedbacks: mockFeedbacks,
      fetchFeedbacks: mockFetchFeedbacks,
    }),
}))

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ projects: mockProjects }),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectFilter = null
    mockFeedbacks = []
    mockProjects = []
  })

  it('renders page title', () => {
    render(<AgentsPage />)
    expect(screen.getByRole('heading', { name: 'Task Analyzer' })).toBeInTheDocument()
  })

  it('renders project filter', () => {
    render(<AgentsPage />)
    expect(screen.getByTestId('project-filter')).toBeInTheDocument()
  })

  it('renders tab buttons', () => {
    render(<AgentsPage />)
    // Note: "Task Analyzer" appears as both page title and tab label
    expect(screen.getByText('Feedback')).toBeInTheDocument()
  })

  it('shows task analyzer tab by default', () => {
    render(<AgentsPage />)
    expect(screen.getByTestId('task-analyzer')).toBeInTheDocument()
  })

  it('switches to feedback tab when clicked', () => {
    render(<AgentsPage />)
    fireEvent.click(screen.getByText('Feedback'))
    expect(screen.getByTestId('feedback-history')).toBeInTheDocument()
    expect(screen.queryByTestId('task-analyzer')).not.toBeInTheDocument()
  })

  it('shows pending feedback count badge', () => {
    mockFeedbacks = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'completed' },
    ]
    render(<AgentsPage />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not show badge when no pending feedbacks', () => {
    mockFeedbacks = [{ id: '1', status: 'completed' }]
    render(<AgentsPage />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('fetches feedbacks on mount', () => {
    render(<AgentsPage />)
    expect(mockFetchFeedbacks).toHaveBeenCalledTimes(1)
  })

  it('passes project filter to task analyzer', () => {
    mockProjectFilter = 'proj-1'
    render(<AgentsPage />)
    expect(screen.getByText('TaskAnalyzer: proj-1')).toBeInTheDocument()
  })

  it('shows feedback sub-tabs (History and Dataset) in feedback tab', () => {
    render(<AgentsPage />)
    fireEvent.click(screen.getByText('Feedback'))
    expect(screen.getByText('Feedback History')).toBeInTheDocument()
    expect(screen.getByText('Dataset')).toBeInTheDocument()
  })

  it('switches to Dataset sub-tab', () => {
    render(<AgentsPage />)
    fireEvent.click(screen.getByText('Feedback'))
    fireEvent.click(screen.getByText('Dataset'))
    expect(screen.getByTestId('dataset-panel')).toBeInTheDocument()
  })

  it('shows project filter info when project selected in feedback tab', () => {
    mockProjectFilter = 'proj-1'
    mockProjects = [{ id: 'proj-1', name: 'My Project' }]
    render(<AgentsPage />)
    fireEvent.click(screen.getByText('Feedback'))
    expect(screen.getByText(/My Project/)).toBeInTheDocument()
  })
})
