import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VersionHistory } from '../VersionHistory'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    History: icon('history'),
    GitBranch: icon('git-branch'),
    RotateCcw: icon('rotate'),
    Eye: icon('eye'),
    ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'),
    ArrowLeftRight: icon('compare'),
    Clock: icon('clock'),
    User: icon('user'),
    Tag: icon('tag'),
    Check: icon('check'),
    Archive: icon('archive'),
    FileText: icon('file-text'),
    Loader2: icon('loader'),
    AlertCircle: icon('alert'),
  }
})

const makeVersion = (overrides?: Record<string, unknown>) => ({
  id: 'v-1',
  config_type: 'agent',
  config_id: 'cfg-1',
  version: 1,
  label: null,
  description: 'Initial version',
  status: 'active',
  data: { key: 'value' },
  changes_summary: 'Created',
  diff_from_previous: null,
  created_by: 'admin',
  created_at: '2025-01-01T00:00:00Z',
  rolled_back_from: null,
  rolled_back_at: null,
  ...overrides,
})

const mockHistoryResponse = (overrides?: Record<string, unknown>) => ({
  config_type: 'agent',
  config_id: 'cfg-1',
  versions: [makeVersion()],
  current_version: 1,
  total_versions: 1,
  ...overrides,
})

describe('VersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))
    render(<VersionHistory configType="agent" configId="cfg-1" />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Fail'))
    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load version history')).toBeInTheDocument()
    })
  })

  it('shows empty state when no versions', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse({ versions: [], total_versions: 0 }),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('No version history available')).toBeInTheDocument()
    })
  })

  it('renders version list with version number', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse(),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument()
    })
  })

  it('renders header with total versions and current version', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse(),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('Version History')).toBeInTheDocument()
      expect(screen.getByText('(1 versions)')).toBeInTheDocument()
      expect(screen.getByText('Current: v1')).toBeInTheDocument()
    })
  })

  it('shows status badge for version', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse(),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument()
    })
  })

  it('shows label when version has one', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse({
        versions: [makeVersion({ label: 'release-1.0' })],
      }),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('release-1.0')).toBeInTheDocument()
    })
  })

  it('expands version details on click', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse(),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('v1'))
    await waitFor(() => {
      expect(screen.getByText('Initial version')).toBeInTheDocument()
      expect(screen.getByText('View Data')).toBeInTheDocument()
    })
  })

  it('shows rollback button for non-active versions', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse({
        versions: [makeVersion({ status: 'archived', id: 'v-archived' })],
      }),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('v1'))
    await waitFor(() => {
      expect(screen.getByText('Rollback')).toBeInTheDocument()
    })
  })

  it('does not show rollback button for active version', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse(),
    } as Response)

    render(<VersionHistory configType="agent" configId="cfg-1" />)
    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('v1'))
    await waitFor(() => {
      expect(screen.getByText('View Data')).toBeInTheDocument()
      expect(screen.queryByText('Rollback')).not.toBeInTheDocument()
    })
  })
})
