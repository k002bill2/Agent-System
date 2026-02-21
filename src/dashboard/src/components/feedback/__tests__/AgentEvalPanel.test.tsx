import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Star: (props: Record<string, unknown>) => <div data-testid="star" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <div data-testid="trending-up" {...props} />,
  TrendingDown: (props: Record<string, unknown>) => <div data-testid="trending-down" {...props} />,
  ThumbsUp: (props: Record<string, unknown>) => <div data-testid="thumbs-up" {...props} />,
  ThumbsDown: (props: Record<string, unknown>) => <div data-testid="thumbs-down" {...props} />,
  Users: (props: Record<string, unknown>) => <div data-testid="users" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <div data-testid="refresh" {...props} />,
  BarChart3: (props: Record<string, unknown>) => <div data-testid="bar-chart" {...props} />,
}))

import { AgentEvalPanel } from '../AgentEvalPanel'

const mockEvalStats = {
  avg_rating: 4.2,
  accuracy_rate: 0.85,
  speed_satisfaction_rate: 0.78,
  total_count: 50,
  by_agent: [
    { agent_id: 'agent-alpha', avg_rating: 4.5, accuracy_rate: 0.9, speed_satisfaction_rate: 0.85, total_count: 30 },
    { agent_id: 'agent-beta', avg_rating: 3.2, accuracy_rate: 0.6, speed_satisfaction_rate: 0.7, total_count: 20 },
  ],
}

describe('AgentEvalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockReset()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))

    const { container } = render(<AgentEvalPanel />)

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('shows retry button on error', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Failed'))

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('다시 시도')).toBeInTheDocument()
    })
  })

  it('shows empty state when no evaluations', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ avg_rating: 0, accuracy_rate: 0, speed_satisfaction_rate: 0, total_count: 0, by_agent: [] }),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('아직 평가 데이터가 없습니다.')).toBeInTheDocument()
    })
  })

  it('renders overall stats when data is available', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvalStats),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('총 평가')).toBeInTheDocument()
      expect(screen.getByText('평균 만족도')).toBeInTheDocument()
      expect(screen.getByText('4.2 / 5')).toBeInTheDocument()
      expect(screen.getByText('속도 만족도')).toBeInTheDocument()
      // Multiple instances of "정확도", "85%", etc. due to agent rows
      expect(screen.getAllByText('정확도').length).toBeGreaterThanOrEqual(1)
      // Check that the stat card values are rendered somewhere in the page
      const allText = document.body.textContent || ''
      expect(allText).toContain('50')
      expect(allText).toContain('85%')
      expect(allText).toContain('78%')
    })
  })

  it('renders agent breakdown list', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvalStats),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('에이전트별 평가')).toBeInTheDocument()
      expect(screen.getByText('agent-alpha')).toBeInTheDocument()
      expect(screen.getByText('agent-beta')).toBeInTheDocument()
    })
  })

  it('shows agent detail when agent row is clicked', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvalStats),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('agent-alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('agent-alpha'))

    expect(screen.getByText('agent-alpha 상세')).toBeInTheDocument()
    expect(screen.getByText('4.50')).toBeInTheDocument()
  })

  it('toggles agent detail off when same agent is clicked again', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvalStats),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('agent-alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('agent-alpha'))
    expect(screen.getByText('agent-alpha 상세')).toBeInTheDocument()

    fireEvent.click(screen.getByText('agent-alpha'))
    expect(screen.queryByText('agent-alpha 상세')).not.toBeInTheDocument()
  })

  it('shows sentiment indicator for high rating agent', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvalStats),
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('agent-alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('agent-alpha'))

    expect(screen.getByText('우수')).toBeInTheDocument()
  })

  it('shows error state when API returns non-ok', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    render(<AgentEvalPanel />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch evaluation stats')).toBeInTheDocument()
    })
  })
})
