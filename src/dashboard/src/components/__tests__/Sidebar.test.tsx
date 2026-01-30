import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

// Mock stores
vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => ({
    fetchProjects: vi.fn(),
  })),
}))

vi.mock('@/stores/navigation', () => ({
  useNavigationStore: vi.fn(() => ({
    currentView: 'dashboard',
    setView: vi.fn(),
  })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    logout: vi.fn(),
  })),
}))

import { useNavigationStore } from '@/stores/navigation'
import { useAuthStore } from '@/stores/auth'

describe('Sidebar', () => {
  const mockSetView = vi.fn()
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useNavigationStore).mockReturnValue({
      currentView: 'dashboard',
      setView: mockSetView,
    } as unknown as ReturnType<typeof useNavigationStore>)

    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      logout: mockLogout,
    } as unknown as ReturnType<typeof useAuthStore>)
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
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Monitor')).toBeInTheDocument()
    expect(screen.getByText('Claude Sessions')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('calls setView when navigation item clicked', () => {
    render(<Sidebar />)

    fireEvent.click(screen.getByText('Tasks'))
    expect(mockSetView).toHaveBeenCalledWith('tasks')
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
    vi.mocked(useAuthStore).mockReturnValue({
      user: { name: 'Test User', email: 'test@example.com', avatar_url: null },
      logout: mockLogout,
    } as unknown as ReturnType<typeof useAuthStore>)

    render(<Sidebar />)

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows first initial in avatar fallback', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { name: 'John Doe', email: 'john@example.com', avatar_url: null },
      logout: mockLogout,
    } as unknown as ReturnType<typeof useAuthStore>)

    render(<Sidebar />)

    expect(screen.getByText('J')).toBeInTheDocument()
  })

  it('highlights current view', () => {
    vi.mocked(useNavigationStore).mockReturnValue({
      currentView: 'tasks',
      setView: mockSetView,
    } as unknown as ReturnType<typeof useNavigationStore>)

    render(<Sidebar />)

    const tasksButton = screen.getByText('Tasks').closest('button')
    expect(tasksButton).toHaveClass('bg-primary-50')
  })
})
