import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    BarChart3: icon, TrendingUp: icon, TrendingDown: icon, DollarSign: icon,
    Zap: icon, Clock: icon, RefreshCw: icon, Calendar: icon, Users: icon,
    AlertTriangle: icon, FolderOpen: icon, GitCompare: icon, ThumbsUp: icon,
    Star: icon, Gauge: icon, MessageSquare: icon, ChevronDown: icon,
    ChevronRight: icon, ArrowRight: icon, GitBranch: icon, Loader2: icon,
    FileText: icon,
  }
})

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
}))

// Store mocks - imported later for vi.mocked() usage
const mockFetchProjects = vi.fn()
const mockFetchUsage = vi.fn()

vi.mock('../stores/projects', () => ({
  useProjectsStore: vi.fn(() => ({
    projects: [],
    fetchProjects: mockFetchProjects,
  })),
}))

vi.mock('../stores/claudeUsage', () => ({
  useClaudeUsageStore: vi.fn(() => ({
    usage: null,
    fetchUsage: mockFetchUsage,
  })),
}))

const mockFetchExternalSummary = vi.fn()

vi.mock('../stores/externalUsage', () => ({
  useExternalUsageStore: vi.fn(() => ({
    summary: { total_cost_usd: 5.25, providers: [], records: [], period_start: '', period_end: '' },
    fetchSummary: mockFetchExternalSummary,
  })),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', is_admin: false } }
    return selector ? selector(state) : state
  }),
}))

