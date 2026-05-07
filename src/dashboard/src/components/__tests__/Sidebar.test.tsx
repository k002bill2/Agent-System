import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

// Helper to create selector-compatible mock (must be inline in vi.mock factories)
const selectorMock = (state: Record<string, unknown>) =>
  ((selector?: (s: Record<string, unknown>) => unknown) => selector ? selector(state) : state) as never

// Mock stores with selector support
vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { fetchProjects: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/navigation', () => ({
  useNavigationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { currentView: 'dashboard', setView: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { user: null, logout: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/menuVisibility', () => ({
  useMenuVisibilityStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { visibility: {}, menuOrder: [], isLoaded: true, fetchVisibility: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

import { useNavigationStore } from '@/stores/navigation'
import { useAuthStore } from '@/stores/auth'

describe('Sidebar', () => {
  const mockSetView = vi.fn()
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ currentView: 'dashboard', setView: mockSetView })
    )

    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({ user: null, logout: mockLogout })
    )
  })

  it('renders logo and branding', () => {
    render(<Sidebar />)

    expect(screen.getByText('AOS')).toBeInTheDocument()
    expect(screen.getByText('Orchestration Service')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    render(<Sidebar />)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Task Analyzer')).toBeInTheDocument()
    expect(screen.getByText('Monitor')).toBeInTheDocument()
    expect(screen.getByText('Claude Sessions')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('calls setView when navigation item clicked', () => {
    render(<Sidebar />)

    fireEvent.click(screen.getByText('Sessions'))
    expect(mockSetView).toHaveBeenCalledWith('sessions')
  })

  it('calls setView when Settings clicked', () => {
    render(<Sidebar />)

    fireEvent.click(screen.getByText('Settings'))
    expect(mockSetView).toHaveBeenCalledWith('settings')
  })

  it('shows logout button when no user', () => {
    render(<Sidebar />)

    expect(screen.getByText('로그아웃')).toBeInTheDocument()
  })

  it('handles logout when clicked', () => {
    render(<Sidebar />)

    fireEvent.click(screen.getByText('로그아웃'))
    expect(mockLogout).toHaveBeenCalled()
    expect(mockSetView).toHaveBeenCalledWith('login')
  })

  it('shows user avatar when user exists', () => {
    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({
        user: { name: 'Test User', email: 'test@example.com', avatar_url: null },
        logout: mockLogout,
      })
    )

    render(<Sidebar />)

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows first initial in avatar fallback', () => {
    vi.mocked(useAuthStore).mockImplementation(
      selectorMock({
        user: { name: 'John Doe', email: 'john@example.com', avatar_url: null },
        logout: mockLogout,
      })
    )

    render(<Sidebar />)

    expect(screen.getByText('J')).toBeInTheDocument()
  })

  it('highlights current view', () => {
    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({ currentView: 'sessions', setView: mockSetView })
    )

    render(<Sidebar />)

    const sessionsButton = screen.getByText('Sessions').closest('button')
    expect(sessionsButton).toHaveClass('bg-primary-50')
  })
})
