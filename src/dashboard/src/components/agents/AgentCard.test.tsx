import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { AgentCard } from './AgentCard'
import type { Agent } from './AgentCard'

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'AOS Orchestrator',
  status: 'available',
  endpoint: 'http://localhost:8000/agents/aos-orchestrator',
  totalTools: 8,
  availableTools: 5,
}

describe('AgentCard', () => {
  it('renders agent name and endpoint', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('AOS Orchestrator')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:8000/agents/aos-orchestrator')).toBeInTheDocument()
  })

  it('renders available status badge with green color', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText('사용 가능')).toBeInTheDocument()
    expect(screen.getByLabelText('상태: 사용 가능')).toBeInTheDocument()
  })

  it('renders busy status badge with yellow color', () => {
    const busyAgent = { ...mockAgent, status: 'busy' as const }
    render(<AgentCard agent={busyAgent} />)

    expect(screen.getByText('사용 중')).toBeInTheDocument()
  })

  it('renders offline status badge with red color', () => {
    const offlineAgent = { ...mockAgent, status: 'offline' as const }
    render(<AgentCard agent={offlineAgent} />)

    expect(screen.getByText('오프라인')).toBeInTheDocument()
  })

  it('renders tool count', () => {
    render(<AgentCard agent={mockAgent} />)

    expect(screen.getByText((_, el) => el?.textContent === '5 / 8')).toBeInTheDocument()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<AgentCard agent={mockAgent} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(mockAgent)
  })

  it('calls onSelect on Enter key press', () => {
    const onSelect = vi.fn()
    render(<AgentCard agent={mockAgent} onSelect={onSelect} />)

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(mockAgent)
  })

  it('calls onSelect on Space key press', () => {
    const onSelect = vi.fn()
    render(<AgentCard agent={mockAgent} onSelect={onSelect} />)

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith(mockAgent)
  })

  it('applies selected styles when isSelected', () => {
    render(<AgentCard agent={mockAgent} isSelected />)

    const card = screen.getByRole('button')
    expect(card).toHaveClass('border-primary-500')
  })

  it('does not apply selected styles when not selected', () => {
    render(<AgentCard agent={mockAgent} isSelected={false} />)

    const card = screen.getByRole('button')
    expect(card).not.toHaveClass('border-primary-500')
  })

  it('has proper aria-label for accessibility', () => {
    render(<AgentCard agent={mockAgent} />)

    const card = screen.getByRole('button')
    expect(card).toHaveAttribute(
      'aria-label',
      '에이전트 AOS Orchestrator, 상태: 사용 가능, 도구 5/8 사용 가능'
    )
  })

  it('renders tool progress bar', () => {
    render(<AgentCard agent={mockAgent} />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '5')
    expect(progressBar).toHaveAttribute('aria-valuemax', '8')
  })

  it('handles agent with zero tools', () => {
    const noTools = { ...mockAgent, totalTools: 0, availableTools: 0 }
    render(<AgentCard agent={noTools} />)

    expect(screen.getByText((_, el) => el?.textContent === '0 / 0')).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    render(<AgentCard agent={mockAgent} className="custom-class" />)

    const card = screen.getByRole('button')
    expect(card).toHaveClass('custom-class')
  })

  it('does not crash when onSelect is not provided', () => {
    render(<AgentCard agent={mockAgent} />)

    // Should not throw
    fireEvent.click(screen.getByRole('button'))
  })
})
