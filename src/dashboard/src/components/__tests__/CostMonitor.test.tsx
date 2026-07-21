import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CostMonitor, CostBadge } from '../CostMonitor'

// Mock fetch (CLI session analytics)
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock external usage store
const mockFetchExternalSummary = vi.fn()

vi.mock('../../stores/externalUsage', () => ({
  useExternalUsageStore: vi.fn(() => ({
    summary: null,
    fetchSummary: mockFetchExternalSummary,
  })),
}))

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

function mockClaudeUsageResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        weeklyTotalTokens: 0,
        weeklyModelTokens: [],
        weeklyModelTokensSource: 'empty',
        planLimits: [],
        oauthAvailable: false,
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
      expect(screen.getByText('No provider usage data yet')).toBeInTheDocument()
    })
  })

  it('displays 0 tokens and FREE when no usage', async () => {
    mockFetch.mockResolvedValue(mockCostResponse())

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
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
      expect(screen.getAllByText('1.5K').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders Claude Code usage as a separate source', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/usage')) {
        return Promise.resolve(mockClaudeUsageResponse({
          weeklyTotalTokens: 42000,
          weeklyModelTokensSource: 'jsonl-fallback',
          planLimits: [{ name: 'sevenDay', displayName: 'All models', utilization: 50 }],
          oauthAvailable: true,
        }))
      }
      return Promise.resolve(mockCostResponse({
        total_cost: 0,
        total_tokens: 1500,
        by_model: [
          { category: 'model', value: 'claude-opus-4-8', provider: 'codex_cli', cost: 0, tokens: 1500, percentage: 100 },
        ],
      }))
    })

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('AOS Runtime')).toBeInTheDocument()
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
      expect(screen.getByText('42.0K')).toBeInTheDocument()
      expect(screen.getByText('7d 50% · JSONL')).toBeInTheDocument()
    })
  })

  it('uses explicit provider metadata before model-name inference', async () => {
    mockFetch.mockResolvedValue(
      mockCostResponse({
        total_cost: 0,
        total_tokens: 1500,
        by_model: [
          {
            category: 'model',
            value: 'claude-opus-4-8',
            provider: 'codex_cli',
            cost: 0,
            tokens: 1500,
            percentage: 100,
          },
        ],
      }),
    )

    render(<CostMonitor />)

    await waitFor(() => {
      expect(screen.getByText('Codex CLI')).toBeInTheDocument()
      expect(screen.queryByText('Anthropic Claude')).not.toBeInTheDocument()
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
      expect(screen.getAllByText('1.0M').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows error when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ detail: 'Failed to fetch cost analytics' }),
    })

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
