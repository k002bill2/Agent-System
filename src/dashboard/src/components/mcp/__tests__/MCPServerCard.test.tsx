import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MCPServerCard } from '../MCPServerCard'
import type { MCPServer } from '../../../stores/mcp'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Server: (props: Record<string, unknown>) => <svg data-testid="icon-server" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
  Square: (props: Record<string, unknown>) => <svg data-testid="icon-square" {...props} />,
  RotateCw: (props: Record<string, unknown>) => <svg data-testid="icon-rotate" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Code2: (props: Record<string, unknown>) => <svg data-testid="icon-github" {...props} />,
  Globe: (props: Record<string, unknown>) => <svg data-testid="icon-globe" {...props} />,
  Database: (props: Record<string, unknown>) => <svg data-testid="icon-database" {...props} />,
  Settings: (props: Record<string, unknown>) => <svg data-testid="icon-settings" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <svg data-testid="icon-chevron-down" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <svg data-testid="icon-chevron-up" {...props} />,
  Wrench: (props: Record<string, unknown>) => <svg data-testid="icon-wrench" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="icon-alert" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
}))

const makeServer = (overrides?: Partial<MCPServer>): MCPServer => ({
  id: 'srv-1',
  name: 'Test Server',
  type: 'filesystem',
  description: 'A test MCP server',
  status: 'stopped',
  tool_count: 0,
  tools: [],
  ...overrides,
})

describe('MCPServerCard', () => {
  const mockOnClick = vi.fn()
  const mockOnStart = vi.fn().mockResolvedValue(undefined)
  const mockOnStop = vi.fn().mockResolvedValue(undefined)
  const mockOnRestart = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders server name', () => {
    render(<MCPServerCard server={makeServer()} />)
    expect(screen.getByText('Test Server')).toBeInTheDocument()
  })

  it('renders server type', () => {
    render(<MCPServerCard server={makeServer({ type: 'github' })} />)
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('shows "Stopped" status label for stopped server', () => {
    render(<MCPServerCard server={makeServer({ status: 'stopped' })} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('shows "Running" status label for running server', () => {
    render(<MCPServerCard server={makeServer({ status: 'running' })} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows "Starting..." status label for starting server', () => {
    render(<MCPServerCard server={makeServer({ status: 'starting' })} />)
    expect(screen.getByText('Starting...')).toBeInTheDocument()
  })

  it('shows "Error" status label for error server', () => {
    render(<MCPServerCard server={makeServer({ status: 'error' })} />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('shows Start button for stopped server', () => {
    render(<MCPServerCard server={makeServer({ status: 'stopped' })} onStart={mockOnStart} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('shows Stop and Restart buttons for running server', () => {
    render(<MCPServerCard server={makeServer({ status: 'running' })} onStop={mockOnStop} onRestart={mockOnRestart} />)
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('Restart')).toBeInTheDocument()
  })

  it('calls onStart when Start button is clicked', async () => {
    render(<MCPServerCard server={makeServer({ status: 'stopped' })} onStart={mockOnStart} onClick={mockOnClick} />)
    fireEvent.click(screen.getByText('Start'))
    await waitFor(() => {
      expect(mockOnStart).toHaveBeenCalledTimes(1)
    })
    // Should not propagate to onClick
    expect(mockOnClick).not.toHaveBeenCalled()
  })

  it('calls onStop when Stop button is clicked', async () => {
    render(<MCPServerCard server={makeServer({ status: 'running' })} onStop={mockOnStop} onClick={mockOnClick} />)
    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => {
      expect(mockOnStop).toHaveBeenCalledTimes(1)
    })
    expect(mockOnClick).not.toHaveBeenCalled()
  })

  it('calls onClick when card is clicked', () => {
    render(<MCPServerCard server={makeServer()} onClick={mockOnClick} />)
    fireEvent.click(screen.getByText('Test Server'))
    expect(mockOnClick).toHaveBeenCalled()
  })

  it('shows error message for error server', () => {
    render(<MCPServerCard server={makeServer({ status: 'error', last_error: 'Connection refused' })} />)
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
  })

  it('shows PID for running server', () => {
    render(<MCPServerCard server={makeServer({ status: 'running', pid: 12345 })} />)
    expect(screen.getByText('12345')).toBeInTheDocument()
  })

  it('shows "No tools available" for running server with no tools', () => {
    render(<MCPServerCard server={makeServer({ status: 'running', tools: [] })} />)
    expect(screen.getByText('No tools available')).toBeInTheDocument()
  })

  it('shows tools section with expand/collapse', () => {
    const server = makeServer({
      status: 'running',
      tools: [
        { name: 'read_file', description: 'Read a file', input_schema: {} },
        { name: 'write_file', description: 'Write a file', input_schema: {} },
      ],
    })
    render(<MCPServerCard server={server} />)
    expect(screen.getByText('Tools (2)')).toBeInTheDocument()

    // Initially collapsed - tool names should not be visible
    expect(screen.queryByText('read_file')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('Tools (2)'))
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('write_file')).toBeInTheDocument()
  })

  it('shows Start button for error server', () => {
    render(<MCPServerCard server={makeServer({ status: 'error' })} onStart={mockOnStart} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })
})
