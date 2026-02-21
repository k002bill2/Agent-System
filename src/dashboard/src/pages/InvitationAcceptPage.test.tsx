import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InvitationAcceptPage } from './InvitationAcceptPage'

// Store mocks
const mockAcceptOrgInvitation = vi.fn()
const mockAcceptProjectInvitation = vi.fn()
const mockSetView = vi.fn()

let mockUser: { id: string; email: string; name?: string } | null = null
let mockAccessToken: string | null = null
let mockRefreshToken: string | null = null
let mockHasHydrated = true

vi.mock('../stores/organizations', () => ({
  useOrganizationsStore: () => ({
    acceptInvitation: mockAcceptOrgInvitation,
  }),
}))

vi.mock('../stores/projectAccess', () => ({
  useProjectAccessStore: () => ({
    acceptInvitation: mockAcceptProjectInvitation,
  }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: mockUser,
    accessToken: mockAccessToken,
    refreshToken: mockRefreshToken,
    _hasHydrated: mockHasHydrated,
  }),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: () => ({
    setView: mockSetView,
  }),
}))

// Mock window.location
const originalLocation = window.location

describe('InvitationAcceptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    mockAccessToken = null
    mockRefreshToken = null
    mockHasHydrated = true

    // Reset URL params
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '', href: 'http://localhost', pathname: '/' },
      writable: true,
    })
    window.history.replaceState = vi.fn()
    window.sessionStorage.setItem = vi.fn()
  })

  it('shows login required when not logged in', () => {
    render(<InvitationAcceptPage />)
    expect(screen.getByText('Login Required')).toBeInTheDocument()
    expect(screen.getByText('Log In')).toBeInTheDocument()
  })

  it('navigates to login when Log In clicked', () => {
    render(<InvitationAcceptPage />)
    fireEvent.click(screen.getByText('Log In'))
    expect(mockSetView).toHaveBeenCalledWith('login')
  })

  it('shows error when token is missing', () => {
    mockAccessToken = 'token'
    mockUser = { id: '1', email: 'test@test.com' }
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '' },
      writable: true,
    })

    render(<InvitationAcceptPage />)
    expect(screen.getByText('Invitation Error')).toBeInTheDocument()
    expect(screen.getByText('Invalid invitation link. Token is missing.')).toBeInTheDocument()
  })

  it('shows success state after org invitation accepted', async () => {
    mockAccessToken = 'token'
    mockUser = { id: '1', email: 'test@test.com', name: 'Test' }
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '?token=abc123' },
      writable: true,
    })
    mockAcceptOrgInvitation.mockResolvedValue({
      success: true,
      member: { id: '1', name: 'Test' },
    })

    render(<InvitationAcceptPage />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to the Team!')).toBeInTheDocument()
    })
  })

  it('shows error state when org invitation fails', async () => {
    mockAccessToken = 'token'
    mockUser = { id: '1', email: 'test@test.com', name: 'Test' }
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '?token=abc123' },
      writable: true,
    })
    mockAcceptOrgInvitation.mockResolvedValue({
      success: false,
      error: 'Invitation expired',
    })

    render(<InvitationAcceptPage />)

    await waitFor(() => {
      expect(screen.getByText('Invitation Error')).toBeInTheDocument()
      expect(screen.getByText('Invitation expired')).toBeInTheDocument()
    })
  })

  it('navigates to dashboard on error state button click', async () => {
    mockAccessToken = 'token'
    mockUser = { id: '1', email: 'test@test.com' }
    // No token in URL
    render(<InvitationAcceptPage />)

    fireEvent.click(screen.getByText('Go to Dashboard'))
    expect(mockSetView).toHaveBeenCalledWith('dashboard')
  })

  it('renders footer text', () => {
    render(<InvitationAcceptPage />)
    expect(screen.getByText('Agent Orchestration Service')).toBeInTheDocument()
  })
})
