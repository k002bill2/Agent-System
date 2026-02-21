import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MCPStatsPanel } from '../MCPStatsPanel'
import type { MCPManagerStats } from '../../../stores/mcp'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Server: (props: Record<string, unknown>) => <svg data-testid="icon-server" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
  Wrench: (props: Record<string, unknown>) => <svg data-testid="icon-wrench" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Github: (props: Record<string, unknown>) => <svg data-testid="icon-github" {...props} />,
  Globe: (props: Record<string, unknown>) => <svg data-testid="icon-globe" {...props} />,
  Database: (props: Record<string, unknown>) => <svg data-testid="icon-database" {...props} />,
  Settings: (props: Record<string, unknown>) => <svg data-testid="icon-settings" {...props} />,
}))

const makeStats = (overrides?: Partial<MCPManagerStats>): MCPManagerStats => ({
  total_servers: 5,
  running_servers: 3,
  total_tools: 15,
  servers_by_type: { filesystem: 2, github: 1, playwright: 1, custom: 1 },
  ...overrides,
})

describe('MCPStatsPanel', () => {
  it('renders nothing when stats is null and not loading', () => {
    const { container } = render(<MCPStatsPanel stats={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows loading skeleton when isLoading is true', () => {
    const { container } = render(<MCPStatsPanel stats={null} isLoading={true} />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders "MCP Manager Stats" heading', () => {
    render(<MCPStatsPanel stats={makeStats()} />)
    expect(screen.getByText('MCP Manager Stats')).toBeInTheDocument()
  })

  it('displays total servers count', () => {
    render(<MCPStatsPanel stats={makeStats({ total_servers: 8 })} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Total Servers')).toBeInTheDocument()
  })

  it('displays running servers count', () => {
    render(<MCPStatsPanel stats={makeStats({ running_servers: 4 })} />)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('displays total tools count', () => {
    render(<MCPStatsPanel stats={makeStats({ total_tools: 20 })} />)
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('Total Tools')).toBeInTheDocument()
  })

  it('renders server type distribution section', () => {
    render(<MCPStatsPanel stats={makeStats()} />)
    expect(screen.getByText('Servers by Type')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('playwright')).toBeInTheDocument()
    expect(screen.getByText('custom')).toBeInTheDocument()
  })

  it('shows correct counts in server type distribution', () => {
    render(<MCPStatsPanel stats={makeStats({ servers_by_type: { filesystem: 3, github: 2 }, total_servers: 5, running_servers: 1 })} />)
    // The filesystem type row: label + bar + count=3
    // running_servers=1, so stat card shows "1" not "3"
    const allThrees = screen.getAllByText('3')
    expect(allThrees.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not render type distribution when servers_by_type is empty', () => {
    render(<MCPStatsPanel stats={makeStats({ servers_by_type: {} })} />)
    expect(screen.queryByText('Servers by Type')).not.toBeInTheDocument()
  })
})
