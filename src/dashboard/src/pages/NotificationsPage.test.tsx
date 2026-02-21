import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NotificationsPage } from './NotificationsPage'

vi.mock('../components/notifications', () => ({
  NotificationRuleEditor: () => <div data-testid="notification-rule-editor">NotificationRuleEditor</div>,
}))

describe('NotificationsPage', () => {
  it('renders page title', () => {
    render(<NotificationsPage />)
    expect(screen.getByText('Notification Settings')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<NotificationsPage />)
    expect(screen.getByText('Configure notification channels and rules for alerts')).toBeInTheDocument()
  })

  it('renders NotificationRuleEditor component', () => {
    render(<NotificationsPage />)
    expect(screen.getByTestId('notification-rule-editor')).toBeInTheDocument()
  })

  it('renders Bell icon in header', () => {
    const { container } = render(<NotificationsPage />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
