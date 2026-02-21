import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ProcessCleanupPanel } from '../ProcessCleanupPanel'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockProcesses = [
  {
    pid: 1001,
    version: '2.1.0',
    terminal: 'ttys001',
    state: 'S',
    started: '10:00',
    cpu_time: '5:30',
    memory_mb: 150,
    is_foreground: true,
    is_current: true,
    command: 'claude --session',
  },
  {
    pid: 1002,
    version: '2.0.0',
    terminal: '??',
    state: 'S',
    started: '09:00',
    cpu_time: '120:45',
    memory_mb: 200,
    is_foreground: false,
    is_current: false,
    command: 'claude --bg',
  },
  {
    pid: 1003,
    version: 'unknown',
    terminal: 'ttys002',
    state: 'S',
    started: '08:00',
    cpu_time: '0:30',
    memory_mb: 80,
    is_foreground: true,
    is_current: false,
    command: 'claude --active',
  },
]

function mockProcessListResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({
      processes: mockProcesses,
      total_count: 3,
      foreground_count: 2,
      background_count: 1,
    }),
  }
}

function mockEmptyProcessList() {
  return {
    ok: true,
    json: () => Promise.resolve({
      processes: [],
      total_count: 0,
      foreground_count: 0,
      background_count: 0,
    }),
  }
}

describe('ProcessCleanupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(mockProcessListResponse())
  })

  it('renders header text', async () => {
    render(<ProcessCleanupPanel />)
    expect(screen.getByText('Claude Code Processes')).toBeInTheDocument()
  })

  it('fetches processes on mount', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/claude-sessions/processes')
      )
    })
  })

  it('displays process counts in subtitle', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText(/3 total \(2 active, 1 background\)/)).toBeInTheDocument()
    })
  })

  it('renders process items with PIDs', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('PID 1001')).toBeInTheDocument()
      expect(screen.getByText('PID 1002')).toBeInTheDocument()
      expect(screen.getByText('PID 1003')).toBeInTheDocument()
    })
  })

  it('shows "Current" badge for current process', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument()
    })
  })

  it('shows "Active" badge for non-current foreground processes', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })

  it('shows "Background" badge for background processes', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Background')).toBeInTheDocument()
    })
  })

  it('displays memory usage', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('150 MB')).toBeInTheDocument()
      expect(screen.getByText('200 MB')).toBeInTheDocument()
    })
  })

  it('formats CPU time in hours when >= 60 minutes', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('2h 0m CPU')).toBeInTheDocument()
    })
  })

  it('shows empty state when no processes found', async () => {
    mockFetch.mockResolvedValue(mockEmptyProcessList())
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('No Claude Code processes found')).toBeInTheDocument()
    })
  })

  it('shows error message when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
  })

  it('has Refresh button after loading completes', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })
  })

  it('shows Cleanup button with background count', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Cleanup 1 Stale')).toBeInTheDocument()
    })
  })

  it('shows "Select all background" link when background processes exist', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      expect(screen.getByText('Select all background')).toBeInTheDocument()
    })
  })

  it('shows checkboxes only for non-current, non-foreground processes', async () => {
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox')
      // Only PID 1002 is background+non-current, so 1 checkbox
      expect(checkboxes).toHaveLength(1)
    })
  })

  it('disables Cleanup button when no background processes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        processes: [mockProcesses[0]],
        total_count: 1,
        foreground_count: 1,
        background_count: 0,
      }),
    })
    render(<ProcessCleanupPanel />)
    await waitFor(() => {
      const cleanupBtn = screen.getByText('Cleanup 0 Stale')
      expect(cleanupBtn).toBeDisabled()
    })
  })
})