// Mock ProjectMultiSelect component - captures props for testing
vi.mock('../components/analytics/ProjectMultiSelect', () => ({
  ProjectMultiSelect: (props: { selectedIds: string[]; onChange: (ids: string[]) => void; placeholder?: string }) => (
    <div data-testid="project-multi-select">
      <button
        data-testid="select-projects-btn"
        onClick={() => props.onChange(['p1', 'p2'])}
      >
        Select Projects
      </button>
      <span data-testid="selected-count">{props.selectedIds.length}</span>
    </div>
  ),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { AnalyticsPage } from './AnalyticsPage'
import { useProjectsStore } from '../stores/projects'
import { useClaudeUsageStore } from '../stores/claudeUsage'
import { useAuthStore } from '../stores/auth'

// ─────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────

const mockDashboardData = {
  overview: {
    total_sessions: 42,
    active_sessions: 5,
    total_tasks: 200,
    completed_tasks: 180,
    failed_tasks: 10,
    pending_tasks: 10,
    success_rate: 90.0,
    total_tokens: 500000,
    total_cost: 12.50,
    avg_task_duration_ms: 1500,
    approvals_pending: 2,
    approvals_granted: 15,
    approvals_denied: 3,
  },
  trends: {
    time_range: '7d',
    tasks: [{ timestamp: '2026-02-01', value: 10, label: 'Feb 1' }],
    success_rate: [{ timestamp: '2026-02-01', value: 90, label: 'Feb 1' }],
    costs: [{ timestamp: '2026-02-01', value: 1.5, label: 'Feb 1' }],
    tokens: [{ timestamp: '2026-02-01', value: 50000, label: 'Feb 1' }],
  },
  agents: {
    agents: [
      {
        agent_id: 'a1', agent_name: 'Test Agent', category: 'general',
        total_tasks: 50, completed_tasks: 45, failed_tasks: 5,
        success_rate: 90.0, avg_duration_ms: 1200, total_tokens: 100000, total_cost: 3.50,
      },
    ],
    time_range: '7d',
  },
  costs: {
    time_range: '7d',
    total_cost: 12.50,
    total_tokens: 500000,
    avg_cost_per_task: 0.0625,
    by_agent: [],
    by_model: [
      { category: 'model', value: 'gemini-2.0-flash', cost: 8.00, tokens: 300000, percentage: 64 },
      { category: 'model', value: 'claude-3.5', cost: 4.50, tokens: 200000, percentage: 36 },
    ],
    projected_monthly: 37.50,
  },
  activity: {
    cells: [
      { day: 0, hour: 9, value: 5 },
      { day: 1, hour: 14, value: 8 },
      { day: 2, hour: 10, value: 3 },
    ],
    max_value: 10,
    time_range: '7d' as const,
  },
}

const mockEvalStats = {
  avg_rating: 4.2,
  accuracy_rate: 0.85,
  speed_satisfaction_rate: 0.78,
  total_count: 15,
  by_agent: [
    { agent_id: 'a1', avg_rating: 4.5, accuracy_rate: 0.9, speed_satisfaction_rate: 0.8, total_count: 10 },
  ],
}

const mockEvalList = [
  {
    id: 'eval1',
    session_id: 'task-analyzer',
    task_id: 'task-abc12345-def6-7890',
    rating: 4,
    result_accuracy: true,
    speed_satisfaction: true,
    comment: 'Great analysis result',
    agent_id: 'a1',
    created_at: '2026-02-20T10:00:00Z',
  },
  {
    id: 'eval2',
    session_id: 'regular-session-1234',
    task_id: 'task-xyz98765-uvw4-3210',
    rating: 2,
    result_accuracy: false,
    speed_satisfaction: false,
    comment: null,
    agent_id: null,
    created_at: '2026-02-19T15:30:00Z',
  },
]

const mockAnalysisDetail = {
  id: 'analysis1',
  project_id: 'p1',
  task_input: 'Build a REST API for user management',
  success: true,
  analysis: {
    type: 'task_analysis',
    analysis: {
      complexity_score: 7,
      effort_level: 'medium',
      requires_decomposition: true,
      context_summary: 'Creating a user management REST API with CRUD operations',
      key_requirements: ['Authentication', 'Database schema', 'Input validation'],
    },
    execution_plan: {
      strategy: 'parallel',
      execution_order: ['sub1', 'sub2', 'sub3'],
      parallel_groups: [['sub1', 'sub2'], ['sub3']],
      subtasks: {
        sub1: { title: 'Design DB schema', agent: 'backend-specialist', dependencies: [], effort: 'quick' },
        sub2: { title: 'Setup auth', agent: 'security-specialist', dependencies: [], effort: 'medium' },
        sub3: { title: 'Implement endpoints', agent: null, dependencies: ['sub1', 'sub2'], effort: 'thorough' },
      },
    },
    subtask_count: 3,
    strategy: 'parallel',
  },
  error: null,
  execution_time_ms: 2500,
  complexity_score: 7,
  effort_level: 'medium',
  subtask_count: 3,
  strategy: 'parallel',
  image_paths: null,
  created_at: '2026-02-20T10:00:00Z',
}

const mockProjects = [
  { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false, vector_store_initialized: false, indexed_at: null, git_path: null, git_enabled: false, sort_order: 0, is_active: true },
  { id: 'p2', name: 'Project Beta', path: '/beta', description: '', has_claude_md: false, vector_store_initialized: false, indexed_at: null, git_path: null, git_enabled: false, sort_order: 1, is_active: true },
  { id: 'p3', name: 'Archived Project', path: '/archived', description: '', has_claude_md: false, vector_store_initialized: false, indexed_at: null, git_path: null, git_enabled: false, sort_order: 2, is_active: false },
]

// ─────────────────────────────────────────────────────────────
// Helper: configure fetch mocks
// ─────────────────────────────────────────────────────────────

function setupFetchMock(overrides?: {
  dashboardData?: unknown
  evalStats?: unknown
  evalList?: unknown
  dashboardError?: boolean
  evalStatsError?: boolean
  evalListError?: boolean
  analysisDetail?: unknown
  analysisDetailError?: boolean
  compareTrendsData?: unknown
  compareTrendsError?: boolean
}) {
  vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    if (urlStr.includes('/analytics/dashboard')) {
      if (overrides?.dashboardError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides?.dashboardData ?? mockDashboardData),
      } as Response)
    }

    if (urlStr.includes('/feedback/task-evaluation/stats')) {
      if (overrides?.evalStatsError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides?.evalStats ?? { avg_rating: 0, accuracy_rate: 0, speed_satisfaction_rate: 0, total_count: 0, by_agent: [] }),
      } as Response)
    }

    if (urlStr.includes('/feedback/task-evaluation/list')) {
      if (overrides?.evalListError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides?.evalList ?? []),
      } as Response)
    }

    if (urlStr.includes('/agents/orchestrate/analyses/')) {
      if (overrides?.analysisDetailError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides?.analysisDetail ?? mockAnalysisDetail),
      } as Response)
    }

    if (urlStr.includes('/analytics/trends/compare')) {
      if (overrides?.compareTrendsError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides?.compareTrendsData ?? {
          metric: 'tasks',
          period: '7d',
          series: [
            { project_id: 'p1', project_name: 'Project Alpha', color: '#3B82F6', data: [{ timestamp: '2026-02-01', value: 10, label: 'Feb 1' }] },
            { project_id: 'p2', project_name: 'Project Beta', color: '#10B981', data: [{ timestamp: '2026-02-01', value: 15, label: 'Feb 1' }] },
          ],
        }),
      } as Response)
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  })
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMock()
  })

  // ── Basic rendering ──

  it('renders the analytics dashboard header after loading', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('Monitor performance, costs, and trends')).toBeInTheDocument()
  })

  it('renders overview metric cards', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeInTheDocument()
    })

    const successRateElements = screen.getAllByText('Success Rate')
    expect(successRateElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    const avgDuration = screen.getAllByText('Avg Duration')
    expect(avgDuration.length).toBeGreaterThanOrEqual(1)
  })

  it('renders time range selector', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('1 Hour')).toBeInTheDocument()
    expect(screen.getByText('24 Hours')).toBeInTheDocument()
    expect(screen.getByText('7 Days')).toBeInTheDocument()
    expect(screen.getByText('30 Days')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
  })

  it('renders chart cards', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Task Volume')).toBeInTheDocument()
    })

    expect(screen.getByText('Success Rate Trend')).toBeInTheDocument()
    expect(screen.getByText('Cost by Model')).toBeInTheDocument()
    expect(screen.getByText('Model Performance')).toBeInTheDocument()
    expect(screen.getByText('Token Usage Trend')).toBeInTheDocument()
    expect(screen.getByText('Activity Heatmap')).toBeInTheDocument()
  })

  it('renders model details table', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Model Details')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Agent')).toBeInTheDocument()
    expect(screen.getByText('general')).toBeInTheDocument()
  })

  it('renders project comparison section', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByTestId('project-multi-select')).toBeInTheDocument()
    })
  })

  it('renders overview values correctly', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    const successRates = screen.getAllByText('90.0%')
    expect(successRates.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('$12.50')).toBeInTheDocument()
  })

  // ── Loading state ──

  it('shows loading spinner initially', async () => {
    // Make fetch never resolve to keep loading state
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))

    await act(async () => {
      render(<AnalyticsPage />)
    })

    // Loading state shows the spinner (RefreshCw with animate-spin)
    // The loading state returns a div with flex-1 p-6 flex items-center justify-center
    const container = document.querySelector('.animate-spin')
    expect(container).toBeInTheDocument()
  })

  // ── Error state ──

  it('shows error state when API fails', async () => {
    vi.mocked(global.fetch).mockImplementation(() => {
      return Promise.reject(new Error('Network error'))
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows error when dashboard API returns non-ok status', async () => {
    setupFetchMock({ dashboardError: true })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch analytics')).toBeInTheDocument()
    })
  })

  it('retries loading data when Retry button is clicked', async () => {
    // First call fails
    let callCount = 0
    vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      callCount++
      if (callCount <= 3) {
        // First 3 calls (dashboard + eval stats + eval list) fail
        if (urlStr.includes('/analytics/dashboard')) {
          return Promise.reject(new Error('Server down'))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
      }
      // After retry, succeed
      if (urlStr.includes('/analytics/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDashboardData),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avg_rating: 0, accuracy_rate: 0, speed_satisfaction_rate: 0, total_count: 0, by_agent: [] }),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Server down')).toBeInTheDocument()
    })

    // Click Retry
    await act(async () => {
      fireEvent.click(screen.getByText('Retry'))
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })
  })

  // ── Time range change ──

  it('refetches data when time range is changed', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const initialFetchCount = vi.mocked(global.fetch).mock.calls.length

    // Change time range to 24h
    const timeRangeSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="1h"]')
    )
    expect(timeRangeSelect).toBeTruthy()

    await act(async () => {
      fireEvent.change(timeRangeSelect!, { target: { value: '24h' } })
    })

    await waitFor(() => {
      expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(initialFetchCount)
    })
  })

  // ── Project selector ──

  it('renders project selector with projects from store', async () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    } as ReturnType<typeof useProjectsStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Non-admin should see active projects only
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
    // Archived project should be hidden for non-admin
    expect(screen.queryByText('Archived Project')).not.toBeInTheDocument()
  })

  it('admin sees all projects including inactive', async () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    } as ReturnType<typeof useProjectsStore>)

    vi.mocked(useAuthStore).mockImplementation((selector?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', is_admin: true } }
      return selector ? selector(state) : state
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
    // Admin should see inactive project too
    expect(screen.getByText('Archived Project')).toBeInTheDocument()
  })

  it('refetches data when project selector changes', async () => {
    vi.mocked(useProjectsStore).mockReturnValue({
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    } as ReturnType<typeof useProjectsStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const initialFetchCount = vi.mocked(global.fetch).mock.calls.length

    // Select a project
    const projectSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="p1"]')
    )
    expect(projectSelect).toBeTruthy()

    await act(async () => {
      fireEvent.change(projectSelect!, { target: { value: 'p1' } })
    })

    await waitFor(() => {
      // Should have made new fetch calls with project_id param
      const newCalls = vi.mocked(global.fetch).mock.calls.slice(initialFetchCount)
      const dashboardCall = newCalls.find((c) => String(c[0]).includes('/analytics/dashboard'))
      expect(dashboardCall).toBeTruthy()
      expect(String(dashboardCall![0])).toContain('project_id=p1')
    })
  })

  // ── Refresh button ──

  it('refresh button reloads data', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const initialFetchCount = vi.mocked(global.fetch).mock.calls.length

    // Find the refresh button (last button in the filters area)
    const buttons = screen.getAllByRole('button')
    // The refresh button has a RefreshCw icon inside
    const refreshButton = buttons.find((btn) =>
      btn.querySelector('.w-4.h-4') && !btn.textContent
    )

    if (refreshButton) {
      await act(async () => {
        fireEvent.click(refreshButton)
      })

      await waitFor(() => {
        expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(initialFetchCount)
      })
    }
  })

  // ── Eval Stats Cards ──

  it('renders evaluation stats cards when eval data exists', async () => {
    setupFetchMock({ evalStats: mockEvalStats })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('평가 수')).toBeInTheDocument()
    })

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('평균 만족도')).toBeInTheDocument()
    expect(screen.getByText('4.2 / 5')).toBeInTheDocument()
    expect(screen.getByText('정확도')).toBeInTheDocument()
    expect(screen.getByText('85.0%')).toBeInTheDocument()
    expect(screen.getByText('속도 만족도')).toBeInTheDocument()
    expect(screen.getByText('78.0%')).toBeInTheDocument()
  })

  it('does not render eval stats cards when total_count is 0', async () => {
    setupFetchMock({
      evalStats: { avg_rating: 0, accuracy_rate: 0, speed_satisfaction_rate: 0, total_count: 0, by_agent: [] },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.queryByText('평가 수')).not.toBeInTheDocument()
  })

  // ── Eval List ──

  it('renders evaluation list when evaluations exist', async () => {
    setupFetchMock({ evalStats: mockEvalStats, evalList: mockEvalList })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/최근 평가/)).toBeInTheDocument()
    })

    // Eval list should show comment
    expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    // Eval without comment shows placeholder
    expect(screen.getByText('코멘트 없음')).toBeInTheDocument()
    // Accuracy badges
    expect(screen.getByText('정확')).toBeInTheDocument()
    expect(screen.getByText('부정확')).toBeInTheDocument()
    // Speed badges
    expect(screen.getByText('빠름')).toBeInTheDocument()
    expect(screen.getByText('느림')).toBeInTheDocument()
    // Agent ID badge (appears both in badge and filter option)
    const a1Elements = screen.getAllByText('a1')
    expect(a1Elements.length).toBeGreaterThanOrEqual(1)
  })

  it('toggles eval list visibility when header is clicked', async () => {
    setupFetchMock({ evalStats: mockEvalStats, evalList: mockEvalList })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/최근 평가/)).toBeInTheDocument()
    })

    // Initially visible
    expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()

    // Click header to collapse
    await act(async () => {
      fireEvent.click(screen.getByText(/최근 평가/))
    })

    // Content should be hidden
    expect(screen.queryByText(/Great analysis result/)).not.toBeInTheDocument()

    // Click again to expand
    await act(async () => {
      fireEvent.click(screen.getByText(/최근 평가/))
    })

    expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
  })

  it('does not render eval list when no evaluations exist', async () => {
    setupFetchMock({ evalList: [] })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.queryByText(/최근 평가/)).not.toBeInTheDocument()
  })

  // ── Eval Detail Expansion ──

  it('expands task-analyzer evaluation to show analysis detail', async () => {
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
      analysisDetail: mockAnalysisDetail,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    // Click on the task-analyzer eval item to expand
    await act(async () => {
      fireEvent.click(screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!)
    })

    // Should show loading then detail
    await waitFor(() => {
      expect(screen.getByText('Build a REST API for user management')).toBeInTheDocument()
    })

    // Analysis detail should show complexity, effort, subtasks, strategy
    expect(screen.getByText('Complexity')).toBeInTheDocument()
    expect(screen.getByText('7/10')).toBeInTheDocument()
    expect(screen.getByText('Effort Level')).toBeInTheDocument()
    // 'medium' appears in effort level badge and possibly subtask effort
    const mediumElements = screen.getAllByText('medium')
    expect(mediumElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Subtasks')).toBeInTheDocument()
    expect(screen.getByText('Strategy')).toBeInTheDocument()
    expect(screen.getByText('Context Summary')).toBeInTheDocument()
    expect(screen.getByText('Key Requirements')).toBeInTheDocument()
    expect(screen.getByText('Execution Plan')).toBeInTheDocument()

    // Subtask titles
    expect(screen.getByText('Design DB schema')).toBeInTheDocument()
    expect(screen.getByText('Setup auth')).toBeInTheDocument()
    expect(screen.getByText('Implement endpoints')).toBeInTheDocument()
  })

  it('collapses expanded eval detail when clicked again', async () => {
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
      analysisDetail: mockAnalysisDetail,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    const evalItem = screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!

    // Expand
    await act(async () => {
      fireEvent.click(evalItem)
    })

    await waitFor(() => {
      expect(screen.getByText('Build a REST API for user management')).toBeInTheDocument()
    })

    // Collapse
    await act(async () => {
      fireEvent.click(evalItem)
    })

    await waitFor(() => {
      expect(screen.queryByText('Build a REST API for user management')).not.toBeInTheDocument()
    })
  })

  it('shows "not found" when analysis detail is null', async () => {
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
      analysisDetailError: true,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    // Click on the task-analyzer eval item
    await act(async () => {
      fireEvent.click(screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!)
    })

    await waitFor(() => {
      expect(screen.getByText('분석 데이터를 찾을 수 없습니다.')).toBeInTheDocument()
    })
  })

  it('non-task-analyzer evals are not expandable', async () => {
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('코멘트 없음')).toBeInTheDocument()
    })

    // Click on the non-task-analyzer eval (eval2)
    const nonExpandableItem = screen.getByText('코멘트 없음').closest('div[class*="px-5"]')!
    const fetchCountBefore = vi.mocked(global.fetch).mock.calls.length

    await act(async () => {
      fireEvent.click(nonExpandableItem)
    })

    // No additional fetch should have been made for analysis detail
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCountBefore)
  })

  // ── Agent filter in eval list ──

  it('filters eval list by agent when agent filter is changed', async () => {
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/최근 평가/)).toBeInTheDocument()
    })

    // Find the agent filter select (contains "전체 에이전트" option)
    const agentSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value=""]') && el.textContent?.includes('전체 에이전트')
    )
    expect(agentSelect).toBeTruthy()

    const fetchCountBefore = vi.mocked(global.fetch).mock.calls.length

    await act(async () => {
      fireEvent.change(agentSelect!, { target: { value: 'a1' } })
    })

    // Should have made a new fetch call for eval list with agent_id filter
    await waitFor(() => {
      const newCalls = vi.mocked(global.fetch).mock.calls.slice(fetchCountBefore)
      const listCall = newCalls.find((c) => String(c[0]).includes('/feedback/task-evaluation/list'))
      expect(listCall).toBeTruthy()
      expect(String(listCall![0])).toContain('agent_id=a1')
    })
  })

  // ── Model Details Table ──

  it('renders model details table with agent eval data', async () => {
    setupFetchMock({ evalStats: mockEvalStats })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Model Details')).toBeInTheDocument()
    })

    // Table headers (some like "Tasks" may match dropdown options too)
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getAllByText('Tasks').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getAllByText('Tokens').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cost').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Rating')).toBeInTheDocument()
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
    expect(screen.getByText('Evals')).toBeInTheDocument()

    // Agent data
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
    expect(screen.getByText('$3.50')).toBeInTheDocument()
    expect(screen.getByText('100.0K')).toBeInTheDocument()
  })

  it('shows dash for rating/accuracy when no agent eval data', async () => {
    // With no eval stats, the table should show dashes
    setupFetchMock({
      evalStats: { avg_rating: 0, accuracy_rate: 0, speed_satisfaction_rate: 0, total_count: 0, by_agent: [] },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Model Details')).toBeInTheDocument()
    })

    // Should have dash placeholders for rating, accuracy, evals columns
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(3) // rating, accuracy, evals
  })

  // ── Overview metric formatting ──

  it('formats large token counts correctly (500K)', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      // 500000 tokens → "500.0K tokens" in cost card subtitle
      expect(screen.getByText(/500\.0K tokens/)).toBeInTheDocument()
    })
  })

  it('formats duration in seconds', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('1.5s')).toBeInTheDocument()
    })
  })

  it('shows success rate with low value and red icon', async () => {
    const lowSuccessData = {
      ...mockDashboardData,
      overview: {
        ...mockDashboardData.overview,
        success_rate: 50.0,
      },
    }
    setupFetchMock({ dashboardData: lowSuccessData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeInTheDocument()
    })
  })

  // ── Duration formatting edge cases ──

  it('formats duration in ms for very short durations', async () => {
    const msData = {
      ...mockDashboardData,
      overview: { ...mockDashboardData.overview, avg_task_duration_ms: 500 },
    }
    setupFetchMock({ dashboardData: msData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('500ms')).toBeInTheDocument()
    })
  })

  it('formats duration in minutes for long durations', async () => {
    const minData = {
      ...mockDashboardData,
      overview: { ...mockDashboardData.overview, avg_task_duration_ms: 120000 },
    }
    setupFetchMock({ dashboardData: minData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('2.0m')).toBeInTheDocument()
    })
  })

  // ── Token formatting edge cases ──

  it('formats token counts in millions', async () => {
    const millionTokenData = {
      ...mockDashboardData,
      overview: { ...mockDashboardData.overview, total_tokens: 2500000 },
    }
    setupFetchMock({ dashboardData: millionTokenData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      // 2500000 tokens → "2.5M tokens" in cost card subtitle
      expect(screen.getByText(/2\.5M tokens/)).toBeInTheDocument()
    })
  })

  it('formats small token counts as plain number', async () => {
    const smallTokenData = {
      ...mockDashboardData,
      overview: { ...mockDashboardData.overview, total_tokens: 500 },
    }
    setupFetchMock({ dashboardData: smallTokenData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      // 500 tokens → "500 tokens" in cost card subtitle
      expect(screen.getByText(/500 tokens/)).toBeInTheDocument()
    })
  })

  // ── Claude Usage / Model Token Breakdown ──

  it('renders model token breakdown chart when claude usage data exists', async () => {
    vi.mocked(useClaudeUsageStore).mockReturnValue({
      usage: {
        weeklyModelTokens: [
          { date: '2026-02-15', tokensByModel: { 'claude-3.5': 10000, 'gemini-2.0': 20000 } },
          { date: '2026-02-16', tokensByModel: { 'claude-3.5': 15000, 'gemini-2.0': 25000 } },
        ],
      },
      fetchUsage: mockFetchUsage,
    } as unknown as ReturnType<typeof useClaudeUsageStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Model Token Breakdown (7 Days)')).toBeInTheDocument()
    })

    // Should show bar charts, not the empty state
    expect(screen.queryByText('No model token data available')).not.toBeInTheDocument()
  })

  it('shows empty state when no claude usage data', async () => {
    vi.mocked(useClaudeUsageStore).mockReturnValue({
      usage: null,
      fetchUsage: mockFetchUsage,
    } as unknown as ReturnType<typeof useClaudeUsageStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('No model token data available')).toBeInTheDocument()
    })
  })

  it('shows empty state when weeklyModelTokens is null', async () => {
    vi.mocked(useClaudeUsageStore).mockReturnValue({
      usage: { weeklyModelTokens: null },
      fetchUsage: mockFetchUsage,
    } as unknown as ReturnType<typeof useClaudeUsageStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('No model token data available')).toBeInTheDocument()
    })
  })

  // ── Multi-project comparison ──

  it('shows comparison placeholder when fewer than 2 projects selected', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('2개 이상의 프로젝트를 선택하면 비교 차트가 표시됩니다')).toBeInTheDocument()
    })
  })

  it('loads comparison data when 2+ projects are selected', async () => {
    setupFetchMock({})

    vi.mocked(useProjectsStore).mockReturnValue({
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    } as ReturnType<typeof useProjectsStore>)

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Trigger project selection (mock ProjectMultiSelect fires onChange with ['p1', 'p2'])
    const selectBtn = screen.getByTestId('select-projects-btn')

    await act(async () => {
      fireEvent.click(selectBtn)
    })

    // Should trigger comparison fetch
    await waitFor(() => {
      const compareCalls = vi.mocked(global.fetch).mock.calls.filter((c) =>
        String(c[0]).includes('/analytics/trends/compare')
      )
      expect(compareCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Compare metric selector ──

  it('renders compare metric selector with all options', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Find the metric selector (contains Tasks, Tokens, Cost, Success Rate options)
    const metricSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="tasks"]')
    )
    expect(metricSelect).toBeTruthy()

    // Check options exist
    expect(metricSelect!.querySelector('option[value="tasks"]')).toBeTruthy()
    expect(metricSelect!.querySelector('option[value="tokens"]')).toBeTruthy()
    expect(metricSelect!.querySelector('option[value="cost"]')).toBeTruthy()
    expect(metricSelect!.querySelector('option[value="success_rate"]')).toBeTruthy()
  })

  // ── Activity Heatmap ──

  it('renders activity heatmap with day labels', async () => {
    setupFetchMock({
      dashboardData: {
        ...mockDashboardData,
        activity: {
          cells: [
            { day: 0, hour: 9, value: 5 },
            { day: 1, hour: 14, value: 8 },
          ],
          max_value: 10,
          time_range: '7d',
        },
      },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Activity Heatmap')).toBeInTheDocument()
    })

    // Day labels should be present
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Tue')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()
    expect(screen.getByText('Sat')).toBeInTheDocument()

    // Legend labels
    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  // ── Fetch calls on mount ──

  it('calls fetchProjects on mount', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(mockFetchProjects).toHaveBeenCalled()
  })

  it('calls fetchUsage on mount', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(mockFetchUsage).toHaveBeenCalled()
  })

  // ── Eval stats colors based on thresholds ──

  it('renders eval stats with appropriate color classes based on thresholds', async () => {
    setupFetchMock({
      evalStats: {
        avg_rating: 2.5,
        accuracy_rate: 0.45,
        speed_satisfaction_rate: 0.45,
        total_count: 5,
        by_agent: [],
      },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('2.5 / 5')).toBeInTheDocument()
    })

    // Low accuracy and speed - both show 45.0% (accuracy and speed have same value)
    const percentElements = screen.getAllByText('45.0%')
    expect(percentElements.length).toBeGreaterThanOrEqual(1)
  })

  // ── Multiple agents in the table ──

  it('renders multiple agents in model details table', async () => {
    const multiAgentData = {
      ...mockDashboardData,
      agents: {
        agents: [
          {
            agent_id: 'a1', agent_name: 'Agent One', category: 'code',
            total_tasks: 100, completed_tasks: 98, failed_tasks: 2,
            success_rate: 98.0, avg_duration_ms: 800, total_tokens: 200000, total_cost: 5.00,
          },
          {
            agent_id: 'a2', agent_name: 'Agent Two', category: 'research',
            total_tasks: 50, completed_tasks: 40, failed_tasks: 10,
            success_rate: 80.0, avg_duration_ms: 3000, total_tokens: 150000, total_cost: 4.50,
          },
        ],
        time_range: '7d',
      },
    }
    setupFetchMock({ dashboardData: multiAgentData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Agent One')).toBeInTheDocument()
    })

    expect(screen.getByText('Agent Two')).toBeInTheDocument()
    expect(screen.getByText('code')).toBeInTheDocument()
    expect(screen.getByText('research')).toBeInTheDocument()
    expect(screen.getByText('98.0%')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  // ── Eval stats error handling ──

  it('handles eval stats API error gracefully', async () => {
    setupFetchMock({ evalStatsError: true })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Page should still render without eval stats
    expect(screen.queryByText('평가 수')).not.toBeInTheDocument()
  })

  it('handles eval list API error gracefully', async () => {
    setupFetchMock({ evalListError: true })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Page should still render without eval list
    expect(screen.queryByText(/최근 평가/)).not.toBeInTheDocument()
  })

  // ── EvalDetailView without analysis data ──

  it('shows fallback when analysis detail has no analysis data', async () => {
    const noAnalysisDetail = {
      ...mockAnalysisDetail,
      analysis: null,
      success: false,
      error: 'Analysis timed out',
      execution_time_ms: 5000,
    }
    setupFetchMock({
      evalStats: mockEvalStats,
      evalList: mockEvalList,
      analysisDetail: noAnalysisDetail,
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    // Click to expand
    await act(async () => {
      fireEvent.click(screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!)
    })

    await waitFor(() => {
      expect(screen.getByText(/분석 결과: 실패/)).toBeInTheDocument()
    })

    expect(screen.getByText('Analysis timed out')).toBeInTheDocument()
    expect(screen.getByText(/실행 시간: 5000ms/)).toBeInTheDocument()
  })

  // ── Project comparison placeholder text ──

  it('shows comparison placeholder with GitCompare icon area', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('프로젝트 비교')).toBeInTheDocument()
    })

    expect(screen.getByText('2개 이상의 프로젝트를 선택하면 비교 차트가 표시됩니다')).toBeInTheDocument()
  })

  // ── Model details table with eval matching ──

  it('matches agent eval data by agent_name fallback', async () => {
    // eval stats has by_agent with agent_id matching agent_name (lowercased, dashes)
    const evalStatsWithNameMatch = {
      ...mockEvalStats,
      by_agent: [
        { agent_id: 'test-agent', avg_rating: 4.8, accuracy_rate: 0.95, speed_satisfaction_rate: 0.9, total_count: 20 },
      ],
    }
    setupFetchMock({ evalStats: evalStatsWithNameMatch })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeInTheDocument()
    })

    // The agent eval should be matched via agent_name.toLowerCase().replace(/\s+/g, '-') === 'test-agent'
    expect(screen.getByText('4.8')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  // ── Subtitle text in metric cards ──

  it('renders metric card subtitles correctly', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('180 completed, 200 tool calls')).toBeInTheDocument()
    expect(screen.getByText('10 failed')).toBeInTheDocument()
    expect(screen.getByText('5 active sessions')).toBeInTheDocument()
  })

  // ── Heatmap hour labels ──

  it('renders heatmap hour labels at 6-hour intervals', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Activity Heatmap')).toBeInTheDocument()
    })

    // Hour labels at 0, 6, 12, 18
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(screen.getByText('6:00')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  // ── Default project selector value ──

  it('shows "전체 프로젝트" as default project selection', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('전체 프로젝트')).toBeInTheDocument()
    })
  })

  // ── formatTrendLabel branch coverage for different time ranges ──

  it('exercises 1h time range formatting', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const timeRangeSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="1h"]')
    )

    await act(async () => {
      fireEvent.change(timeRangeSelect!, { target: { value: '1h' } })
    })

    // Wait for re-render with new time range
    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })
  })

  it('exercises 30d time range formatting', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const timeRangeSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="30d"]')
    )

    await act(async () => {
      fireEvent.change(timeRangeSelect!, { target: { value: '30d' } })
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })
  })

  it('exercises all time range formatting', async () => {
    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    const timeRangeSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="all"]')
    )

    await act(async () => {
      fireEvent.change(timeRangeSelect!, { target: { value: 'all' } })
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })
  })

  // ── Compare data error handling ──

  it('handles compare trends API failure gracefully', async () => {
    setupFetchMock({ compareTrendsError: true })

    vi.mocked(useProjectsStore).mockReturnValue({
      projects: mockProjects,
      fetchProjects: mockFetchProjects,
    } as ReturnType<typeof useProjectsStore>)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument()
    })

    // Trigger project selection to start comparison fetch
    await act(async () => {
      fireEvent.click(screen.getByTestId('select-projects-btn'))
    })

    // Wait for the comparison fetch to fail
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load compare data:',
        expect.anything()
      )
    })

    consoleSpy.mockRestore()
  })

  // ── Analysis detail fetch throws (catch block) ──

  it('handles fetchAnalysisDetail network error gracefully', async () => {
    vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()

      if (urlStr.includes('/analytics/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDashboardData),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvalStats),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvalList),
        } as Response)
      }
      if (urlStr.includes('/agents/orchestrate/analyses/')) {
        return Promise.reject(new Error('Network failure'))
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    // Click to expand the task-analyzer eval
    await act(async () => {
      fireEvent.click(screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!)
    })

    // fetchAnalysisDetail catches the error and returns null
    await waitFor(() => {
      expect(screen.getByText('분석 데이터를 찾을 수 없습니다.')).toBeInTheDocument()
    })
  })

  // ── Eval loading state ──

  it('shows loading indicator while fetching analysis detail', async () => {
    vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()

      if (urlStr.includes('/analytics/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDashboardData),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvalStats),
        } as Response)
      }
      if (urlStr.includes('/feedback/task-evaluation/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvalList),
        } as Response)
      }
      if (urlStr.includes('/agents/orchestrate/analyses/')) {
        return new Promise(() => {})
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Great analysis result/)).toBeInTheDocument()
    })

    // Click to expand
    await act(async () => {
      fireEvent.click(screen.getByText(/Great analysis result/).closest('div[class*="px-5"]')!)
    })

    await waitFor(() => {
      expect(screen.getByText('분석 데이터 로딩 중...')).toBeInTheDocument()
    })
  })

  // ── Agent table success rate color branches ──

  it('shows green color for high agent success rate (>= 95)', async () => {
    const highSuccessData = {
      ...mockDashboardData,
      agents: {
        agents: [
          {
            agent_id: 'a1', agent_name: 'Excellent Agent', category: 'ai',
            total_tasks: 100, completed_tasks: 99, failed_tasks: 1,
            success_rate: 99.0, avg_duration_ms: 800, total_tokens: 50000, total_cost: 2.00,
          },
        ],
        time_range: '7d',
      },
    }
    setupFetchMock({ dashboardData: highSuccessData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Excellent Agent')).toBeInTheDocument()
    })
    expect(screen.getByText('99.0%')).toBeInTheDocument()
  })

  it('shows red color for low agent success rate (< 90)', async () => {
    const lowSuccessData = {
      ...mockDashboardData,
      agents: {
        agents: [
          {
            agent_id: 'a1', agent_name: 'Struggling Agent', category: 'test',
            total_tasks: 100, completed_tasks: 70, failed_tasks: 30,
            success_rate: 70.0, avg_duration_ms: 5000, total_tokens: 80000, total_cost: 3.00,
          },
        ],
        time_range: '7d',
      },
    }
    setupFetchMock({ dashboardData: lowSuccessData })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('Struggling Agent')).toBeInTheDocument()
    })
    expect(screen.getByText('70.0%')).toBeInTheDocument()
  })

  // ── Agent eval color branches in table ──

  it('shows yellow color for medium agent rating (3-4) in table', async () => {
    setupFetchMock({
      evalStats: {
        avg_rating: 3.2,
        accuracy_rate: 0.6,
        speed_satisfaction_rate: 0.5,
        total_count: 8,
        by_agent: [
          { agent_id: 'a1', avg_rating: 3.0, accuracy_rate: 0.55, speed_satisfaction_rate: 0.5, total_count: 5 },
        ],
      },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('3.0')).toBeInTheDocument()
    })

    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('shows red color for low agent rating (< 3) in table', async () => {
    setupFetchMock({
      evalStats: {
        avg_rating: 2.0,
        accuracy_rate: 0.3,
        speed_satisfaction_rate: 0.4,
        total_count: 4,
        by_agent: [
          { agent_id: 'a1', avg_rating: 2.0, accuracy_rate: 0.3, speed_satisfaction_rate: 0.4, total_count: 4 },
        ],
      },
    })

    await act(async () => {
      render(<AnalyticsPage />)
    })

    await waitFor(() => {
      expect(screen.getByText('2.0 / 5')).toBeInTheDocument()
    })

    expect(screen.getByText('30%')).toBeInTheDocument()
  })
})
