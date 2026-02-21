import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ActivityPage } from './ActivityPage'

vi.mock('../components/ClaudeCodeActivity', () => ({
  ClaudeCodeActivity: () => <div data-testid="claude-code-activity">ClaudeCodeActivity</div>,
}))

describe('ActivityPage', () => {
  it('renders ClaudeCodeActivity component', () => {
    render(<ActivityPage />)
    expect(screen.getByTestId('claude-code-activity')).toBeInTheDocument()
  })

  it('has correct layout classes', () => {
    const { container } = render(<ActivityPage />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('flex-1', 'flex', 'flex-col', 'overflow-hidden', 'min-w-0')
  })
})
