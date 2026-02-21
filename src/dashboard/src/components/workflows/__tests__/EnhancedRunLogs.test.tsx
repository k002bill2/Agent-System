import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnhancedRunLogs } from '../EnhancedRunLogs'
import type { WorkflowLog } from '../../../types/workflow'

const mockLogs: WorkflowLog[] = [
  { timestamp: '2024-01-01T10:00:00Z', level: 'info', message: 'Starting workflow' },
  { timestamp: '2024-01-01T10:00:01Z', level: 'job', message: 'build' },
  { timestamp: '2024-01-01T10:00:02Z', level: 'error', message: 'Build failed' },
  { timestamp: '2024-01-01T10:00:03Z', level: 'warning', message: 'Deprecation notice' },
]

// Mock scrollIntoView which is not available in jsdom
Element.prototype.scrollIntoView = vi.fn()

describe('EnhancedRunLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Logs heading', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    expect(screen.getByText('Logs')).toBeInTheDocument()
  })

  it('shows empty state when no logs', () => {
    render(<EnhancedRunLogs logs={[]} />)
    expect(screen.getByText('No logs yet...')).toBeInTheDocument()
  })

  it('renders log messages', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    expect(screen.getByText('Starting workflow')).toBeInTheDocument()
    expect(screen.getByText('Build failed')).toBeInTheDocument()
    expect(screen.getByText('Deprecation notice')).toBeInTheDocument()
  })

  it('shows error count badge when errors exist', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    expect(screen.getByText('1 error')).toBeInTheDocument()
  })

  it('shows Live indicator when streaming', () => {
    render(<EnhancedRunLogs logs={mockLogs} isStreaming />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('does not show Live indicator when not streaming', () => {
    render(<EnhancedRunLogs logs={mockLogs} isStreaming={false} />)
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  it('shows filter panel on filter button click', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    // Click the filter toggle button (first button in the header actions)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByPlaceholderText('Search logs...')).toBeInTheDocument()
  })

  it('renders level filter buttons when filter is open', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByText('all')).toBeInTheDocument()
    expect(screen.getByText('error')).toBeInTheDocument()
    expect(screen.getByText('warning')).toBeInTheDocument()
  })

  it('shows log level labels in brackets', () => {
    render(<EnhancedRunLogs logs={mockLogs} />)
    expect(screen.getByText('[info]')).toBeInTheDocument()
    expect(screen.getByText('[error]')).toBeInTheDocument()
  })

  it('shows plural errors badge when multiple errors', () => {
    const logsWithMultipleErrors: WorkflowLog[] = [
      { timestamp: '2024-01-01T10:00:00Z', level: 'error', message: 'Error 1' },
      { timestamp: '2024-01-01T10:00:01Z', level: 'error', message: 'Error 2' },
    ]
    render(<EnhancedRunLogs logs={logsWithMultipleErrors} />)
    expect(screen.getByText('2 errors')).toBeInTheDocument()
  })
})
