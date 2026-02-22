import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageProgressBar } from '../UsageProgressBar'

// No lucide-react icons used in this component, no mock needed

const defaultProps = {
  label: 'Current Session',
  percentUsed: 50,
  resetInHours: 3,
  resetInMinutes: 30,
}

describe('UsageProgressBar', () => {
  it('renders the label', () => {
    render(<UsageProgressBar {...defaultProps} />)
    expect(screen.getByText('Current Session')).toBeInTheDocument()
  })

  it('shows the percentage', () => {
    render(<UsageProgressBar {...defaultProps} percentUsed={65} />)
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('formats reset time with hours and minutes', () => {
    render(<UsageProgressBar {...defaultProps} resetInHours={3} resetInMinutes={30} />)
    expect(screen.getByText('3h 30m reset')).toBeInTheDocument()
  })

  it('formats reset time with days when >= 24 hours', () => {
    render(<UsageProgressBar {...defaultProps} resetInHours={50} resetInMinutes={0} />)
    expect(screen.getByText('2d 2h reset')).toBeInTheDocument()
  })

  it('formats reset time with minutes only when hours is 0', () => {
    render(<UsageProgressBar {...defaultProps} resetInHours={0} resetInMinutes={45} />)
    expect(screen.getByText('45m reset')).toBeInTheDocument()
  })

  it('shows description when provided', () => {
    render(<UsageProgressBar {...defaultProps} description="Extra info" />)
    expect(screen.getByText('Extra info')).toBeInTheDocument()
  })

  it('shows tooltip when showInfo and tooltip are provided', () => {
    render(<UsageProgressBar {...defaultProps} showInfo tooltip="Helpful info" />)
    expect(screen.getByText('Helpful info')).toBeInTheDocument()
  })

  it('does not show tooltip icon when showInfo is false', () => {
    const { container } = render(<UsageProgressBar {...defaultProps} tooltip="Hidden" />)
    expect(container.querySelector('svg.cursor-help')).not.toBeInTheDocument()
  })

  it('applies red color for 90%+ usage', () => {
    render(<UsageProgressBar {...defaultProps} percentUsed={95} />)
    const percentText = screen.getByText('95%')
    expect(percentText.className).toContain('text-red')
  })

  it('applies yellow color for 70-89% usage', () => {
    render(<UsageProgressBar {...defaultProps} percentUsed={75} />)
    const percentText = screen.getByText('75%')
    expect(percentText.className).toContain('text-yellow')
  })

  it('applies normal color for < 70% usage', () => {
    render(<UsageProgressBar {...defaultProps} percentUsed={40} />)
    const percentText = screen.getByText('40%')
    expect(percentText.className).toContain('text-gray')
  })
})
