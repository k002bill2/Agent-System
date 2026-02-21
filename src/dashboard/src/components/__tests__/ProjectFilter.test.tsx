import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ProjectFilter, ProjectBadge } from '../ProjectFilter'

// Selector-compatible mock helper
const selectorMock = (state: Record<string, unknown>) =>
  ((selector?: (s: Record<string, unknown>) => unknown) => selector ? selector(state) : state) as never

// ── Mock stores ──

vi.mock('@/stores/navigation', () => ({
  useNavigationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { projectFilter: null, setProjectFilter: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { projects: [], fetchProjects: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { user: null }
    return selector ? selector(state) : state
  }),
}))

import { useNavigationStore } from '@/stores/navigation'
import { useOrchestrationStore } from '@/stores/orchestration'
import { useAuthStore } from '@/stores/auth'

describe('ProjectFilter', () => {
  const mockSetProjectFilter = vi.fn()
  const mockFetchProjects = vi.fn()

  const sampleProjects = [
    { id: 'p1', name: 'Alpha', path: '/alpha', description: '', has_claude_md: false, is_active: true },
    { id: 'p2', name: 'Beta', path: '/beta', description: '', has_claude_md: true, is_active: true },
    { id: 'p3', name: 'Inactive', path: '/inactive', description: '', has_claude_md: false, is_active: false },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: null, setProjectFilter: mockSetProjectFilter })
    )

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({ projects: sampleProjects, fetchProjects: mockFetchProjects })
    )

    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({ user: { is_admin: false } })
    )
  })

  // ── 1. Basic rendering ──

  it('renders select element with "All Projects" default', () => {
    render(<ProjectFilter />)

    expect(screen.getByText('All Projects')).toBeInTheDocument()
  })

  it('renders active projects for non-admin users', () => {
    render(<ProjectFilter />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    // Inactive projects hidden for non-admin
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })

  it('renders all projects including inactive for admin users', () => {
    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({ user: { is_admin: true } })
    )

    render(<ProjectFilter />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  // ── 2. Selection ──

  it('calls setProjectFilter when a project is selected', () => {
    render(<ProjectFilter />)

    const select = screen.getByDisplayValue('All Projects') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'p1' } })

    expect(mockSetProjectFilter).toHaveBeenCalledWith('p1')
  })

  it('calls setProjectFilter(null) when "All Projects" is selected', () => {
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: 'p1', setProjectFilter: mockSetProjectFilter })
    )

    render(<ProjectFilter />)

    const select = screen.getByDisplayValue('Alpha') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'all' } })

    expect(mockSetProjectFilter).toHaveBeenCalledWith(null)
  })

  // ── 3. Shows count badge when a project is selected ──

  it('shows project count when a project is filtered', () => {
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: 'p1', setProjectFilter: mockSetProjectFilter })
    )

    render(<ProjectFilter />)

    // 2 active projects for non-admin
    expect(screen.getByText('(2 projects)')).toBeInTheDocument()
  })

  it('does not show count when no project filter', () => {
    render(<ProjectFilter />)

    expect(screen.queryByText(/project/i, { selector: 'span' })).not.toBeInTheDocument()
  })

  // ── 4. Fetches projects if empty ──

  it('calls fetchProjects when projects list is empty', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({ projects: [], fetchProjects: mockFetchProjects })
    )

    render(<ProjectFilter />)

    expect(mockFetchProjects).toHaveBeenCalled()
  })

  it('does not call fetchProjects when projects already loaded', () => {
    render(<ProjectFilter />)

    expect(mockFetchProjects).not.toHaveBeenCalled()
  })

  // ── 5. className prop ──

  it('applies custom className', () => {
    const { container } = render(<ProjectFilter className="custom-class" />)

    expect(container.firstChild).toHaveClass('custom-class')
  })

  // ── 6. Singular project count ──

  it('shows singular "project" for single project count', () => {
    // Admin with only 1 project total
    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({ user: { is_admin: false } })
    )
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        projects: [{ id: 'p1', name: 'Only', path: '/only', description: '', has_claude_md: false, is_active: true }],
        fetchProjects: mockFetchProjects,
      })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: 'p1', setProjectFilter: mockSetProjectFilter })
    )

    render(<ProjectFilter />)

    expect(screen.getByText('(1 project)')).toBeInTheDocument()
  })
})

describe('ProjectBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when projectId is null', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({ projects: [] })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: null })
    )

    const { container } = render(<ProjectBadge projectId={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when project not found', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({ projects: [] })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: null })
    )

    const { container } = render(<ProjectBadge projectId="unknown" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders project name when project exists', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        projects: [{ id: 'p1', name: 'My Project', path: '/p', description: '', has_claude_md: false }],
      })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: null })
    )

    render(<ProjectBadge projectId="p1" />)

    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('applies highlighted style when project matches filter', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        projects: [{ id: 'p1', name: 'My Project', path: '/p', description: '', has_claude_md: false }],
      })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: 'p1' })
    )

    render(<ProjectBadge projectId="p1" />)

    const badge = screen.getByText('My Project').closest('span')
    expect(badge).toHaveClass('bg-primary-100')
  })

  it('applies default style when project does not match filter', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        projects: [{ id: 'p1', name: 'My Project', path: '/p', description: '', has_claude_md: false }],
      })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: 'other' })
    )

    render(<ProjectBadge projectId="p1" />)

    const badge = screen.getByText('My Project').closest('span')
    expect(badge).toHaveClass('bg-gray-100')
  })

  it('applies custom className', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        projects: [{ id: 'p1', name: 'My Project', path: '/p', description: '', has_claude_md: false }],
      })
    )
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ projectFilter: null })
    )

    render(<ProjectBadge projectId="p1" className="extra-class" />)

    const badge = screen.getByText('My Project').closest('span')
    expect(badge).toHaveClass('extra-class')
  })
})
