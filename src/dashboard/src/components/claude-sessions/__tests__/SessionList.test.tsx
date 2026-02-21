import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  Circle: (props: Record<string, unknown>) => <span data-testid="icon-circle" {...props} />,
  CircleDot: (props: Record<string, unknown>) => <span data-testid="icon-circledot" {...props} />,
  ArrowUpDown: (props: Record<string, unknown>) => <span data-testid="icon-sort" {...props} />,
  ArrowUp: (props: Record<string, unknown>) => <span data-testid="icon-arrowup" {...props} />,
  ArrowDown: (props: Record<string, unknown>) => <span data-testid="icon-arrowdown" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="icon-search" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-sparkles" {...props} />,
}))

// Mock SessionCard subcomponent to isolate tests
vi.mock('../SessionCard', () => ({
  SessionCard: ({ session, isSelected, onClick }: {
    session: { session_id: string; slug: string }
    isSelected: boolean
    onClick: () => void
  }) => (
    <div
      data-testid={`session-card-${session.session_id}`}
      data-selected={isSelected}
      onClick={onClick}
    >
      {session.slug}
    </div>
  ),
}))

const mockFetchSessions = vi.fn()
const mockRefreshSessions = vi.fn()
const mockLoadMoreSessions = vi.fn()
const mockFetchSourceUsers = vi.fn()
const mockFetchProjects = vi.fn()
const mockSelectSession = vi.fn()
const mockSetAutoRefresh = vi.fn()
const mockSetSortBy = vi.fn()
const mockSetSortOrder = vi.fn()
const mockSetProjectFilter = vi.fn()
const mockSetSourceUserFilter = vi.fn()
const mockSetSearchQuery = vi.fn()
const mockFetchPendingSummaryCount = vi.fn()
const mockGenerateBatchSummaries = vi.fn()
const mockDeleteEmptySessions = vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] })
const mockDeleteGhostSessions = vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] })

const defaultStoreState = {
  sessions: [],
  filteredCount: 0,
  activeCount: 0,
  isLoading: false,
  hasMore: false,
  isLoadingMore: false,
  selectedSessionId: null,
  autoRefresh: false,
  refreshInterval: 30,
  sortBy: 'last_activity' as const,
  sortOrder: 'desc' as const,
  projectFilter: null as string | null,
  sourceUserFilter: null as string | null,
  sourceUsers: [] as string[],
  searchQuery: '',
  fetchSessions: mockFetchSessions,
  loadMoreSessions: mockLoadMoreSessions,
  refreshSessions: mockRefreshSessions,
  fetchSourceUsers: mockFetchSourceUsers,
  fetchProjects: mockFetchProjects,
  selectSession: mockSelectSession,
  setAutoRefresh: mockSetAutoRefresh,
  setSortBy: mockSetSortBy,
  setSortOrder: mockSetSortOrder,
  setProjectFilter: mockSetProjectFilter,
  setSourceUserFilter: mockSetSourceUserFilter,
  setSearchQuery: mockSetSearchQuery,
  getFilteredSessions: vi.fn(() => []),
  getUniqueProjects: vi.fn(() => [] as string[]),
  deleteEmptySessions: mockDeleteEmptySessions,
  deleteGhostSessions: mockDeleteGhostSessions,
  getEmptySessionsCount: vi.fn(() => 0),
  getGhostSessionsCount: vi.fn(() => 0),
  isBatchGenerating: false,
  batchJustCompleted: false,
  batchProgress: { processed: 0, total: 0 },
  pendingSummaryCount: 0,
  fetchPendingSummaryCount: mockFetchPendingSummaryCount,
  generateBatchSummaries: mockGenerateBatchSummaries,
}

let storeState = { ...defaultStoreState }

vi.mock('../../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => storeState),
}))

import { SessionList } from '../SessionList'

// Fix IntersectionObserver mock to work as a constructor
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
})

// Helper to create mock sessions
function createMockSession(overrides: Partial<{ session_id: string; slug: string; project_name: string; status: string }> = {}) {
  return {
    session_id: overrides.session_id ?? 'test-id',
    slug: overrides.slug ?? 'test-slug',
    project_name: overrides.project_name ?? 'TestProject',
    status: overrides.status ?? 'active',
    ...overrides,
  }
}

