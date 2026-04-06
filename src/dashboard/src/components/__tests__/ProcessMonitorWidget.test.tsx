import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

import { ProcessMonitorWidget } from '../ProcessMonitorWidget'

const mockProcessResponse = {
  processes: [
    {
      pid: 1234,
      version: '1.2.0',
      terminal: '/dev/ttys001',
      is_foreground: true,
      is_current: true,
      cpu_time: '0:05.23',
      memory_mb: 256,
    },
    {
      pid: 5678,
      version: '1.1.0',
      terminal: '/dev/ttys002',
      is_foreground: true,
      is_current: false,
      cpu_time: '0:02.10',
      memory_mb: 128,
    },
    {
      pid: 9999,
      version: '1.0.0',
      terminal: '/dev/ttys003',
      is_foreground: false,
      is_current: false,
      cpu_time: '0:00.50',
      memory_mb: 64,
    },
  ],
  total_count: 3,
  foreground_count: 2,
  background_count: 1,
}

describe('ProcessMonitorWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProcessResponse),
    } as Response)
  })

  it('renders the header', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })
    expect(screen.getByText('Claude Processes')).toBeInTheDocument()
  })

  it('renders refresh button', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })
    expect(screen.getByTitle('Refresh')).toBeInTheDocument()
  })

  it('fetches processes on mount', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/claude-sessions/processes')
    )
  })

  it('displays process stats after fetch', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('displays total memory usage', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Total Memory')).toBeInTheDocument()
    // 256 + 128 + 64 = 448 MB
    expect(screen.getByText('448 MB')).toBeInTheDocument()
  })

  it('displays memory in GB when > 1024 MB', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...mockProcessResponse,
        processes: [
          { pid: 1, version: '1.0', terminal: '', is_foreground: true, is_current: true, cpu_time: '0:01', memory_mb: 2048 },
        ],
      }),
    } as Response)

    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('2.0 GB')).toBeInTheDocument()
  })

  it('shows process list preview', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Recent processes')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
    expect(screen.getByText('v1.2.0')).toBeInTheDocument()
    expect(screen.getByText('0:05.23')).toBeInTheDocument()
    expect(screen.getByText('5678')).toBeInTheDocument()
    expect(screen.getByText('9999')).toBeInTheDocument()
  })

  it('shows cleanup button when stale processes exist', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Cleanup 1 Stale')).toBeInTheDocument()
  })

  it('does not show cleanup button when no stale processes', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...mockProcessResponse,
        background_count: 0,
      }),
    } as Response)

    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.queryByText(/Cleanup.*Stale/)).not.toBeInTheDocument()
  })

  it('shows Kill All button when more than 1 process exists', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Kill All (2)')).toBeInTheDocument()
  })

  it('calls cleanup endpoint when cleanup button is clicked', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Cleanup 1 Stale')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('Cleanup 1 Stale'))
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/claude-sessions/processes/cleanup-stale'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('handles fetch error gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    // Should not crash, still renders header
    expect(screen.getByText('Claude Processes')).toBeInTheDocument()
  })

  it('handles non-ok response gracefully', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response)

    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    expect(screen.getByText('Claude Processes')).toBeInTheDocument()
  })

  it('refreshes data when refresh button is clicked', async () => {
    await act(async () => {
      render(<ProcessMonitorWidget />)
    })

    const callCountAfterMount = vi.mocked(global.fetch).mock.calls.length

    await act(async () => {
      fireEvent.click(screen.getByTitle('Refresh'))
    })

    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(callCountAfterMount)
  })
})
