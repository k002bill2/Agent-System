import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lib/utils
vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  formatTime: (date: string | Date) => {
    const d = new Date(date)
    return d.toLocaleTimeString()
  },
}))

// Mock orchestration store
const mockState = {
  messages: [] as Array<{ id: string; type: string; content: string; timestamp: string }>,
  activeAgentId: null as string | null,
  agents: {} as Record<string, { name: string }>,
}

vi.mock('../../stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => mockState),
}))

import { AgentPanel } from '../AgentPanel'

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.messages = []
    mockState.activeAgentId = null
    mockState.agents = {}
  })

  it('renders the header', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Agent Activity')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<AgentPanel />)
    expect(screen.getByText('No Activity Yet')).toBeInTheDocument()
    expect(
      screen.getByText('Start a conversation below to see agent activity and thought processes')
    ).toBeInTheDocument()
  })

  it('shows active agents count as 0', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Active Agents:')).toBeInTheDocument()
    const allZeros = screen.getAllByText('0')
    expect(allZeros.length).toBe(2) // agents count + messages count
  })

  it('shows messages count as 0', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Messages:')).toBeInTheDocument()
  })

  it('renders messages when present', () => {
    mockState.messages = [
      { id: '1', type: 'user', content: 'Hello agent', timestamp: '2025-01-01T10:00:00Z' },
      { id: '2', type: 'system', content: 'System reply', timestamp: '2025-01-01T10:00:01Z' },
    ]

    render(<AgentPanel />)

    expect(screen.getByText('Hello agent')).toBeInTheDocument()
    expect(screen.getByText('System reply')).toBeInTheDocument()
    // Should NOT show empty state
    expect(screen.queryByText('No Activity Yet')).not.toBeInTheDocument()
  })

  it('renders message type labels', () => {
    mockState.messages = [
      { id: '1', type: 'user', content: 'User message', timestamp: '2025-01-01T10:00:00Z' },
      { id: '2', type: 'thinking', content: 'Thinking...', timestamp: '2025-01-01T10:00:01Z' },
      { id: '3', type: 'action', content: 'Action taken', timestamp: '2025-01-01T10:00:02Z' },
      { id: '4', type: 'error', content: 'An error', timestamp: '2025-01-01T10:00:03Z' },
    ]

    render(<AgentPanel />)

    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('thinking')).toBeInTheDocument()
    expect(screen.getByText('action')).toBeInTheDocument()
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('shows active agent name when agent is active', () => {
    mockState.activeAgentId = 'agent-1'
    mockState.agents = { 'agent-1': { name: 'Research Agent' } }

    render(<AgentPanel />)

    expect(screen.getByText('Research Agent')).toBeInTheDocument()
  })

  it('shows agent ID when active agent has no name', () => {
    mockState.activeAgentId = 'agent-2'
    mockState.agents = { 'agent-2': { name: '' } }

    render(<AgentPanel />)

    expect(screen.getByText('agent-2')).toBeInTheDocument()
  })

  it('does not show active agent section when no agent is active', () => {
    mockState.activeAgentId = null
    mockState.agents = { 'agent-1': { name: 'Some Agent' } }

    render(<AgentPanel />)

    expect(screen.queryByText('Some Agent')).not.toBeInTheDocument()
  })

  it('displays correct agent count in status bar', () => {
    mockState.agents = {
      'agent-1': { name: 'Agent 1' },
      'agent-2': { name: 'Agent 2' },
      'agent-3': { name: 'Agent 3' },
    }

    render(<AgentPanel />)

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('displays correct message count in status bar', () => {
    mockState.messages = [
      { id: '1', type: 'user', content: 'msg1', timestamp: '2025-01-01T10:00:00Z' },
      { id: '2', type: 'system', content: 'msg2', timestamp: '2025-01-01T10:00:01Z' },
    ]

    render(<AgentPanel />)

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('handles unknown message types gracefully (falls back to system config)', () => {
    mockState.messages = [
      { id: '1', type: 'unknown_type', content: 'Unknown type msg', timestamp: '2025-01-01T10:00:00Z' },
    ]

    render(<AgentPanel />)

    expect(screen.getByText('Unknown type msg')).toBeInTheDocument()
    expect(screen.getByText('unknown_type')).toBeInTheDocument()
  })
})
