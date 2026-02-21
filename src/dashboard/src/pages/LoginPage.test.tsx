import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginPage } from './LoginPage'

// Store mocks
const mockSetTokens = vi.fn()
const mockSetUser = vi.fn()
const mockSetView = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    setTokens: mockSetTokens,
    setUser: mockSetUser,
  }),
  getGoogleAuthUrl: () => 'https://google.com/auth',
  getGitHubAuthUrl: () => 'https://github.com/auth',
  loginWithEmail: vi.fn(),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: () => ({
    setView: mockSetView,
  }),
}))

// Mock fetch for auth status
const mockFetch = vi.fn()
global.fetch = mockFetch

import { loginWithEmail } from '../stores/auth'
const mockLogin = vi.mocked(loginWithEmail)

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        oauth_enabled: true,
        google_enabled: true,
        github_enabled: true,
        email_enabled: true,
      }),
    })
  })

  it('renders login form', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
  })

  it('renders AOS branding', () => {
    render(<LoginPage />)
    expect(screen.getByText('AOS')).toBeInTheDocument()
    expect(screen.getByText('Agent Orchestration Service')).toBeInTheDocument()
  })

  it('renders OAuth buttons', () => {
    render(<LoginPage />)
    expect(screen.getByText('Google로 계속하기')).toBeInTheDocument()
    expect(screen.getByText('GitHub로 계속하기')).toBeInTheDocument()
  })

  it('renders register link', () => {
    render(<LoginPage />)
    expect(screen.getByText('회원가입')).toBeInTheDocument()
  })

  it('navigates to register page', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('회원가입'))
    expect(mockSetView).toHaveBeenCalledWith('register')
  })

  it('calls loginWithEmail on form submit', async () => {
    mockLogin.mockResolvedValue({
      user: { id: '1', email: 'test@test.com' },
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password' } })
    fireEvent.submit(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'password')
    })
  })

  it('shows error on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('shows loading state during login', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}))

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(screen.getByText('로그인 중...')).toBeInTheDocument()
    })
  })

  it('navigates to dashboard after successful login', async () => {
    mockLogin.mockResolvedValue({
      user: { id: '1', email: 'test@test.com' },
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(mockSetView).toHaveBeenCalledWith('dashboard')
    })
  })
})
