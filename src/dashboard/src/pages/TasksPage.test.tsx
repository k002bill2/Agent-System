import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TasksPage } from './TasksPage'

vi.mock('./SessionsPage', () => ({
  SessionsPage: () => <div data-testid="sessions-page">SessionsPage</div>,
}))

describe('TasksPage', () => {
  it('renders SessionsPage (redirect)', () => {
    render(<TasksPage />)
    expect(screen.getByTestId('sessions-page')).toBeInTheDocument()
  })
})
