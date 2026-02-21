import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { AuthCallbackPage } from './AuthCallbackPage'
import { exchangeOAuthCode } from '../stores/auth'

// Mock stores
const mockSetTokens = vi.fn()
const mockSetUser = vi.fn()
const mockSetView = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    setTokens: mockSetTokens,
    setUser: mockSetUser,
  }),
  exchangeOAuthCode: vi.fn(),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: () => ({
    setView: mockSetView,
  }),
}))

// Save original location
const originalLocation = window.location

function setLocationSearch(params: string) {
  Object.defineProperty(window, 'location', {
    value: {
      ...originalLocation,
      search: params,
      origin: 'http://localhost:5173',
      href: `http://localhost:5173/${params}`,
    },
    writable: true,
    configurable: true,
  })
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState = vi.fn()
    setLocationSearch('')
  })

  afterEach(() => {
    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    setLocationSearch('?code=test-code')
    ;(exchangeOAuthCode as Mock).mockReturnValue(new Promise(() => {}))
    render(<AuthCallbackPage provider="google" />)

    expect(screen.getByText('로그인 중...')).toBeInTheDocument()
    expect(screen.getByText('Google 인증을 처리하고 있습니다')).toBeInTheDocument()
  })

  it('shows GitHub provider text for github provider', () => {
    setLocationSearch('?code=test-code')
    ;(exchangeOAuthCode as Mock).mockReturnValue(new Promise(() => {}))
    render(<AuthCallbackPage provider="github" />)

    expect(screen.getByText('GitHub 인증을 처리하고 있습니다')).toBeInTheDocument()
  })

  it('shows success state after successful OAuth exchange', async () => {
    setLocationSearch('?code=valid-code')
    ;(exchangeOAuthCode as Mock).mockResolvedValue({
      accessToken: 'token123',
      refreshToken: 'refresh123',
      expiresIn: 3600,
      user: { id: '1', name: 'Test User' },
    })

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(screen.getByText('로그인 성공!')).toBeInTheDocument()
    })

    expect(mockSetTokens).toHaveBeenCalledWith('token123', 'refresh123', 3600)
    expect(mockSetUser).toHaveBeenCalledWith({ id: '1', name: 'Test User' })
    expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/')
  })

  it('redirects to dashboard after success delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    setLocationSearch('?code=valid-code')
    ;(exchangeOAuthCode as Mock).mockResolvedValue({
      accessToken: 'token123',
      refreshToken: 'refresh123',
      expiresIn: 3600,
      user: { id: '1', name: 'Test User' },
    })

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(screen.getByText('로그인 성공!')).toBeInTheDocument()
    })

    vi.advanceTimersByTime(1500)
    expect(mockSetView).toHaveBeenCalledWith('dashboard')

    vi.useRealTimers()
  })

  it('shows error state on OAuth error param', async () => {
    setLocationSearch('?error=access_denied&error_description=User+denied+access')

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(screen.getByText('로그인 실패')).toBeInTheDocument()
      expect(screen.getByText('User denied access')).toBeInTheDocument()
    })
  })

  it('shows error state when exchangeOAuthCode fails', async () => {
    setLocationSearch('?code=bad-code')
    ;(exchangeOAuthCode as Mock).mockRejectedValue(new Error('Invalid code'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(screen.getByText('로그인 실패')).toBeInTheDocument()
      expect(screen.getByText('Invalid code')).toBeInTheDocument()
    })
  })

  it('redirects to dashboard when no code present', async () => {
    setLocationSearch('')

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(mockSetView).toHaveBeenCalledWith('dashboard')
    })
  })

  it('retry button navigates to login', async () => {
    setLocationSearch('?error=access_denied')

    render(<AuthCallbackPage provider="google" />)

    await waitFor(() => {
      expect(screen.getByText('로그인 실패')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('다시 시도'))

    expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/')
    expect(mockSetView).toHaveBeenCalledWith('login')
  })

  it('calls exchangeOAuthCode with correct redirect URI', async () => {
    setLocationSearch('?code=test-code')
    ;(exchangeOAuthCode as Mock).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
      user: {},
    })

    render(<AuthCallbackPage provider="github" />)

    await waitFor(() => {
      expect(exchangeOAuthCode).toHaveBeenCalledWith(
        'github',
        'test-code',
        'http://localhost:5173/auth/callback/github'
      )
    })
  })
})
