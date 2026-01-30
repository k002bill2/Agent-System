import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CostMonitor, CostBadge } from '../CostMonitor'

// Mock the orchestration store
vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => ({
    providerUsage: {},
    totalCost: 0,
    tokenUsage: {},
  })),
  PROVIDER_CONFIG: {
    google: { displayName: 'Google Gemini', icon: '🔵' },
    anthropic: { displayName: 'Anthropic Claude', icon: '🟠' },
    ollama: { displayName: 'Ollama (Local)', icon: '🟢' },
    openai: { displayName: 'OpenAI GPT', icon: '🟣' },
    unknown: { displayName: 'Unknown', icon: '⚪' },
  },
}))

import { useOrchestrationStore } from '@/stores/orchestration'

describe('CostMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with no data', () => {
    render(<CostMonitor />)

    expect(screen.getByText('LLM Provider Usage')).toBeInTheDocument()
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('No provider usage data yet')).toBeInTheDocument()
  })

  it('displays 0 tokens and FREE when no usage', () => {
    render(<CostMonitor />)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('renders provider cards when data exists', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      providerUsage: {
        anthropic: {
          provider: 'anthropic',
          displayName: 'Anthropic Claude',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          costUsd: 0.015,
          callCount: 3,
        },
      },
      totalCost: 0.015,
      tokenUsage: {},
    } as ReturnType<typeof useOrchestrationStore>)

    render(<CostMonitor />)

    expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
    // 1.5K appears in both Total and Provider card
    expect(screen.getAllByText('1.5K')).toHaveLength(2)
    expect(screen.getByText('3 calls')).toBeInTheDocument()
  })

  it('formats large token counts correctly', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      providerUsage: {
        google: {
          provider: 'google',
          displayName: 'Google Gemini',
          inputTokens: 800000,
          outputTokens: 200000,
          totalTokens: 1000000,
          costUsd: 1.5,
          callCount: 100,
        },
      },
      totalCost: 1.5,
      tokenUsage: {},
    } as ReturnType<typeof useOrchestrationStore>)

    render(<CostMonitor />)

    // 1.0M appears in both Total and Provider card
    expect(screen.getAllByText('1.0M')).toHaveLength(2)
  })
})

describe('CostBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no tokens used', () => {
    const { container } = render(<CostBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('shows token count and cost when data exists', () => {
    vi.mocked(useOrchestrationStore).mockReturnValue({
      providerUsage: {
        anthropic: {
          provider: 'anthropic',
          displayName: 'Anthropic Claude',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          costUsd: 0.015,
          callCount: 3,
        },
      },
      totalCost: 0.015,
      tokenUsage: {
        agent1: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
      },
    } as ReturnType<typeof useOrchestrationStore>)

    render(<CostBadge />)

    expect(screen.getByText(/1.5K tokens/)).toBeInTheDocument()
    expect(screen.getByText('$0.0150')).toBeInTheDocument()
  })
})
