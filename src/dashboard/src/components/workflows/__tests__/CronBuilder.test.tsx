import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CronBuilder } from '../CronBuilder'

describe('CronBuilder', () => {
  const defaultProps = {
    value: '0 * * * *',
    onChange: vi.fn(),
  }

  it('renders presets', () => {
    render(<CronBuilder {...defaultProps} />)
    expect(screen.getByText('매시간')).toBeInTheDocument()
    expect(screen.getByText('매일 자정')).toBeInTheDocument()
    expect(screen.getByText('매주 월요일')).toBeInTheDocument()
  })

  it('calls onChange when preset is clicked', () => {
    const onChange = vi.fn()
    render(<CronBuilder value="0 * * * *" onChange={onChange} />)
    fireEvent.click(screen.getByText('매일 9시'))
    expect(onChange).toHaveBeenCalledWith('0 9 * * *')
  })

  it('renders 5 cron field inputs', () => {
    render(<CronBuilder {...defaultProps} />)
    expect(screen.getByText('Minute')).toBeInTheDocument()
    expect(screen.getByText('Hour')).toBeInTheDocument()
    expect(screen.getByText('Day')).toBeInTheDocument()
    expect(screen.getByText('Month')).toBeInTheDocument()
    expect(screen.getByText('Weekday')).toBeInTheDocument()
  })

  it('shows human-readable preview', () => {
    render(<CronBuilder value="0 * * * *" onChange={vi.fn()} />)
    expect(screen.getByText('매시 정각')).toBeInTheDocument()
  })

  it('highlights active preset', () => {
    render(<CronBuilder value="0 9 * * *" onChange={vi.fn()} />)
    const btn = screen.getByText('매일 9시')
    expect(btn.className).toContain('primary')
  })

  it('calls onChange when field input changes', () => {
    const onChange = vi.fn()
    render(<CronBuilder value="0 * * * *" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith('30 * * * *')
  })
})
