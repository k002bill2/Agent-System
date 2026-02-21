import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TasksPage } from './TasksPage'

vi.mock('../components/ClaudeCodeTasks', () => ({
  ClaudeCodeTasks: () => <div data-testid="claude-code-tasks">ClaudeCodeTasks</div>,
}))

describe('TasksPage', () => {
  it('renders ClaudeCodeTasks component', () => {
    render(<TasksPage />)
    expect(screen.getByTestId('claude-code-tasks')).toBeInTheDocument()
  })

  it('has correct layout classes', () => {
    const { container } = render(<TasksPage />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('flex-1', 'flex', 'flex-col', 'overflow-hidden', 'min-w-0')
  })
})
