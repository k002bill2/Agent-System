import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { AgentCard } from '../AgentCard'
import type { Agent } from '../../stores/agents'

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A test agent for unit testing',
  category: 'development',
  status: 'available',
  specializations: ['React', 'TypeScript', 'Testing'],
  capabilities: [
    { name: 'Code Review', description: 'Review code changes', keywords: ['review'], priority: 1 },
    { name: 'Unit Testing', description: 'Write unit tests', keywords: ['test'], priority: 2 },
  ],
  total_tasks_completed: 42,
  success_rate: 0.95,
  estimated_cost_per_task: 0.0125,
  avg_execution_time_ms: 5000,
  is_available: true,
}

describe('AgentCard', () => {
  it('renders agent name and description', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('Test Agent')).toBeInTheDocument()
    expect(screen.getByText('A test agent for unit testing')).toBeInTheDocument()
  })

  it('renders category', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('development')).toBeInTheDocument()
  })

  it('renders status', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('available')).toBeInTheDocument()
  })

  it('renders specializations', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Testing')).toBeInTheDocument()
  })

  it('truncates specializations beyond 3', () => {
    const agentWithManySpecs = {
      ...mockAgent,
      specializations: ['React', 'TypeScript', 'Testing', 'Node.js', 'Python'],
    }
    render(<AgentCard agent={agentWithManySpecs} />)

    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders stats correctly', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText('$0.013')).toBeInTheDocument()
  })

  it('renders capabilities', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('Capabilities (2)')).toBeInTheDocument()
    expect(screen.getByText('• Code Review')).toBeInTheDocument()
    expect(screen.getByText('• Unit Testing')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<AgentCard agent={mockAgent} onClick={onClick} />)

    fireEvent.click(screen.getByText('Test Agent').closest('div')!)
    expect(onClick).toHaveBeenCalled()
  })

  it('applies selected styles when isSelected', () => {
    const { container } = render(<AgentCard agent={mockAgent} isSelected />)

    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('border-primary-500')
  })

  it('does not apply selected styles when not selected', () => {
    const { container } = render(<AgentCard agent={mockAgent} isSelected={false} />)

    const card = container.firstChild as HTMLElement
    expect(card).not.toHaveClass('border-primary-500')
  })

  it('renders different status colors', () => {
    const busyAgent = { ...mockAgent, status: 'busy' as const }
    render(<AgentCard agent={busyAgent} />)

    expect(screen.getByText('busy')).toBeInTheDocument()
  })

  it('renders different categories', () => {
    const orchestrationAgent = { ...mockAgent, category: 'orchestration' as const }
    render(<AgentCard agent={orchestrationAgent} />)

    expect(screen.getByText('orchestration')).toBeInTheDocument()
  })

  it('handles agent with no specializations', () => {
    const agentNoSpecs = { ...mockAgent, specializations: [] }
    render(<AgentCard agent={agentNoSpecs} />)

    // Should not crash and still render other info
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('handles agent with no capabilities', () => {
    const agentNoCaps = { ...mockAgent, capabilities: [] }
    render(<AgentCard agent={agentNoCaps} />)

    expect(screen.queryByText('Capabilities')).not.toBeInTheDocument()
  })
})
