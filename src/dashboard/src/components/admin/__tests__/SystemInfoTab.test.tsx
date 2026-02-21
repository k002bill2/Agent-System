import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SystemInfoTab } from '../SystemInfoTab'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  UserCheck: (props: Record<string, unknown>) => <span data-testid="icon-usercheck" {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-shieldcheck" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <span data-testid="icon-trending" {...props} />,
}))

const mockFetchSystemInfo = vi.fn()

vi.mock('../api', () => ({
  fetchSystemInfo: (...args: unknown[]) => mockFetchSystemInfo(...args),
}))

const mockSystemInfo = {
  version: '2.1.0',
  user_count: 42,
  active_user_count: 35,
  admin_count: 3,
  role_distribution: {
    user: 32,
    manager: 7,
    admin: 3,
  },
  recent_signups: [
    { id: 's1', name: 'New User', email: 'new@test.com', created_at: '2024-01-15T00:00:00Z' },
  ],
  recent_logins: [
    { id: 'l1', name: 'Active User', email: 'active@test.com', last_login_at: '2024-01-16T00:00:00Z' },
  ],
}

describe('SystemInfoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockFetchSystemInfo.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SystemInfoTab />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders system info after loading', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    expect(screen.getByText('Version')).toBeInTheDocument()
    expect(screen.getByText('2.1.0')).toBeInTheDocument()
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Active Users')).toBeInTheDocument()
    expect(screen.getByText('35')).toBeInTheDocument()
    expect(screen.getByText('Admins')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders error state on failure', async () => {
    mockFetchSystemInfo.mockRejectedValue(new Error('Network failure'))
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument()
    })
  })

  it('renders role distribution section', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    // Korean labels from types.ts
    expect(screen.getByText('\uC77C\uBC18')).toBeInTheDocument() // 일반
    expect(screen.getByText('\uAD00\uB9AC\uC790')).toBeInTheDocument() // 관리자
    expect(screen.getByText('\uCD5C\uACE0\uAD00\uB9AC\uC790')).toBeInTheDocument() // 최고관리자
  })

  it('renders role distribution percentages', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    // user: 32/42 = 76%, manager: 7/42 = 17%, admin: 3/42 = 7%
    expect(screen.getByText('32 (76%)')).toBeInTheDocument()
    expect(screen.getByText('7 (17%)')).toBeInTheDocument()
    expect(screen.getByText('3 (7%)')).toBeInTheDocument()
  })

  it('renders recent signups', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    expect(screen.getByText('\uCD5C\uADFC \uAC00\uC785\uC790')).toBeInTheDocument() // 최근 가입자
    expect(screen.getByText('New User')).toBeInTheDocument()
  })

  it('renders recent logins', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    expect(screen.getByText('\uCD5C\uADFC \uB85C\uADF8\uC778')).toBeInTheDocument() // 최근 로그인
    expect(screen.getByText('Active User')).toBeInTheDocument()
  })

  it('calls load again on refresh button click', async () => {
    mockFetchSystemInfo.mockResolvedValue(mockSystemInfo)
    render(<SystemInfoTab />)

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument()
    })

    expect(mockFetchSystemInfo).toHaveBeenCalledTimes(1)

    const refreshBtn = screen.getByTestId('icon-refresh').closest('button')!
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockFetchSystemInfo).toHaveBeenCalledTimes(2)
    })
  })
})
