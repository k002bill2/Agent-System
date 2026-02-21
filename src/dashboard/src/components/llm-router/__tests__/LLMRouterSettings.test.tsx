import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LLMRouterSettings } from '../LLMRouterSettings'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    Server: icon('server'),
    Plus: icon('plus'),
    Trash2: icon('trash'),
    RefreshCw: icon('refresh'),
    CheckCircle: icon('check-circle'),
    XCircle: icon('x-circle'),
    AlertTriangle: icon('alert-triangle'),
    Activity: icon('activity'),
    Loader2: icon('loader'),
    ToggleLeft: icon('toggle-left'),
    ToggleRight: icon('toggle-right'),
    ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'),
    Zap: icon('zap'),
    DollarSign: icon('dollar'),
    Clock: icon('clock'),
  }
})

const mockProvider = (overrides?: Record<string, unknown>) => ({
  id: 'prov-1',
  provider: 'anthropic' as const,
  model: 'claude-3-opus',
  api_key: null,
  base_url: null,
  enabled: true,
  priority: 1,
  max_retries: 3,
  timeout_seconds: 30,
  cost_per_1k_input: 0.015,
  cost_per_1k_output: 0.075,
  status: 'healthy' as const,
  consecutive_failures: 0,
  last_health_check: null,
  ...overrides,
})

const mockConfig = (overrides?: Record<string, unknown>) => ({
  strategy: 'priority' as const,
  health_check_interval_seconds: 60,
  auto_failover: true,
  max_failover_attempts: 3,
  cooldown_seconds: 30,
  enable_fallback: true,
  fallback_providers: [],
  ...overrides,
})

const mockStats = (overrides?: Record<string, unknown>) => ({
  total_requests: 100,
  successful_requests: 95,
  failed_requests: 5,
  fallback_count: 2,
  provider_usage: {},
  average_latency_ms: 250,
  total_cost: 1.5,
  ...overrides,
})

describe('LLMRouterSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))
    render(<LLMRouterSettings />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load LLM Router data')).toBeInTheDocument()
    })
  })

  it('renders title and stats after loading', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [mockProvider()] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('LLM Auto-Switch')).toBeInTheDocument()
    })

    expect(screen.getByText('100')).toBeInTheDocument() // total requests
    expect(screen.getByText('95.0%')).toBeInTheDocument() // success rate
    expect(screen.getByText('250ms')).toBeInTheDocument() // avg latency
    expect(screen.getByText('2')).toBeInTheDocument() // fallbacks
  })

  it('renders provider list with provider name', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [mockProvider()] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument()
    })
    expect(screen.getByText('claude-3-opus')).toBeInTheDocument()
    expect(screen.getByText('Priority: 1')).toBeInTheDocument()
  })

  it('shows empty state when no providers', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('No providers configured')).toBeInTheDocument()
    })
  })

  it('shows disabled badge for disabled provider', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [mockProvider({ enabled: false })] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })
  })

  it('renders strategy buttons from config', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Priority (Highest First)')).toBeInTheDocument()
    })
    expect(screen.getByText('Round Robin')).toBeInTheDocument()
    expect(screen.getByText('Least Cost')).toBeInTheDocument()
  })

  it('calls health check on button click', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/health')) return { ok: true, json: async () => [] } as Response
      if (u.includes('/providers')) return { ok: true, json: async () => [] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Health Check')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Health Check'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/llm-router/health')
      )
    })
  })

  it('calls initialize on button click', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url, opts) => {
      const u = String(url)
      if (u.includes('/initialize') && (opts as RequestInit)?.method === 'POST') return { ok: true, json: async () => ({}) } as Response
      if (u.includes('/providers')) return { ok: true, json: async () => [] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Initialize')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Initialize'))
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/llm-router/initialize'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('expands provider details on click', async () => {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/providers')) return { ok: true, json: async () => [mockProvider()] } as Response
      if (u.includes('/config')) return { ok: true, json: async () => mockConfig() } as Response
      if (u.includes('/stats')) return { ok: true, json: async () => mockStats() } as Response
      return { ok: false } as Response
    })

    render(<LLMRouterSettings />)
    await waitFor(() => {
      expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument()
    })

    // Click the provider row to expand
    fireEvent.click(screen.getByText('Anthropic (Claude)'))
    await waitFor(() => {
      expect(screen.getByText('Timeout:')).toBeInTheDocument()
      expect(screen.getByText('30s')).toBeInTheDocument()
      expect(screen.getByText('Retries:')).toBeInTheDocument()
      expect(screen.getByText('Disable')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })
})
