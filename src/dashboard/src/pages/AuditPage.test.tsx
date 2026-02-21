import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    Clock: icon, Terminal: icon, CheckSquare: icon, AlertTriangle: icon,
    Activity: icon, TrendingUp: icon, RefreshCw: icon, BarChart3: icon,
    ArrowUpRight: icon, ArrowDownRight: icon, Minus: icon,
  }
})

const mockFetchLogs = vi.fn()
const mockFetchStats = vi.fn()
const mockFetchProjects = vi.fn()
const mockSetFilter = vi.fn()
const mockClearFilter = vi.fn()
const mockRefresh = vi.fn()

vi.mock('../stores/audit', () => ({
  useAuditStore: vi.fn(() => ({
    stats: {
      total_actions: 150,
      tool_executions: 80,
      approvals: 30,
      errors: 5,
      recent_trend: null,
      actions_by_type: null,
    },
    isLoadingStats: false,
    fetchLogs: mockFetchLogs,
    fetchStats: mockFetchStats,
    setFilter: mockSetFilter,
    clearFilter: mockClearFilter,
    refresh: mockRefresh,
  })),
}))

vi.mock('../stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => ({
    sessionId: null,
    projects: [],
    fetchProjects: mockFetchProjects,
  })),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', is_admin: false } }
    return selector ? selector(state) : state
  }),
}))

// Mock child component
vi.mock('../components/audit/AuditLogTable', () => ({
  AuditLogTable: ({ className }: { className?: string }) => (
    <div data-testid="audit-log-table" className={className}>AuditLogTable</div>
  ),
}))

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { AuditPage } from './AuditPage'
import { useAuditStore } from '../stores/audit'
import { useOrchestrationStore } from '../stores/orchestration'

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page header', () => {
    render(<AuditPage />)

    expect(screen.getByText('Audit Trail')).toBeInTheDocument()
    expect(screen.getByText('Track all system actions and changes')).toBeInTheDocument()
  })

  it('renders summary cards with stats', () => {
    render(<AuditPage />)

    expect(screen.getByText('Total Actions')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()

    expect(screen.getByText('Tool Executions')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()

    expect(screen.getByText('Approvals')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()

    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the audit log table', () => {
    render(<AuditPage />)

    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument()
  })

  it('renders summary card descriptions', () => {
    render(<AuditPage />)

    expect(screen.getByText('All recorded actions')).toBeInTheDocument()
    expect(screen.getByText('Commands and tools')).toBeInTheDocument()
    expect(screen.getByText('HITL decisions')).toBeInTheDocument()
    expect(screen.getByText('Failed operations')).toBeInTheDocument()
  })

  it('calls fetchLogs and fetchStats on mount', () => {
    render(<AuditPage />)

    expect(mockFetchLogs).toHaveBeenCalled()
    expect(mockFetchStats).toHaveBeenCalled()
  })

  it('shows project selector', () => {
    render(<AuditPage />)

    expect(screen.getByText('All Projects')).toBeInTheDocument()
  })

  it('shows session filter when sessionId is present', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      sessionId: 'test-session-123',
      projects: [],
      fetchProjects: mockFetchProjects,
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<AuditPage />)

    expect(screen.getByText('Show only current session')).toBeInTheDocument()
  })

  it('does not show session filter when no sessionId', () => {
    // Explicitly reset to no sessionId
    vi.mocked(useOrchestrationStore).mockReturnValue({
      sessionId: null,
      projects: [],
      fetchProjects: mockFetchProjects,
    } as unknown as ReturnType<typeof useOrchestrationStore>)

    render(<AuditPage />)

    expect(screen.queryByText('Show only current session')).not.toBeInTheDocument()
  })

  it('calls refresh when refresh button is clicked', () => {
    render(<AuditPage />)

    fireEvent.click(screen.getByTitle('Refresh'))

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows loading state in summary cards', () => {
    vi.mocked(useAuditStore).mockReturnValue({
      stats: null,
      isLoadingStats: true,
      fetchLogs: mockFetchLogs,
      fetchStats: mockFetchStats,
      setFilter: mockSetFilter,
      clearFilter: mockClearFilter,
      refresh: mockRefresh,
    } as unknown as ReturnType<typeof useAuditStore>)

    render(<AuditPage />)

    // When loading, the SummaryCard shows a pulse animation placeholder
    expect(screen.getByText('Total Actions')).toBeInTheDocument()
  })

  it('renders recent trend section when trend data exists', () => {
    vi.mocked(useAuditStore).mockReturnValue({
      stats: {
        total_actions: 150,
        tool_executions: 80,
        approvals: 30,
        errors: 5,
        recent_trend: [
          { date: '2026-02-01', count: 10 },
          { date: '2026-02-02', count: 15 },
          { date: '2026-02-03', count: 12 },
        ],
        actions_by_type: { tool_execution: 50, approval: 20, error: 5 },
      },
      isLoadingStats: false,
      fetchLogs: mockFetchLogs,
      fetchStats: mockFetchStats,
      setFilter: mockSetFilter,
      clearFilter: mockClearFilter,
      refresh: mockRefresh,
    } as unknown as ReturnType<typeof useAuditStore>)

    render(<AuditPage />)

    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.getByText('Actions by Type')).toBeInTheDocument()
  })
})
