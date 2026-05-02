import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock stores
vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'admin', is_admin: true },
  })),
}))

// Mock admin sub-components
vi.mock('../components/admin', () => ({
  UserManagementTab: ({ currentUserId }: { currentUserId: string }) => (
    <div data-testid="user-management-tab">UserManagementTab (userId: {currentUserId})</div>
  ),
  MenuSettingsTab: () => <div data-testid="menu-settings-tab">MenuSettingsTab</div>,
  SystemInfoTab: () => <div data-testid="system-info-tab">SystemInfoTab</div>,
  ExternalSourcesTab: () => (
    <div data-testid="external-sources-tab">ExternalSourcesTab</div>
  ),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Users: ({ className }: { className?: string }) => <span data-testid="icon-users" className={className} />,
  ShieldOff: ({ className }: { className?: string }) => <span data-testid="icon-shield-off" className={className} />,
  Server: ({ className }: { className?: string }) => <span data-testid="icon-server" className={className} />,
  Menu: ({ className }: { className?: string }) => <span data-testid="icon-menu" className={className} />,
  FolderTree: ({ className }: { className?: string }) => <span data-testid="icon-folder-tree" className={className} />,
}))

import { AdminPage } from './AdminPage'
import { useAuthStore } from '../stores/auth'

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the admin page with tabs when user is admin', () => {
    render(<AdminPage />)

    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Menu Settings')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('External Sources')).toBeInTheDocument()
  })

  it('switches to External Sources tab when clicked', () => {
    render(<AdminPage />)

    fireEvent.click(screen.getByText('External Sources'))

    expect(screen.queryByTestId('user-management-tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('external-sources-tab')).toBeInTheDocument()
  })

  it('shows UserManagementTab by default', () => {
    render(<AdminPage />)

    expect(screen.getByTestId('user-management-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('menu-settings-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('system-info-tab')).not.toBeInTheDocument()
  })

  it('switches to Menu Settings tab when clicked', () => {
    render(<AdminPage />)

    fireEvent.click(screen.getByText('Menu Settings'))

    expect(screen.queryByTestId('user-management-tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('menu-settings-tab')).toBeInTheDocument()
  })

  it('switches to System tab when clicked', () => {
    render(<AdminPage />)

    fireEvent.click(screen.getByText('System'))

    expect(screen.queryByTestId('user-management-tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('system-info-tab')).toBeInTheDocument()
  })

  it('shows access denied when user is not admin', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u2', email: 'user@test.com', name: 'User', role: 'user', is_admin: false },
    } as ReturnType<typeof useAuthStore>)

    render(<AdminPage />)

    expect(screen.getByText('접근 권한 없음')).toBeInTheDocument()
    expect(screen.getByText('최고관리자 권한이 필요합니다.')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
  })

  it('shows access denied when user is null', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuthStore>)

    render(<AdminPage />)

    expect(screen.getByText('접근 권한 없음')).toBeInTheDocument()
  })

  it('passes currentUserId to UserManagementTab', () => {
    // Restore admin user explicitly
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'admin', is_admin: true },
    } as ReturnType<typeof useAuthStore>)

    render(<AdminPage />)

    expect(screen.getByText(/userId: u1/)).toBeInTheDocument()
  })
})
