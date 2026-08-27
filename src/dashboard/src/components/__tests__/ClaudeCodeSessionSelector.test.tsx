/**
 * The selector polls `refreshSessions('active')` every 5 seconds. On a
 * `role="user"` account every one of those returns 403, and the component used
 * to render "No active Claude Code sessions" — indistinguishable from an idle
 * machine (issue #329).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('lucide-react', () => ({
  Terminal: (props: Record<string, unknown>) => <span data-testid="icon-terminal" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-message" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
}))

const defaultStoreState = {
  sessions: [] as unknown[],
  permissionDenied: false,
  isLoading: false,
  fetchSessions: vi.fn(),
  refreshSessions: vi.fn(),
}

let storeState = { ...defaultStoreState }

vi.mock('../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => storeState),
}))

import { ClaudeCodeSessionSelector } from '../ClaudeCodeSessionSelector'

beforeEach(() => {
  vi.clearAllMocks()
  storeState = { ...defaultStoreState, fetchSessions: vi.fn(), refreshSessions: vi.fn() }
})

describe('ClaudeCodeSessionSelector — permission denial', () => {
  it('renders the permission notice instead of an empty session list', () => {
    storeState.permissionDenied = true

    render(<ClaudeCodeSessionSelector selectedSessionId={null} onSelect={vi.fn()} />)

    expect(screen.getByText('세션 조회 권한이 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('No active Claude Code sessions')).not.toBeInTheDocument()
  })

  it('keeps the empty state when nothing is denied', () => {
    render(<ClaudeCodeSessionSelector selectedSessionId={null} onSelect={vi.fn()} />)

    expect(screen.getByText('No active Claude Code sessions')).toBeInTheDocument()
    expect(screen.queryByText('세션 조회 권한이 없습니다')).not.toBeInTheDocument()
  })
})
