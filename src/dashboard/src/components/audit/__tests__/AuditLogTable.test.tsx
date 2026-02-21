import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AuditLogEntry } from '../AuditLogTable'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-chevron-down" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="icon-chevron-right" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-xcircle" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  Download: (props: Record<string, unknown>) => <span data-testid="icon-download" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  Filter: (props: Record<string, unknown>) => <span data-testid="icon-filter" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockLogs: AuditLogEntry[] = [
  {
    id: 'log-1',
    session_id: 'sess-1',
    user_id: 'user-1',
    project_id: 'proj-1',
    action: 'task_created',
    resource_type: 'task',
    resource_id: 'task-abc12345',
    old_value: null,
    new_value: { name: 'New Task' },
    changes: null,
    agent_id: 'agent-1',
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    metadata: {},
    status: 'success',
    error_message: null,
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'log-2',
    session_id: null,
    user_id: 'user-2',
    project_id: null,
    action: 'login',
    resource_type: 'auth',
    resource_id: null,
    old_value: null,
    new_value: null,
    changes: null,
    agent_id: null,
    ip_address: null,
    user_agent: null,
    metadata: {},
    status: 'failed',
    error_message: 'Invalid credentials',
    created_at: '2026-01-15T09:00:00Z',
  },
]

function setupFetchMocks(logs: AuditLogEntry[] = mockLogs, total = 2) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/audit/actions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          actions: [{ value: 'task_created', label: 'Task Created' }],
        }),
      })
    }
    if (url.includes('/api/audit/resource-types')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          resource_types: [{ value: 'task', label: 'Task' }],
        }),
      })
    }
    if (url.includes('/api/audit')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          logs,
          total,
          limit: 20,
          offset: 0,
        }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

import { AuditLogTable } from '../AuditLogTable'

describe('AuditLogTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMocks()
  })

  it('renders header with "Audit Trail"', async () => {
    render(<AuditLogTable />)
    expect(screen.getByText('Audit Trail')).toBeInTheDocument()
  })

  it('fetches logs on mount', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/audit'))
    })
  })

  it('displays total count', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('(2 entries)')).toBeInTheDocument()
    })
  })

  it('renders table headers', async () => {
    render(<AuditLogTable />)
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('Resource')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders log entries', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('Task Created')).toBeInTheDocument()
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })

  it('renders resource type', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('task')).toBeInTheDocument()
      expect(screen.getByText('auth')).toBeInTheDocument()
    })
  })

  it('renders agent_id or dash', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument()
      expect(screen.getByText('-')).toBeInTheDocument()
    })
  })

  it('shows "No audit logs found" when empty', async () => {
    setupFetchMocks([], 0)
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('No audit logs found')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/audit?') || url === '/api/audit') {
        return Promise.resolve({
          ok: false,
          statusText: 'Server Error',
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ actions: [], resource_types: [] }),
      })
    })
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch audit logs')).toBeInTheDocument()
    })
  })

  it('expands row on click to show details', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('Task Created')).toBeInTheDocument()
    })

    // Click on the first row
    fireEvent.click(screen.getByText('Task Created').closest('tr')!)

    // Should show expanded details
    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument()
    })
  })

  it('shows session_id in expanded details', async () => {
    render(<AuditLogTable />)
    await waitFor(() => {
      expect(screen.getByText('Task Created')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Task Created').closest('tr')!)
    await waitFor(() => {
      expect(screen.getByText('sess-1')).toBeInTheDocument()
    })
  })

  it('shows filter panel when filter button clicked', async () => {
    render(<AuditLogTable />)
    const filterBtn = screen.getByTestId('icon-filter').closest('button')!
    fireEvent.click(filterBtn)
    expect(screen.getByText('All Actions')).toBeInTheDocument()
    expect(screen.getByText('All Resources')).toBeInTheDocument()
    expect(screen.getByText('All Status')).toBeInTheDocument()
  })

  it('shows clear filters button', async () => {
    render(<AuditLogTable />)
    const filterBtn = screen.getByTestId('icon-filter').closest('button')!
    fireEvent.click(filterBtn)
    expect(screen.getByText('Clear Filters')).toBeInTheDocument()
  })

  it('passes sessionId as query param when provided', async () => {
    render(<AuditLogTable sessionId="sess-test" />)
    await waitFor(() => {
      const auditCall = mockFetch.mock.calls.find(
        (c: string[]) => typeof c[0] === 'string' && c[0].includes('/api/audit?')
      )
      expect(auditCall?.[0]).toContain('session_id=sess-test')
    })
  })

  it('passes projectId as query param when provided', async () => {
    render(<AuditLogTable projectId="proj-test" />)
    await waitFor(() => {
      const auditCall = mockFetch.mock.calls.find(
        (c: string[]) => typeof c[0] === 'string' && c[0].includes('/api/audit?')
      )
      expect(auditCall?.[0]).toContain('project_id=proj-test')
    })
  })

  it('accepts className prop', () => {
    const { container } = render(<AuditLogTable className="custom-class" />)
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })
})
