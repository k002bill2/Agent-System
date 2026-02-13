import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SecretsManager } from '../SecretsManager'
import { useAuthStore } from '../../../stores/auth'

// Mock authFetch to intercept authenticated requests
vi.mock('../../../stores/auth', async () => {
  const actual = await vi.importActual('../../../stores/auth') as Record<string, unknown>
  return {
    ...actual,
    authFetch: vi.fn(),
  }
})

import { authFetch } from '../../../stores/auth'
const mockAuthFetch = authFetch as ReturnType<typeof vi.fn>

function setAdmin(isAdmin: boolean) {
  useAuthStore.setState({
    user: isAdmin
      ? { id: 'u1', email: 'admin@test.com', name: 'Admin', avatar_url: null, oauth_provider: 'email' as const, is_admin: true, role: 'admin' as const }
      : { id: 'u2', email: 'user@test.com', name: 'User', avatar_url: null, oauth_provider: 'email' as const, is_admin: false, role: 'user' as const },
  })
}

describe('SecretsManager', () => {
  beforeEach(() => {
    setAdmin(true)
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        secrets: [
          { id: 's1', name: 'API_KEY', scope: 'workflow', created_at: '2024-01-01', updated_at: '2024-01-01' },
          { id: 's2', name: 'DB_PASS', scope: 'project', created_at: '2024-01-02', updated_at: '2024-01-02' },
        ],
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal with title for admin', async () => {
    render(<SecretsManager />)
    expect(screen.getByText('Secrets')).toBeInTheDocument()
  })

  it('loads and displays secrets for admin', async () => {
    render(<SecretsManager />)
    await waitFor(() => {
      expect(screen.getByText('API_KEY')).toBeInTheDocument()
      expect(screen.getByText('DB_PASS')).toBeInTheDocument()
    })
  })

  it('shows masked values', async () => {
    render(<SecretsManager />)
    await waitFor(() => {
      expect(screen.getAllByText('••••••')).toHaveLength(2)
    })
  })

  it('toggles add form', async () => {
    render(<SecretsManager />)
    await waitFor(() => screen.getByText('API_KEY'))
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Secret name')).toBeInTheDocument()
    })
  })

  it('shows empty state when no secrets', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ secrets: [] }),
    })
    render(<SecretsManager />)
    await waitFor(() => {
      expect(screen.getByText('No secrets configured')).toBeInTheDocument()
    })
  })

  it('shows access restricted for non-admin users', async () => {
    setAdmin(false)
    render(<SecretsManager />)
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
    expect(screen.getByText('Only administrators can manage secrets.')).toBeInTheDocument()
  })

  it('does not fetch secrets for non-admin users', async () => {
    setAdmin(false)
    render(<SecretsManager />)
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('calls onClose from restricted view', async () => {
    setAdmin(false)
    const onClose = vi.fn()
    render(<SecretsManager onClose={onClose} />)
    const closeBtn = screen.getByText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
