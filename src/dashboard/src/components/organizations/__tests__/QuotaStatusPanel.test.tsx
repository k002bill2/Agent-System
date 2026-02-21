import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuotaStatusPanel } from '../QuotaStatusPanel'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  FolderKanban: (props: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  Coins: (props: Record<string, unknown>) => <span data-testid="icon-coins" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-xcircle" {...props} />,
}))

const mockFetchQuotaStatus = vi.fn()
const mockQuotaStatus = {
  organization_id: 'org-1',
  plan: 'starter',
  members: { allowed: true, current: 3, limit: 10, message: '' },
  projects: { allowed: true, current: 2, limit: 5, message: '' },
  sessions: { allowed: true, current: 10, limit: 100, message: '' },
  tokens: { allowed: true, current: 5000, limit: 50000, message: '' },
}

vi.mock('../../../stores/organizations', () => ({
  useOrganizationsStore: vi.fn(() => ({
    quotaStatus: mockQuotaStatus,
    fetchQuotaStatus: mockFetchQuotaStatus,
  })),
}))

describe('QuotaStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls fetchQuotaStatus on mount', () => {
    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(mockFetchQuotaStatus).toHaveBeenCalledWith('org-1')
  })

  it('renders quota labels', () => {
    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Sessions / Day')).toBeInTheDocument()
    expect(screen.getByText('Tokens / Month')).toBeInTheDocument()
  })

  it('renders Quota Usage heading', () => {
    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(screen.getByText('Quota Usage')).toBeInTheDocument()
  })

  it('renders plan badge', () => {
    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(screen.getByText('Starter Plan')).toBeInTheDocument()
  })

  it('shows check icons when quotas are allowed', () => {
    render(<QuotaStatusPanel organizationId="org-1" />)
    const checks = screen.getAllByTestId('icon-check')
    expect(checks.length).toBe(4)
  })

  it('renders loading skeletons when quotaStatus is null', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: null,
      fetchQuotaStatus: mockFetchQuotaStatus,
    })

    const { container } = render(<QuotaStatusPanel organizationId="org-1" />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBe(4)

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: mockQuotaStatus,
      fetchQuotaStatus: mockFetchQuotaStatus,
    })
  })

  it('shows xcircle icon and message when quota is exceeded', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: {
        ...mockQuotaStatus,
        members: { allowed: false, current: 10, limit: 10, message: 'Member limit reached' },
      },
      fetchQuotaStatus: mockFetchQuotaStatus,
    })

    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(screen.getByText('Member limit reached')).toBeInTheDocument()
    expect(screen.getByTestId('icon-xcircle')).toBeInTheDocument()

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: mockQuotaStatus,
      fetchQuotaStatus: mockFetchQuotaStatus,
    })
  })

  it('shows unlimited text for enterprise quotas with limit -1', async () => {
    const { useOrganizationsStore } = await import('../../../stores/organizations')
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: {
        ...mockQuotaStatus,
        plan: 'enterprise',
        members: { allowed: true, current: 5, limit: -1, message: '' },
      },
      fetchQuotaStatus: mockFetchQuotaStatus,
    })

    render(<QuotaStatusPanel organizationId="org-1" />)
    expect(screen.getByText('Unlimited (Enterprise)')).toBeInTheDocument()

    // Restore
    ;(useOrganizationsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      quotaStatus: mockQuotaStatus,
      fetchQuotaStatus: mockFetchQuotaStatus,
    })
  })
})
