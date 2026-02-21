import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

// Mock lib/utils
vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// Mock the agents store (only type is imported, not the store itself)
vi.mock('../../stores/agents', () => ({
  __esModule: true,
}))

import { AgentStatsPanel } from '../AgentStatsPanel'
import type { AgentRegistryStats } from '../../stores/agents'

const createMockStats = (overrides?: Partial<AgentRegistryStats>): AgentRegistryStats => ({
  total_agents: 10,
  available_agents: 7,
  busy_agents: 3,
  by_category: {
    development: 4,
    orchestration: 3,
    quality: 2,
    research: 1,
  },
  total_tasks_completed: 1234,
  avg_success_rate: 0.856,
  ...overrides,
})

describe('AgentStatsPanel', () => {
  it('returns null when stats is null and not loading', () => {
    const { container } = render(<AgentStatsPanel stats={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows loading skeleton when isLoading is true', () => {
    const { container } = render(<AgentStatsPanel stats={null} isLoading />)
    const pulseDivs = container.querySelectorAll('.animate-pulse')
    expect(pulseDivs.length).toBeGreaterThan(0)
  })

  it('renders the title', () => {
    render(<AgentStatsPanel stats={createMockStats()} />)
    expect(screen.getByText('Agent Registry Stats')).toBeInTheDocument()
  })

  it('renders all stat cards', () => {
    render(<AgentStatsPanel stats={createMockStats()} />)

    expect(screen.getByText('Total Agents')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()

    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()

    expect(screen.getByText('Busy')).toBeInTheDocument()
    // 3 appears in both Busy stat and orchestration category count
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('Avg Success')).toBeInTheDocument()
    expect(screen.getByText('86%')).toBeInTheDocument()
  })

  it('renders category distribution', () => {
    render(<AgentStatsPanel stats={createMockStats()} />)

    expect(screen.getByText('Agents by Category')).toBeInTheDocument()
    expect(screen.getByText('development')).toBeInTheDocument()
    expect(screen.getByText('orchestration')).toBeInTheDocument()
    expect(screen.getByText('quality')).toBeInTheDocument()
    expect(screen.getByText('research')).toBeInTheDocument()
  })

  it('shows category counts', () => {
    render(<AgentStatsPanel stats={createMockStats()} />)

    expect(screen.getByText('4')).toBeInTheDocument()
    // 3 appears for both Busy stat and orchestration count
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows total tasks completed', () => {
    render(<AgentStatsPanel stats={createMockStats()} />)

    expect(screen.getByText('Total Tasks Completed')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders 0% success rate correctly', () => {
    render(<AgentStatsPanel stats={createMockStats({ avg_success_rate: 0 })} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('renders 100% success rate correctly', () => {
    render(<AgentStatsPanel stats={createMockStats({ avg_success_rate: 1.0 })} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('handles empty categories', () => {
    render(<AgentStatsPanel stats={createMockStats({ by_category: {} })} />)
    expect(screen.getByText('Agents by Category')).toBeInTheDocument()
    // Should still render without error, no category items
    expect(screen.queryByText('development')).not.toBeInTheDocument()
  })

  it('handles zero total agents for percentage calculation', () => {
    render(
      <AgentStatsPanel
        stats={createMockStats({
          total_agents: 0,
          by_category: { development: 0 },
        })}
      />
    )
    // Should not crash when total_agents is 0 (division by zero guard)
    expect(screen.getByText('development')).toBeInTheDocument()
  })

  it('handles unknown categories gracefully', () => {
    render(
      <AgentStatsPanel
        stats={createMockStats({
          by_category: { unknown_category: 5 },
        })}
      />
    )
    expect(screen.getByText('unknown_category')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
