import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ContextWindowMeter } from '../ContextWindowMeter'
import type { ContextUsage } from '../ContextWindowMeter'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="icon-alert-circle" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <svg data-testid="icon-alert-triangle" {...props} />,
  Info: (props: Record<string, unknown>) => <svg data-testid="icon-info" {...props} />,
}))

const makeUsage = (overrides?: Partial<ContextUsage>): ContextUsage => ({
  current_tokens: 50000,
  max_tokens: 200000,
  percentage: 25.0,
  level: 'normal',
  provider: 'anthropic',
  model: 'claude-3.5-sonnet',
  warning_threshold: 70,
  critical_threshold: 90,
  system_tokens: 10000,
  message_tokens: 25000,
  task_tokens: 10000,
  rag_tokens: 5000,
  ...overrides,
})

describe('ContextWindowMeter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when sessionId is null', () => {
    const { container } = render(<ContextWindowMeter sessionId={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows loading text initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows "No data" when fetch returns 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('No data')).toBeInTheDocument()
    })
  })

  it('shows error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Context: Error')).toBeInTheDocument()
    })
  })

  it('renders full view with usage data', async () => {
    const usage = makeUsage()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Context Window')).toBeInTheDocument()
      expect(screen.getByText('25.0%')).toBeInTheDocument()
      expect(screen.getByText('50,000 tokens')).toBeInTheDocument()
      expect(screen.getByText('200,000 max')).toBeInTheDocument()
    })
  })

  it('shows provider and model info', async () => {
    const usage = makeUsage({ provider: 'google', model: 'gemini-pro' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('google / gemini-pro')).toBeInTheDocument()
    })
  })

  it('toggles breakdown details on button click', async () => {
    const usage = makeUsage()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Show breakdown')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Show breakdown'))
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('RAG')).toBeInTheDocument()
    expect(screen.getByText('Hide breakdown')).toBeInTheDocument()
  })

  it('shows warning message for warning level', async () => {
    const usage = makeUsage({ level: 'warning', percentage: 75 })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Context usage is getting high. Consider completing the current task.')).toBeInTheDocument()
    })
  })

  it('shows critical message for critical level', async () => {
    const usage = makeUsage({ level: 'critical', percentage: 95 })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Context limit approaching! Complete or start a new session.')).toBeInTheDocument()
    })
  })

  it('renders compact view when compact prop is true', async () => {
    const usage = makeUsage({ percentage: 50 })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" compact refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
    // Full view elements should not be present
    expect(screen.queryByText('Context Window')).not.toBeInTheDocument()
    expect(screen.queryByText('Show breakdown')).not.toBeInTheDocument()
  })

  it('does not show warning message for normal level', async () => {
    const usage = makeUsage({ level: 'normal', percentage: 25 })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    })
    render(<ContextWindowMeter sessionId="session-1" refreshInterval={999999} />)
    await waitFor(() => {
      expect(screen.getByText('Context Window')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Context usage is getting high/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Context limit approaching/)).not.toBeInTheDocument()
  })
})