describe('SessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    storeState = { ...defaultStoreState }
    storeState.getFilteredSessions = vi.fn(() => [])
    storeState.getUniqueProjects = vi.fn(() => [])
    storeState.getEmptySessionsCount = vi.fn(() => 0)
    storeState.getGhostSessionsCount = vi.fn(() => 0)
    storeState.deleteEmptySessions = vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] })
    storeState.deleteGhostSessions = vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // =============================================
  // Header rendering
  // =============================================
  describe('header rendering', () => {
    it('renders header with "All Projects" when no project filter', () => {
      render(<SessionList />)
      expect(screen.getByText('All Projects')).toBeInTheDocument()
    })

    it('renders header with project name when filter is set', () => {
      storeState.projectFilter = 'My Project'
      render(<SessionList />)
      expect(screen.getByText('My Project')).toBeInTheDocument()
    })

    it('renders session counts in subtitle', () => {
      storeState.activeCount = 3
      storeState.sessions = [1, 2, 3, 4, 5] as never[]
      storeState.filteredCount = 10
      render(<SessionList />)
      expect(screen.getByText('3 active / 5 loaded / 10 total')).toBeInTheDocument()
    })
  })

  // =============================================
  // Initial fetch on mount
  // =============================================
  describe('initial fetch', () => {
    it('calls fetchSessions, fetchSourceUsers, fetchProjects and fetchPendingSummaryCount on mount', () => {
      render(<SessionList />)
      expect(mockFetchSessions).toHaveBeenCalled()
      expect(mockFetchSourceUsers).toHaveBeenCalled()
      expect(mockFetchProjects).toHaveBeenCalled()
      expect(mockFetchPendingSummaryCount).toHaveBeenCalled()
    })

    it('passes statusFilter to fetchSessions', () => {
      render(<SessionList statusFilter="active" />)
      expect(mockFetchSessions).toHaveBeenCalledWith('active', true)
    })

    it('calls fetchSessions with undefined statusFilter when no prop is passed', () => {
      render(<SessionList />)
      expect(mockFetchSessions).toHaveBeenCalledWith(undefined, true)
    })
  })

  // =============================================
  // Loading states
  // =============================================
  describe('loading states', () => {
    it('shows loading skeleton when loading with no sessions', () => {
      storeState.isLoading = true
      const { container } = render(<SessionList />)
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBe(3)
    })

    it('does NOT show loading skeleton when loading with existing sessions', () => {
      storeState.isLoading = true
      const sessions = [createMockSession({ session_id: 's1', slug: 'session-one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      render(<SessionList />)
      expect(screen.getByTestId('session-card-s1')).toBeInTheDocument()
    })
  })

  // =============================================
  // Empty states
  // =============================================
  describe('empty states', () => {
    it('shows empty state when no sessions at all', () => {
      render(<SessionList />)
      expect(screen.getByText('No sessions found')).toBeInTheDocument()
      expect(screen.getByText('Start a Claude Code session in another terminal')).toBeInTheDocument()
    })

    it('shows search empty state when sessions exist but filter matches none', () => {
      storeState.sessions = [{ id: '1' }] as never[]
      storeState.getFilteredSessions = vi.fn(() => [])
      render(<SessionList />)
      expect(screen.getByText(/검색 결과 없음/)).toBeInTheDocument()
      expect(screen.getByText(/다른 검색어를 시도해보세요/)).toBeInTheDocument()
    })
  })

  // =============================================
  // Session cards rendering
  // =============================================
  describe('session cards rendering', () => {
    it('renders session cards when sessions are present', () => {
      const sessions = [
        createMockSession({ session_id: 's1', slug: 'session-one' }),
        createMockSession({ session_id: 's2', slug: 'session-two' }),
      ]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      render(<SessionList />)
      expect(screen.getByTestId('session-card-s1')).toBeInTheDocument()
      expect(screen.getByTestId('session-card-s2')).toBeInTheDocument()
    })

    it('marks selected session card as selected', () => {
      const sessions = [
        createMockSession({ session_id: 's1', slug: 'session-one' }),
        createMockSession({ session_id: 's2', slug: 'session-two' }),
      ]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.selectedSessionId = 's2'
      render(<SessionList />)
      expect(screen.getByTestId('session-card-s1')).toHaveAttribute('data-selected', 'false')
      expect(screen.getByTestId('session-card-s2')).toHaveAttribute('data-selected', 'true')
    })

    it('calls selectSession when session card is clicked', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'session-one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      render(<SessionList />)
      fireEvent.click(screen.getByTestId('session-card-s1'))
      expect(mockSelectSession).toHaveBeenCalledWith('s1')
    })
  })

  // =============================================
  // Search functionality
  // =============================================
  describe('search functionality', () => {
    it('renders search input', () => {
      render(<SessionList />)
      expect(screen.getByPlaceholderText('세션 검색...')).toBeInTheDocument()
    })

    it('calls setSearchQuery on search input change', () => {
      render(<SessionList />)
      const input = screen.getByPlaceholderText('세션 검색...')
      fireEvent.change(input, { target: { value: 'test' } })
      expect(mockSetSearchQuery).toHaveBeenCalledWith('test')
    })

    it('shows clear button (X) when search query is not empty', () => {
      storeState.searchQuery = 'my query'
      render(<SessionList />)
      // The X button should be visible
      const clearButtons = screen.getAllByRole('button')
      // Find the clear search button (it clears the search query)
      const clearBtn = clearButtons.find(btn => {
        const icon = btn.querySelector('[data-testid="icon-x"]')
        return icon !== null
      })
      expect(clearBtn).toBeTruthy()
    })

    it('clears search query when X button is clicked', () => {
      storeState.searchQuery = 'my query'
      render(<SessionList />)
      const clearButtons = screen.getAllByRole('button')
      const clearBtn = clearButtons.find(btn => {
        const icon = btn.querySelector('[data-testid="icon-x"]')
        return icon !== null
      })
      expect(clearBtn).toBeTruthy()
      fireEvent.click(clearBtn!)
      expect(mockSetSearchQuery).toHaveBeenCalledWith('')
    })

    it('does not show X button when search query is empty', () => {
      storeState.searchQuery = ''
      const { container } = render(<SessionList />)
      // X icon should not be in the search area
      const searchArea = container.querySelector('.relative')
      const xIcons = searchArea?.querySelectorAll('[data-testid="icon-x"]')
      expect(xIcons?.length ?? 0).toBe(0)
    })
  })

  // =============================================
  // Auto-refresh
  // =============================================
  describe('auto-refresh', () => {
    it('toggles auto-refresh ON when button is clicked (currently OFF)', () => {
      render(<SessionList />)
      const autoRefreshBtn = screen.getByTitle('Auto-refresh OFF')
      fireEvent.click(autoRefreshBtn)
      expect(mockSetAutoRefresh).toHaveBeenCalledWith(true)
    })

    it('toggles auto-refresh OFF when button is clicked (currently ON)', () => {
      storeState.autoRefresh = true
      render(<SessionList />)
      const autoRefreshBtn = screen.getByTitle('Auto-refresh ON')
      fireEvent.click(autoRefreshBtn)
      expect(mockSetAutoRefresh).toHaveBeenCalledWith(false)
    })

    it('shows CircleDot icon when autoRefresh is ON', () => {
      storeState.autoRefresh = true
      render(<SessionList />)
      expect(screen.getByTitle('Auto-refresh ON').querySelector('[data-testid="icon-circledot"]')).toBeInTheDocument()
    })

    it('shows Circle icon when autoRefresh is OFF', () => {
      storeState.autoRefresh = false
      render(<SessionList />)
      expect(screen.getByTitle('Auto-refresh OFF').querySelector('[data-testid="icon-circle"]')).toBeInTheDocument()
    })

    it('sets up polling interval when autoRefresh is enabled', () => {
      storeState.autoRefresh = true
      storeState.refreshInterval = 5
      render(<SessionList />)

      // Advance timer to trigger refresh
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(mockRefreshSessions).toHaveBeenCalled()
    })

    it('cleans up interval on unmount', () => {
      storeState.autoRefresh = true
      storeState.refreshInterval = 5
      const { unmount } = render(<SessionList />)

      unmount()

      // Advance timer after unmount - should not call refresh
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      // refreshSessions should NOT have been called after unmount
      expect(mockRefreshSessions).not.toHaveBeenCalled()
    })

    it('does NOT set up polling when autoRefresh is disabled', () => {
      storeState.autoRefresh = false
      render(<SessionList />)
      act(() => {
        vi.advanceTimersByTime(60000)
      })
      expect(mockRefreshSessions).not.toHaveBeenCalled()
    })

    it('passes statusFilter to refreshSessions during auto-refresh', () => {
      storeState.autoRefresh = true
      storeState.refreshInterval = 5
      render(<SessionList statusFilter="active" />)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(mockRefreshSessions).toHaveBeenCalledWith('active')
    })
  })

  // =============================================
  // Manual refresh
  // =============================================
  describe('manual refresh', () => {
    it('calls fetchSessions with full reset when refresh button is clicked', () => {
      render(<SessionList />)
      const refreshBtn = screen.getByTitle('Refresh')
      mockFetchSessions.mockClear()
      fireEvent.click(refreshBtn)
      expect(mockFetchSessions).toHaveBeenCalledWith(undefined, true)
    })

    it('disables refresh button when loading', () => {
      storeState.isLoading = true
      render(<SessionList />)
      const refreshBtn = screen.getByTitle('Refresh')
      expect(refreshBtn).toBeDisabled()
    })

    it('shows spinning refresh icon when loading', () => {
      storeState.isLoading = true
      render(<SessionList />)
      const refreshBtn = screen.getByTitle('Refresh')
      const icon = refreshBtn.querySelector('[data-testid="icon-refresh"]')
      expect(icon).toBeInTheDocument()
    })

    it('passes statusFilter to fetchSessions on manual refresh', () => {
      render(<SessionList statusFilter="completed" />)
      const refreshBtn = screen.getByTitle('Refresh')
      mockFetchSessions.mockClear()
      fireEvent.click(refreshBtn)
      expect(mockFetchSessions).toHaveBeenCalledWith('completed', true)
    })
  })

  // =============================================
  // Sort dropdown
  // =============================================
  describe('sort dropdown', () => {
    it('opens sort menu when sort button is clicked', () => {
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      // Sort options should be visible
      expect(screen.getByText('마지막 활동')).toBeInTheDocument()
      expect(screen.getByText('생성일')).toBeInTheDocument()
      expect(screen.getByText('메시지 수')).toBeInTheDocument()
      expect(screen.getByText('비용')).toBeInTheDocument()
      expect(screen.getByText('프로젝트명')).toBeInTheDocument()
    })

    it('calls setSortBy when selecting a different sort field', () => {
      storeState.sortBy = 'last_activity'
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      fireEvent.click(screen.getByText('생성일'))
      expect(mockSetSortBy).toHaveBeenCalledWith('created_at')
    })

    it('toggles sort order when selecting the current sort field', () => {
      storeState.sortBy = 'last_activity'
      storeState.sortOrder = 'desc'
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      fireEvent.click(screen.getByText('마지막 활동'))
      expect(mockSetSortOrder).toHaveBeenCalledWith('asc')
    })

    it('toggles sort order from asc to desc when selecting the same sort field', () => {
      storeState.sortBy = 'last_activity'
      storeState.sortOrder = 'asc'
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      fireEvent.click(screen.getByText('마지막 활동'))
      expect(mockSetSortOrder).toHaveBeenCalledWith('desc')
    })

    it('closes sort menu after selecting an option', () => {
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      expect(screen.getByText('생성일')).toBeInTheDocument()
      fireEvent.click(screen.getByText('생성일'))
      // Menu should close - options should no longer be visible
      expect(screen.queryByText('메시지 수')).not.toBeInTheDocument()
    })

    it('closes sort menu on outside click', () => {
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      expect(screen.getByText('생성일')).toBeInTheDocument()
      // Click outside (mousedown on document body)
      fireEvent.mouseDown(document.body)
      expect(screen.queryByText('생성일')).not.toBeInTheDocument()
    })

    it('displays ArrowDown icon for active sort field with desc order', () => {
      storeState.sortBy = 'last_activity'
      storeState.sortOrder = 'desc'
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      expect(screen.getByTestId('icon-arrowdown')).toBeInTheDocument()
    })

    it('displays ArrowUp icon for active sort field with asc order', () => {
      storeState.sortBy = 'last_activity'
      storeState.sortOrder = 'asc'
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)
      fireEvent.click(sortBtn)
      expect(screen.getByTestId('icon-arrowup')).toBeInTheDocument()
    })

    it('shows the current sort label in the sort button title', () => {
      storeState.sortBy = 'estimated_cost'
      storeState.sortOrder = 'desc'
      render(<SessionList />)
      expect(screen.getByTitle('정렬: 비용 (내림차순)')).toBeInTheDocument()
    })

    it('shows asc order label in sort button title', () => {
      storeState.sortBy = 'created_at'
      storeState.sortOrder = 'asc'
      render(<SessionList />)
      expect(screen.getByTitle('정렬: 생성일 (오름차순)')).toBeInTheDocument()
    })
  })

  // =============================================
  // Project filter dropdown
  // =============================================
  describe('project filter dropdown', () => {
    it('does not render project filter button when no unique projects', () => {
      storeState.getUniqueProjects = vi.fn(() => [])
      render(<SessionList />)
      expect(screen.queryByTitle('프로젝트 필터')).not.toBeInTheDocument()
    })

    it('renders project filter button when unique projects exist', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA', 'ProjectB'])
      render(<SessionList />)
      expect(screen.getByTitle('프로젝트 필터')).toBeInTheDocument()
    })

    it('opens project menu when button is clicked', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA', 'ProjectB'])
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
      expect(screen.getByText('전체')).toBeInTheDocument()
      expect(screen.getByText('ProjectA')).toBeInTheDocument()
      expect(screen.getByText('ProjectB')).toBeInTheDocument()
    })

    it('calls setProjectFilter with project name when project is selected', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA', 'ProjectB'])
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
      fireEvent.click(screen.getByText('ProjectA'))
      expect(mockSetProjectFilter).toHaveBeenCalledWith('ProjectA')
    })

    it('calls setProjectFilter with null when "전체" is selected', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      storeState.projectFilter = 'ProjectA'
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트: ProjectA'))
      fireEvent.click(screen.getByText('전체'))
      expect(mockSetProjectFilter).toHaveBeenCalledWith(null)
    })

    it('closes project menu after selecting a project', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA', 'ProjectB'])
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
      expect(screen.getByText('ProjectA')).toBeInTheDocument()
      fireEvent.click(screen.getByText('ProjectA'))
      // Menu should close
      expect(screen.queryByText('ProjectB')).not.toBeInTheDocument()
    })

    it('closes project menu on outside click', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
      expect(screen.getByText('ProjectA')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByText('ProjectA')).not.toBeInTheDocument()
    })

    it('shows active project filter title when a project is selected', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      storeState.projectFilter = 'ProjectA'
      render(<SessionList />)
      expect(screen.getByTitle('프로젝트: ProjectA')).toBeInTheDocument()
    })

    it('shows check icon next to currently selected project', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA', 'ProjectB'])
      storeState.projectFilter = 'ProjectA'
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트: ProjectA'))
      // Check icons appear - one next to "ProjectA"
      const checkIcons = screen.getAllByTestId('icon-check')
      expect(checkIcons.length).toBeGreaterThan(0)
    })

    it('shows check icon next to "전체" when no project filter is active', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      storeState.projectFilter = null
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
      // A check icon should be next to "전체"
      const checkIcons = screen.getAllByTestId('icon-check')
      expect(checkIcons.length).toBeGreaterThan(0)
    })
  })

  // =============================================
  // Source user filter dropdown
  // =============================================
  describe('source user filter dropdown', () => {
    it('does not render user filter button when sourceUsers has 0 or 1 entries', () => {
      storeState.sourceUsers = ['singleuser']
      render(<SessionList />)
      expect(screen.queryByTitle('사용자 필터')).not.toBeInTheDocument()
    })

    it('renders user filter button when sourceUsers has more than 1 entry', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      expect(screen.getByTitle('사용자 필터')).toBeInTheDocument()
    })

    it('opens user menu when button is clicked', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자 필터'))
      expect(screen.getByText('전체 사용자')).toBeInTheDocument()
      expect(screen.getByText('user1')).toBeInTheDocument()
      expect(screen.getByText('user2')).toBeInTheDocument()
    })

    it('calls setSourceUserFilter with user when user is selected', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자 필터'))
      fireEvent.click(screen.getByText('user1'))
      expect(mockSetSourceUserFilter).toHaveBeenCalledWith('user1')
    })

    it('calls setSourceUserFilter with null when "전체 사용자" is selected', () => {
      storeState.sourceUsers = ['user1', 'user2']
      storeState.sourceUserFilter = 'user1'
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자: user1'))
      fireEvent.click(screen.getByText('전체 사용자'))
      expect(mockSetSourceUserFilter).toHaveBeenCalledWith(null)
    })

    it('closes user menu after selecting a user', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자 필터'))
      expect(screen.getByText('user1')).toBeInTheDocument()
      fireEvent.click(screen.getByText('user1'))
      expect(screen.queryByText('user2')).not.toBeInTheDocument()
    })

    it('closes user menu on outside click', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자 필터'))
      expect(screen.getByText('user1')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByText('user1')).not.toBeInTheDocument()
    })

    it('shows active source user filter title when a user is selected', () => {
      storeState.sourceUsers = ['user1', 'user2']
      storeState.sourceUserFilter = 'user1'
      render(<SessionList />)
      expect(screen.getByTitle('사용자: user1')).toBeInTheDocument()
    })

    it('shows check icon next to selected user', () => {
      storeState.sourceUsers = ['user1', 'user2']
      storeState.sourceUserFilter = 'user1'
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자: user1'))
      const checkIcons = screen.getAllByTestId('icon-check')
      expect(checkIcons.length).toBeGreaterThan(0)
    })

    it('shows check icon next to "전체 사용자" when no user filter is active', () => {
      storeState.sourceUsers = ['user1', 'user2']
      storeState.sourceUserFilter = null
      render(<SessionList />)
      fireEvent.click(screen.getByTitle('사용자 필터'))
      const checkIcons = screen.getAllByTestId('icon-check')
      expect(checkIcons.length).toBeGreaterThan(0)
    })
  })

  // =============================================
  // Batch summary generation
  // =============================================
  describe('batch summary generation', () => {
    it('shows batch summary button when pending summaries exist', () => {
      storeState.pendingSummaryCount = 5
      render(<SessionList />)
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('hides batch summary button when batchJustCompleted', () => {
      storeState.pendingSummaryCount = 5
      storeState.batchJustCompleted = true
      render(<SessionList />)
      expect(screen.queryByTitle(/미요약 세션/)).not.toBeInTheDocument()
    })

    it('does not show batch summary button when pendingSummaryCount is 0', () => {
      storeState.pendingSummaryCount = 0
      render(<SessionList />)
      expect(screen.queryByTitle(/미요약 세션/)).not.toBeInTheDocument()
    })

    it('calls generateBatchSummaries when batch summary button is clicked', () => {
      storeState.pendingSummaryCount = 10
      render(<SessionList />)
      const batchBtn = screen.getByTitle('미요약 세션 10개 일괄 요약 생성')
      fireEvent.click(batchBtn)
      expect(mockGenerateBatchSummaries).toHaveBeenCalledWith(50)
    })

    it('shows loader icon and progress when batch is generating', () => {
      storeState.pendingSummaryCount = 10
      storeState.isBatchGenerating = true
      storeState.batchProgress = { processed: 3, total: 10 }
      render(<SessionList />)
      expect(screen.getByText('3/10')).toBeInTheDocument()
      expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
    })

    it('shows sparkles icon when batch is not generating', () => {
      storeState.pendingSummaryCount = 5
      storeState.isBatchGenerating = false
      render(<SessionList />)
      expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument()
    })

    it('disables batch summary button when generating', () => {
      storeState.pendingSummaryCount = 5
      storeState.isBatchGenerating = true
      storeState.batchProgress = { processed: 1, total: 5 }
      render(<SessionList />)
      const batchBtn = screen.getByTitle('요약 생성 중: 1/5')
      expect(batchBtn).toBeDisabled()
    })
  })

  // =============================================
  // Delete empty/ghost sessions
  // =============================================
  describe('delete empty/ghost sessions', () => {
    it('shows delete button when deletable sessions exist', () => {
      storeState.getEmptySessionsCount = vi.fn(() => 2)
      storeState.getGhostSessionsCount = vi.fn(() => 1)
      render(<SessionList />)
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('does not show delete button when no deletable sessions', () => {
      storeState.getEmptySessionsCount = vi.fn(() => 0)
      storeState.getGhostSessionsCount = vi.fn(() => 0)
      render(<SessionList />)
      expect(screen.queryByTitle(/삭제 가능/)).not.toBeInTheDocument()
    })

    it('shows correct delete button title', () => {
      storeState.getEmptySessionsCount = vi.fn(() => 3)
      storeState.getGhostSessionsCount = vi.fn(() => 2)
      render(<SessionList />)
      expect(screen.getByTitle('삭제 가능: 빈 3개 + 유령 2개')).toBeInTheDocument()
    })

    it('calls deleteEmptySessions and deleteGhostSessions on confirm', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 2)
      storeState.getGhostSessionsCount = vi.fn(() => 1)
      storeState.deleteEmptySessions = vi.fn().mockResolvedValue({ deletedCount: 2, deletedIds: ['a', 'b'] })
      storeState.deleteGhostSessions = vi.fn().mockResolvedValue({ deletedCount: 1, deletedIds: ['c'] })

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 2개 + 유령 1개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      expect(confirmSpy).toHaveBeenCalled()
      expect(storeState.deleteEmptySessions).toHaveBeenCalled()
      expect(storeState.deleteGhostSessions).toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith('총 3개의 세션이 삭제되었습니다.')

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('does NOT call delete when user cancels confirm dialog', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 1)
      storeState.getGhostSessionsCount = vi.fn(() => 0)

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 1개 + 유령 0개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      expect(confirmSpy).toHaveBeenCalled()
      expect(storeState.deleteEmptySessions).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it('deletes only empty sessions when no ghost sessions exist', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 2)
      storeState.getGhostSessionsCount = vi.fn(() => 0)
      storeState.deleteEmptySessions = vi.fn().mockResolvedValue({ deletedCount: 2, deletedIds: ['a', 'b'] })

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 2개 + 유령 0개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      expect(storeState.deleteEmptySessions).toHaveBeenCalled()
      expect(storeState.deleteGhostSessions).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith('총 2개의 세션이 삭제되었습니다.')

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('deletes only ghost sessions when no empty sessions exist', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 0)
      storeState.getGhostSessionsCount = vi.fn(() => 3)
      storeState.deleteGhostSessions = vi.fn().mockResolvedValue({ deletedCount: 3, deletedIds: ['a', 'b', 'c'] })

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 0개 + 유령 3개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      expect(storeState.deleteEmptySessions).not.toHaveBeenCalled()
      expect(storeState.deleteGhostSessions).toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith('총 3개의 세션이 삭제되었습니다.')

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('does not show alert when totalDeleted is 0', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 1)
      storeState.getGhostSessionsCount = vi.fn(() => 0)
      storeState.deleteEmptySessions = vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] })

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 1개 + 유령 0개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      expect(alertSpy).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('confirm message includes both empty and ghost session info', async () => {
      storeState.getEmptySessionsCount = vi.fn(() => 2)
      storeState.getGhostSessionsCount = vi.fn(() => 3)

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(<SessionList />)
      const deleteBtn = screen.getByTitle('삭제 가능: 빈 2개 + 유령 3개')

      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      const confirmMsg = confirmSpy.mock.calls[0][0] as string
      expect(confirmMsg).toContain('빈 세션 2개')
      expect(confirmMsg).toContain('유령 세션 3개')

      confirmSpy.mockRestore()
    })
  })

  // =============================================
  // Infinite scroll / Load more
  // =============================================
  describe('load more / infinite scroll', () => {
    it('shows "Load More" button with remaining count when hasMore and not loading', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = true
      storeState.isLoadingMore = false
      storeState.filteredCount = 10
      render(<SessionList />)
      expect(screen.getByText('Load More (9 remaining)')).toBeInTheDocument()
    })

    it('shows loading spinner when isLoadingMore is true', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = true
      storeState.isLoadingMore = true
      render(<SessionList />)
      expect(screen.getByText('Loading more...')).toBeInTheDocument()
      expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
    })

    it('calls loadMoreSessions when Load More button is clicked', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = true
      storeState.isLoadingMore = false
      storeState.filteredCount = 10
      render(<SessionList />)
      fireEvent.click(screen.getByText('Load More (9 remaining)'))
      expect(mockLoadMoreSessions).toHaveBeenCalledWith(undefined)
    })

    it('does not show load more area when hasMore is false', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = false
      render(<SessionList />)
      expect(screen.queryByText(/Load More/)).not.toBeInTheDocument()
      expect(screen.queryByText('Loading more...')).not.toBeInTheDocument()
    })

    it('shows end-of-list indicator when no more sessions to load', () => {
      const sessions = [createMockSession({ session_id: 's1', slug: 'session-one' })]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = false
      render(<SessionList />)
      expect(screen.getByText('1 sessions loaded')).toBeInTheDocument()
    })

    it('shows correct count in end-of-list indicator for multiple sessions', () => {
      const sessions = [
        createMockSession({ session_id: 's1', slug: 'one' }),
        createMockSession({ session_id: 's2', slug: 'two' }),
        createMockSession({ session_id: 's3', slug: 'three' }),
      ]
      storeState.sessions = sessions as never[]
      storeState.getFilteredSessions = vi.fn(() => sessions as never[])
      storeState.hasMore = false
      render(<SessionList />)
      expect(screen.getByText('3 sessions loaded')).toBeInTheDocument()
    })

    it('does not show end-of-list indicator when sessions list is empty', () => {
      storeState.sessions = []
      storeState.getFilteredSessions = vi.fn(() => [])
      storeState.hasMore = false
      render(<SessionList />)
      expect(screen.queryByText(/sessions loaded/)).not.toBeInTheDocument()
    })
  })

  // =============================================
  // Edge cases
  // =============================================
  describe('edge cases', () => {
    it('handles zero count values gracefully', () => {
      storeState.activeCount = 0
      storeState.sessions = []
      storeState.filteredCount = 0
      render(<SessionList />)
      expect(screen.getByText('0 active / 0 loaded / 0 total')).toBeInTheDocument()
    })

    it('renders with statusFilter prop', () => {
      render(<SessionList statusFilter="idle" />)
      expect(mockFetchSessions).toHaveBeenCalledWith('idle', true)
    })

    it('handles toggling sort menu open and closed', () => {
      render(<SessionList />)
      const sortBtn = screen.getByTitle(/정렬:/)

      // Open
      fireEvent.click(sortBtn)
      expect(screen.getByText('생성일')).toBeInTheDocument()

      // Close by clicking again
      fireEvent.click(sortBtn)
      expect(screen.queryByText('생성일')).not.toBeInTheDocument()
    })

    it('handles toggling project menu open and closed', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      render(<SessionList />)
      const projectBtn = screen.getByTitle('프로젝트 필터')

      // Open
      fireEvent.click(projectBtn)
      expect(screen.getByText('ProjectA')).toBeInTheDocument()

      // Close by clicking again
      fireEvent.click(projectBtn)
      expect(screen.queryByText('ProjectA')).not.toBeInTheDocument()
    })

    it('handles toggling user menu open and closed', () => {
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)
      const userBtn = screen.getByTitle('사용자 필터')

      // Open
      fireEvent.click(userBtn)
      expect(screen.getByText('user1')).toBeInTheDocument()

      // Close by clicking again
      fireEvent.click(userBtn)
      expect(screen.queryByText('user1')).not.toBeInTheDocument()
    })

    it('multiple dropdown menus do not interfere with each other', () => {
      storeState.getUniqueProjects = vi.fn(() => ['ProjectA'])
      storeState.sourceUsers = ['user1', 'user2']
      render(<SessionList />)

      // Open sort menu
      fireEvent.click(screen.getByTitle(/정렬:/))
      expect(screen.getByText('생성일')).toBeInTheDocument()

      // Open project menu (sort menu should close via outside click)
      fireEvent.mouseDown(screen.getByTitle('프로젝트 필터'))
      fireEvent.click(screen.getByTitle('프로젝트 필터'))
    })
  })
})
