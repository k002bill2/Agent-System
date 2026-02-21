import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterPage } from './RegisterPage'

// Store mocks
const mockSetTokens = vi.fn()
const mockSetUser = vi.fn()
const mockSetView = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    setTokens: mockSetTokens,
    setUser: mockSetUser,
  }),
  registerWithEmail: vi.fn(),
}))

vi.mock('../stores/navigation', () => ({
  useNavigationStore: () => ({
    setView: mockSetView,
  }),
}))

// Get reference to mocked registerWithEmail
import { registerWithEmail } from '../stores/auth'
const mockRegister = vi.mocked(registerWithEmail)

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders registration form', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument()
    expect(screen.getByLabelText(/이름/)).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호 확인')).toBeInTheDocument()
  })

  it('renders AOS branding', () => {
    render(<RegisterPage />)
    expect(screen.getByText('AOS')).toBeInTheDocument()
    expect(screen.getByText('Agent Orchestration Service')).toBeInTheDocument()
  })

  it('shows submit button', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'different' } })
    fireEvent.submit(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByText('비밀번호가 일치하지 않습니다')).toBeInTheDocument()
  })

  it('shows error when password too short', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '12345' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: '12345' } })
    fireEvent.submit(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByText('비밀번호는 6자 이상이어야 합니다')).toBeInTheDocument()
  })

  it('calls registerWithEmail on valid submission', async () => {
    mockRegister.mockResolvedValue({
      user: { id: '1', email: 'test@test.com', name: 'Test' },
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })

    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('test@test.com', 'password123', 'Test User')
    })
  })

  it('shows error on registration failure', async () => {
    mockRegister.mockRejectedValue(new Error('Email already exists'))

    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument()
    })
  })

  it('navigates to login page when link clicked', () => {
    render(<RegisterPage />)
    fireEvent.click(screen.getByText('로그인'))
    expect(mockSetView).toHaveBeenCalledWith('login')
  })

  it('shows loading state during submission', async () => {
    mockRegister.mockImplementation(() => new Promise(() => {})) // never resolves

    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(screen.getByText('가입 중...')).toBeInTheDocument()
    })
  })
})
