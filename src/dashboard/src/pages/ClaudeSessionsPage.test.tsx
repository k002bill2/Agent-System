import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClaudeSessionsPage } from './ClaudeSessionsPage'

// Mock child components
vi.mock('../components/claude-sessions', () => ({
  SessionList: () => <div data-testid="session-list">SessionList</div>,
  SessionDetails: () => <div data-testid="session-details">SessionDetails</div>,
  ProcessCleanupPanel: () => <div data-testid="process-cleanup">ProcessCleanupPanel</div>,
}))

// Mock store
const mockStopStreaming = vi.fn()
const mockClearError = vi.fn()
let mockError: string | null = null

vi.mock('../stores/claudeSessions', () => ({
  useClaudeSessionsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      stopStreaming: mockStopStreaming,
      clearError: mockClearError,
      error: mockError,
    }),
}))

describe('ClaudeSessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockError = null
  })

  it('renders session list and session details by default', () => {
    render(<ClaudeSessionsPage />)
    expect(screen.getByTestId('session-list')).toBeInTheDocument()
    expect(screen.getByTestId('session-details')).toBeInTheDocument()
  })

  it('shows Session Details and Process Manager tabs', () => {
    render(<ClaudeSessionsPage />)
    expect(screen.getByText('Session Details')).toBeInTheDocument()
    expect(screen.getByText('Process Manager')).toBeInTheDocument()
  })

  it('switches to Process Manager tab when clicked', () => {
    render(<ClaudeSessionsPage />)
    fireEvent.click(screen.getByText('Process Manager'))
    expect(screen.getByTestId('process-cleanup')).toBeInTheDocument()
    expect(screen.queryByTestId('session-details')).not.toBeInTheDocument()
  })

  it('switches back to Session Details tab', () => {
    render(<ClaudeSessionsPage />)
    fireEvent.click(screen.getByText('Process Manager'))
    fireEvent.click(screen.getByText('Session Details'))
    expect(screen.getByTestId('session-details')).toBeInTheDocument()
    expect(screen.queryByTestId('process-cleanup')).not.toBeInTheDocument()
  })

  it('does not show error banner when no error', () => {
    render(<ClaudeSessionsPage />)
    expect(screen.queryByText('×')).not.toBeInTheDocument()
  })

  it('shows error banner when error exists', () => {
    mockError = 'Connection failed'
    render(<ClaudeSessionsPage />)
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('clears error when dismiss button clicked', () => {
    mockError = 'Some error'
    render(<ClaudeSessionsPage />)
    fireEvent.click(screen.getByText('×'))
    expect(mockClearError).toHaveBeenCalledTimes(1)
  })

  it('calls stopStreaming on unmount', () => {
    const { unmount } = render(<ClaudeSessionsPage />)
    unmount()
    expect(mockStopStreaming).toHaveBeenCalledTimes(1)
  })
})
