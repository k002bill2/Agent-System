import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CostMonitor, CostBadge } from '../CostMonitor'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

function mockCostResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        total_cost: 0,
        total_tokens: 0,
        avg_cost_per_task: 0,
        by_agent: [],
        by_model: [],
        projected_monthly: 0,
        ...overrides,
      }),
  }
}

describe('CostMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with no data', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('LLM Provider Usage')).toBeInTheDocument()
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('Total Cost')).toBeInTheDocument()
      expect(screen.getByText('No provider usage data yet')).toBeInTheDocument()
    })
  })

  it('displays 0 tokens and FREE when no usage', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('FREE')).toBeInTheDocument()
    })
  })

  it('renders provider cards when data exists', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
      // 1.5K appears in both Total and Provider card
      expect(screen.getAllByText('1.5K')).toHaveLength(2)
    })
  })

  it('formats large token counts correctly', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 1.5,
        total_tokens: 1000000,
        by_model: [
          { category: 'model', value: 'gemini-2.0-flash', cost: 1.5, tokens: 1000000, percentage: 100 },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      // 1.0M appears in both Total and Provider card
      expect(screen.getAllByText('1.0M')).toHaveLength(2)
    })
  })

  it('shows error when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch cost analytics')).toBeInTheDocument()
    })
  })
})

describe('CostBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no tokens used', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    const { container } = render(<CostBadge />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('shows token count and cost when data exists', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0.015,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-sonnet-4-6', cost: 0.015, tokens: 1500, percentage: 100 },
        ],
      }),
    )

    render(<CostBadge />)

    await waitFor(() => {
      expect(screen.getByText(/1.5K tokens/)).toBeInTheDocument()
      expect(screen.getByText('$0.01')).toBeInTheDocument()
    })
  })
})
